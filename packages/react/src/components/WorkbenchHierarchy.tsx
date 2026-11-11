import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { buildWorkbenchNodeCapability, type WorkbenchHierarchyRow } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { CommandMenu, type CommandMenuCommand } from "./ui/command-menu-list";
import { useCommandMenu } from "./ui/command-menu";
import { Popover, PopoverContent, PopoverTrigger, getPortalTheme } from "./ui/Popover";
import { nodeToolGroup } from "./node-tool-model";
import { WorkbenchIcon } from "./WorkbenchIcon";

/** Which rows a keyboard user can reach: the tree in visual order, after search and collapse. */
interface VisibleRow {
  row: WorkbenchHierarchyRow;
  expanded: boolean;
}

const SELECT_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End", "ArrowLeft", "ArrowRight", "Enter", " "]);

export function WorkbenchHierarchy({ context }: { context: ResolvedWorkbenchContext }) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  /** The row whose menu is open, and the selection the panel showed before that row was previewed. */
  const [nodeMenu, setNodeMenu] = useState<string | null>(null);
  const [rowActionsOpen, setRowActionsOpen] = useState<string | null>(null);
  const menu = useCommandMenu();
  const id = useId();
  const elementRef = useRef<HTMLDivElement | null>(null);
  const t = context.i18n.t;
  const selection = context.selection;
  const { hierarchy } = context.model;
  const rows = useMemo(() => new Map(hierarchy.rows.map((row) => [row.id, row])), [hierarchy.rows]);
  const maxDepth = hierarchy.rows.reduce((depth, row) => Math.max(depth, row.depth), 1);
  const search = query.trim().toLocaleLowerCase();
  const matches = useMemo(() => {
    const result = new Set<string>();
    for (const row of rows.values()) {
      if (!row.label.toLocaleLowerCase().includes(search)) continue;
      let ancestor: WorkbenchHierarchyRow | undefined = row;
      while (ancestor && !result.has(ancestor.id)) {
        result.add(ancestor.id);
        ancestor = ancestor.parentId ? rows.get(ancestor.parentId) : undefined;
      }
    }
    return result;
  }, [rows, search]);
  const visible = useMemo(() => {
    const list: VisibleRow[] = [];
    const visit = (row: WorkbenchHierarchyRow) => {
      if (search && !matches.has(row.id)) return;
      const expanded = !collapsed.has(row.id) || Boolean(search);
      list.push({ row, expanded });
      if (!expanded) return;
      for (const childId of row.childIds) {
        const child = rows.get(childId);
        if (child) visit(child);
      }
    };
    for (const root of hierarchy.roots) visit(root);
    return list;
  }, [hierarchy.roots, rows, collapsed, search, matches]);
  const visibleIds = visible.map((entry) => entry.row.id);
  // Rows join the tab order once a keyboard user picks one; before that every row stays reachable
  // as it always was, and afterwards the tree behaves as a single tab stop.
  const tabStop = focusId && visibleIds.includes(focusId) ? focusId : null;
  const pendingFocus = useRef<string | null>(null);
  const rowElements = useRef(new Map<string, HTMLButtonElement>());
  const panelElements = useRef(new Map<string, HTMLElement>());
  /** A row reached by pointer must not turn the whole tree into a single tab stop. */
  const pointerFocus = useRef(false);
  /** The row whose menu is open, readable from listeners that outlive a render. */
  const openRowMenuRef = useRef<string | null>(null);
  const selectionKey = JSON.stringify(selection.nodeIds);
  const previousSelection = useRef(selectionKey);

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    rowElements.current.get(target)?.focus();
  }, [focusId, visibleIds]);

  // Roving focus is UI memory: when its row moves or vanishes, the selection or the first row
  // takes over instead of leaving the tree without a tab stop.
  useLayoutEffect(() => {
    if (!focusId || visibleIds.includes(focusId)) return;
    setFocusId(selection.nodeId && visibleIds.includes(selection.nodeId) ? selection.nodeId : visibleIds[0] ?? null);
  }, [focusId, selection.nodeId, visibleIds]);

  useEffect(() => {
    if (previousSelection.current === selectionKey) return;
    previousSelection.current = selectionKey;
    const selected = [...rows.values()].filter((row) => row.selected);
    if (selected.some((row) => !matches.has(row.id))) setQuery("");
    setCollapsed((current) => {
      const next = new Set(current);
      for (const row of selected) {
        let parent = row.parentId ? rows.get(row.parentId) : undefined;
        while (parent) {
          next.delete(parent.id);
          parent = parent.parentId ? rows.get(parent.parentId) : undefined;
        }
      }
      return next;
    });
  }, [selectionKey, rows, matches]);

  // Escape belongs to the tree while focus is inside it: cancel browsing here, so the workbench
  // only sees Escape (as "clear selection") once nothing in the tree claims it.
  useEffect(() => {
    const hierarchy = elementRef.current;
    if (!hierarchy) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "Escape" || openRowMenuRef.current) return;
      if (!(event.target instanceof HTMLElement) || !hierarchy?.contains(event.target)) return;
      if (!event.target.closest(".ek-workbench__tree-row")) return;
      event.preventDefault();
      event.stopPropagation();
      setFocusId(null);
      event.target.blur();
    }
    hierarchy.addEventListener("keydown", onKeyDown);
    return () => hierarchy.removeEventListener("keydown", onKeyDown);
  });

  // The row menu is a surface in its own right: a press outside it closes it, even when the press
  // lands on something inert that never takes focus. A press inside it — including one that happens
  // before the portaled panel is published to us — leaves it alone.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const rowId = openRowMenuRef.current;
      if (!rowId || !(event.target instanceof Node)) return;
      const panel = panelElements.current.get(rowId);
      if (panel && panel.contains(event.target)) return;
      // Our own menu, or the tree row that owns it: both keep the menu open.
      if (event.target instanceof Element && event.target.closest('[role="menu"], .ek-workbench__tree-row')) return;
      closeRowMenu({ restore: false });
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  });

  function toggle(rowId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function focusRow(rowId: string) {
    setFocusId(rowId);
    if (document.activeElement === rowElements.current.get(rowId)) return;
    pendingFocus.current = rowId;
  }

  function moveFocus(where: 1 | -1 | "first" | "last") {
    const count = visibleIds.length;
    if (count === 0) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.treeRowId : undefined;
    const current = active ? visibleIds.indexOf(active) : -1;
    const index = where === "first" ? 0
      : where === "last" ? count - 1
        : current < 0 ? (where === 1 ? 0 : count - 1)
          : (current + where + count) % count;
    focusRow(visibleIds[index]!);
  }

  function selectRow(row: WorkbenchHierarchyRow, mode: "replace" | "add" | "remove" | "toggle") {
    // Clicking a row makes it the primary node, so whatever acts on the selection acts on it.
    // A row that leaves the selection (ctrl/alt) cannot stay primary: the command drops it.
    context.dispatch({
      type: "select-nodes",
      mode,
      nodeIds: [row.id],
      primaryNodeId: mode === "toggle" || mode === "remove" ? undefined : row.id
    });
  }

  /**
   * The row a menu belongs to is what the menu describes and acts on.
   *
   * Opening a menu changes nothing the user can see outside it: the scene selection, the toolbar,
   * and the inspector keep describing what they described before. The menu offers the viewport's
   * node commands, each named after this row, so acting on it never needs the row to be selected.
   */
  function openRowMenu(row: WorkbenchHierarchyRow) {
    // The row keeps DOM focus while its menu is open, so keyboard focus must not fall back to the
    // roving tab stop.
    setFocusId(row.id);
    setRowActionsOpen(row.id);
    openRowMenuRef.current = row.id;
    setNodeMenu(row.id);
    menu.openMenu(row.id);
  }

  function closeRowMenu({ restore = true }: { restore?: boolean } = {}) {
    const rowId = nodeMenu;
    openRowMenuRef.current = null;
    setRowActionsOpen(null);
    setNodeMenu(null);
    menu.closeMenu({ restore: false });
    // The menu is keyboard-reachable from its row, so closing it hands focus back there.
    if (restore && rowId) {
      const rowElement = rowElements.current.get(rowId);
      if (rowElement) rowElement.focus();
    }
  }

  /**
   * Keys that move through the tree, reveal a branch, select a row, or open its menu belong here.
   * They are consumed before the workbench sees them, so the scene shortcuts one press can also
   * match never run on top of the browsing the user asked for.
   */
  function handleRowKey(event: React.KeyboardEvent<HTMLButtonElement>, row: WorkbenchHierarchyRow, expanded: boolean) {
    // Alt belongs to other layers; anything else was already consumed by a layer above the tree.
    if (event.altKey || (event.defaultPrevented && !SELECT_KEYS.has(event.key) && event.key !== "ContextMenu")) return;
    if (!SELECT_KEYS.has(event.key) && event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
    event.preventDefault();
    event.stopPropagation();
    switch (event.key) {
      case "ArrowDown": return moveFocus(1);
      case "ArrowUp": return moveFocus(-1);
      case "Home": return moveFocus("first");
      case "End": return moveFocus("last");
      case "ArrowRight":
        if (row.childIds.length > 0 && !expanded) return toggle(row.id);
        return moveFocus(1);
      case "ArrowLeft":
        if (row.childIds.length > 0 && expanded) return toggle(row.id);
        if (row.parentId) focusRow(row.parentId);
        return;
      case "Enter":
      case " ":
        return selectRow(row, event.ctrlKey || event.metaKey ? "toggle" : event.shiftKey ? "add" : "replace");
      default: return openRowMenu(row);
    }
  }

  function renderRow({ row, expanded }: VisibleRow): ReactNode {
    const open = rowActionsOpen === row.id;
    const moreLabel = t("reactWorkbench.leftPanel.hierarchy.more", { label: row.label });
    return (
      <li key={row.id} role="none">
        <Popover
          open={open}
          onOpenChange={(next) => {
            // The menu only opens from its row; it closes when a command runs, when the user
            // dismisses it, or when focus leaves it.
            if (!next) closeRowMenu();
          }}
        >
          <div className="ek-workbench__tree-entry" style={{ "--ek-workbench-tree-depth": row.depth } as CSSProperties}>
            {row.childIds.length > 0 ? (
              <button
                type="button"
                className="ek-workbench__tree-toggle"
                aria-label={t(`reactWorkbench.leftPanel.hierarchy.${expanded ? "collapse" : "expand"}`, { label: row.label })}
                aria-expanded={expanded}
                disabled={Boolean(search)}
                onClick={() => toggle(row.id)}
              ><span aria-hidden="true">{expanded ? "\u25be" : "\u25b8"}</span></button>
            ) : <span className="ek-workbench__tree-toggle-space" />}
            <button
              type="button"
              data-ek-discard-draft
              className="ek-workbench__tree-row"
              ref={(node) => {
                if (node) rowElements.current.set(row.id, node);
                else rowElements.current.delete(row.id);
              }}
              role="treeitem"
              aria-selected={row.selected}
              aria-expanded={row.childIds.length > 0 ? expanded : undefined}
              aria-level={row.depth + 1}
              aria-label={row.label}
              aria-haspopup="menu"
              aria-keyshortcuts="ContextMenu Shift+F10"
              tabIndex={tabStop === null || tabStop === row.id ? 0 : -1}
              data-tree-row-id={row.id}
              data-selected={row.selected ? "true" : undefined}
              data-severity={row.highestProblemSeverity ?? undefined}
              title={row.label}
              onFocus={() => {
                if (!pointerFocus.current) setFocusId(row.id);
              }}
              onClick={(event) => selectRow(
                row,
                event.altKey ? "remove" : event.ctrlKey || event.metaKey ? "toggle" : event.shiftKey ? "add" : "replace"
              )}
              onDoubleClick={() => {
                context.dispatch({ type: "select-node", nodeId: row.id });
                context.frameSelected();
              }}
              onKeyDown={(event) => handleRowKey(event, row, expanded)}
            >
              <span>{row.label}</span>
              <small>{row.kind}{row.problemCount ? ` \u00b7 ${row.problemCount}` : ""}</small>
            </button>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="ek-workbench__tree-more"
                aria-label={moreLabel}
                title={moreLabel}
                aria-haspopup="menu"
                aria-expanded={open}
                data-state={open ? "open" : "closed"}
                // Pressing the button must not move focus off the row the menu acts for.
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (open) closeRowMenu();
                  else openRowMenu(row);
                }}
              >
                <WorkbenchIcon name="more" />
              </button>
            </PopoverTrigger>
          </div>
          {open && menu.open === row.id ? (
            <RowMenu
              context={context}
              row={row}
              nodeId={row.id}
              idPrefix={`${id}-${row.id}`}
              panelRef={(node) => {
                menu.panelRef(row.id)(node);
                if (node) panelElements.current.set(row.id, node);
                else panelElements.current.delete(row.id);
              }}
              roving={menu.roving}
              onMoveFocus={menu.moveFocus}
              onActivate={(commandKey) => menu.focusItem(panelElements.current.get(row.id) ?? null, commandKey)}
              onCommand={(run) => {
                // The command already named this row, so closing the menu only has to hand focus back.
                closeRowMenu();
                run();
              }}
              onDismiss={closeRowMenu}
            />
          ) : null}
        </Popover>
        {row.kind === "imported" && row.selected ? context.model.problems.items
          .filter((problem) => row.problemIds.includes(problem.id))
          .map((problem) => (
            <p key={problem.id} className="ek-workbench__tree-problem" data-severity={problem.severity}>
              {problem.detailDescriptor ? t(problem.detailDescriptor) : problem.detail ?? (problem.titleDescriptor ? t(problem.titleDescriptor) : problem.title)}
            </p>
          )) : null}
        {!search && expanded && row.childIds.length > 0 ? (
          <ul role="group">
            {row.childIds
              .map((childId) => rows.get(childId))
              .filter((child): child is WorkbenchHierarchyRow => Boolean(child))
              .map((child) => renderRow({ row: child, expanded: Boolean(search) || !collapsed.has(child.id) }))}
          </ul>
        ) : null}
      </li>
    );
  }

  return (
    <div className="ek-workbench__hierarchy" id={id} ref={elementRef}>
      <label className="ek-workbench__hierarchy-search">
        <span>{t("reactWorkbench.leftPanel.hierarchy.search")}</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {hierarchy.empty ? (
        <p className="ek-workbench__empty">{t("reactWorkbench.leftPanel.hierarchy.empty")}</p>
      ) : search && matches.size === 0 ? (
        <p className="ek-workbench__empty" role="status">{t("reactWorkbench.leftPanel.hierarchy.noResults")}</p>
      ) : (
        <ul
          id={`${id}-tree`}
          className="ek-workbench__tree"
          role="tree"
          aria-multiselectable="true"
          style={{ "--ek-workbench-tree-max-depth": maxDepth } as CSSProperties}
          onPointerDown={() => { pointerFocus.current = true; }}
          onPointerUp={() => { pointerFocus.current = false; }}
        >
          {visible.filter((entry) => !entry.row.parentId || search).map(renderRow)}
        </ul>
      )}
    </div>
  );
}

