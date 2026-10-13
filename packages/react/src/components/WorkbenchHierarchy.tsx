import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { WorkbenchHierarchyRow } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";

export function WorkbenchHierarchy({ context }: { context: ResolvedWorkbenchContext }) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const { hierarchy } = context.model;
  const t = context.i18n.t;
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
  const selectionKey = JSON.stringify(context.model.selection.nodeIds);
  const previousSelection = useRef(selectionKey);
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

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderRow(row: WorkbenchHierarchyRow): ReactNode {
    if (search && !matches.has(row.id)) return null;
    const expanded = Boolean(search) || !collapsed.has(row.id);
    return (
      <li key={row.id}>
        <div className="ek-workbench__tree-entry" style={{ "--ek-workbench-tree-depth": row.depth } as CSSProperties}>
          {row.childIds.length > 0 ? (
            <button
              type="button"
              className="ek-workbench__tree-toggle"
              aria-label={t(`reactWorkbench.leftPanel.hierarchy.${expanded ? "collapse" : "expand"}`, { label: row.label })}
              aria-expanded={expanded}
              disabled={Boolean(search)}
              onClick={() => toggle(row.id)}
            ><span aria-hidden="true">{expanded ? "▾" : "▸"}</span></button>
          ) : <span className="ek-workbench__tree-toggle-space" />}
          <button
            type="button"
            data-ek-discard-draft
            className="ek-workbench__tree-row"
            aria-pressed={row.selected}
            data-selected={row.selected ? "true" : undefined}
            data-severity={row.highestProblemSeverity ?? undefined}
            title={row.label}
            onClick={(event) => context.dispatch({
              type: "select-nodes",
              mode: event.altKey ? "remove" : event.ctrlKey || event.metaKey ? "toggle" : event.shiftKey ? "add" : "replace",
              nodeIds: [row.id]
            })}
            onDoubleClick={() => {
              context.dispatch({ type: "select-node", nodeId: row.id });
              context.frameSelected();
            }}
          >
            <span>{row.label}</span>
            <small>{row.kind}{row.problemCount ? ` · ${row.problemCount}` : ""}</small>
          </button>
        </div>
        {row.selected && row.kind === "imported" ? context.model.problems.items
          .filter((problem) => row.problemIds.includes(problem.id))
          .map((problem) => (
            <p key={problem.id} className="ek-workbench__tree-problem" data-severity={problem.severity}>
              {problem.detailDescriptor ? t(problem.detailDescriptor) : problem.detail ?? (problem.titleDescriptor ? t(problem.titleDescriptor) : problem.title)}
            </p>
          )) : null}
        {expanded && row.childIds.length > 0 ? (
          <ul>{row.childIds.map((id) => rows.get(id)).filter((child): child is WorkbenchHierarchyRow => Boolean(child)).map(renderRow)}</ul>
        ) : null}
      </li>
    );
  }

  return (
    <>
      <label className="ek-workbench__hierarchy-search">
        <span>{t("reactWorkbench.leftPanel.hierarchy.search")}</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {hierarchy.empty ? (
        <p className="ek-workbench__empty">{t("reactWorkbench.leftPanel.hierarchy.empty")}</p>
      ) : search && matches.size === 0 ? (
        <p className="ek-workbench__empty" role="status">{t("reactWorkbench.leftPanel.hierarchy.noResults")}</p>
      ) : (
        <ul className="ek-workbench__tree" style={{ "--ek-workbench-tree-max-depth": maxDepth } as CSSProperties}>
          {hierarchy.roots.map(renderRow)}
        </ul>
      )}
    </>
  );
}