/**
 * One row's node commands: the same list, capabilities, and disabled reasons as the viewport's
 * node menu, aimed at this row rather than at whatever the scene selection happened to be.
 */
function RowMenu({ context, row, nodeId, idPrefix, panelRef, roving, onMoveFocus, onActivate, onCommand, onDismiss }: {
  context: ResolvedWorkbenchContext;
  row: WorkbenchHierarchyRow;
  /** The row the menu acts on, named in every command it issues. */
  nodeId: string;
  idPrefix: string;
  panelRef(node: HTMLDivElement | null): void;
  roving: string | null;
  onMoveFocus(panel: HTMLElement | null, where: 1 | -1 | "first" | "last"): void;
  onActivate(commandKey: string): void;
  onCommand(run: () => void): void;
  onDismiss(): void;
}) {
  const t = context.i18n.t;
  // The menu belongs to this row, so its commands answer for this row, not for the scene selection.
  const capability = buildWorkbenchNodeCapability(context.editor.getSnapshot(), nodeId);
  const group = nodeToolGroup(context, {
    includeShortcuts: false,
    includeSceneCommands: false,
    nodeId,
    target: capability
  });

  const commands: CommandMenuCommand[] = group.commands.map((command) => ({
    key: command.key,
    label: t(command.label),
    title: t(command.title),
    icon: <WorkbenchIcon name={command.icon} />,
    disabled: command.disabled,
    disabledReason: command.disabledReason,
    kind: group.kind,
    onClick: () => onCommand(command.onClick)
  }));
  const label = t("reactWorkbench.leftPanel.hierarchy.more", { label: row.label });
  return (
    <Popover open onOpenChange={(next) => { if (!next) onDismiss(); }}>
      <PopoverContent
        // Focus belongs to the row that opened the menu, so Radix neither takes nor returns it.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onFocusOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        ref={panelRef}
        className="ek-workbench__menu ek-workbench__tree-menu"
        data-state="open"
        style={getPortalTheme(document.getElementById(`${idPrefix}-more`) ?? null)}
        onKeyDown={(event) => {
          if (event.defaultPrevented) return;
          if (event.key === "Escape") {
            event.preventDefault();
            onDismiss();
          } else if (event.key === "Tab") {
            onDismiss();
          }
        }}
      >
        <CommandMenu
          group={{ key: "node", label, kind: group.kind, commands }}
          idPrefix={`${idPrefix}-menu`}
          onMoveFocus={onMoveFocus}
          onActivate={onActivate}
          roving={roving}
          onEscape={onDismiss}
          onTab={onDismiss}
          // The row keeps focus while its menu is open, so the menu has to claim focus itself.
          claimEntry
        />
      </PopoverContent>
    </Popover>
  );
}
