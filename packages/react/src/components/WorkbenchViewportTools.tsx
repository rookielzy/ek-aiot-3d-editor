import { useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { CommandMenu, type CommandMenuCommand } from "./ui/command-menu-list";
import { useCommandMenu } from "./ui/command-menu";
import { registerCommandLayer } from "./ui/command-layer";
import { Popover, PopoverContent, PopoverTrigger, getPortalTheme } from "./ui/Popover";
import { WorkbenchIcon } from "./WorkbenchIcon";
import { buildViewportToolEntries, type ViewportToolCommand, type ViewportToolGroup } from "./viewport-tool-model";
import { MENU_ITEM } from "./ui/command-menu-item";

interface WorkbenchViewportToolsProps {
  context: ResolvedWorkbenchContext;
  marqueeSelectionEnabled: boolean;
  onToggleMarqueeSelection(): void;
}


function useReducerCount(version: number) {
  return version + 1;
}

type MenuEntry = Extract<ReturnType<typeof buildViewportToolEntries>[number], { kind: "menu" }>;


interface MenuSpace {
  /** Width the open menu may use. */
  width: number;
  /** Height left below the strip, so the menu never grows past the viewport it opened in. */
  maxHeight: number | null;
}

/** Room a menu has once it is placed against the tool strip it opened from. */
function measureMenuSpace(): MenuSpace | null {
  if (typeof document === "undefined") return null;
  const viewport = document.querySelector<HTMLElement>(".ek-workbench__viewport-shell");
  const strip = document.querySelector<HTMLElement>(".ek-workbench__viewport-tool-strip");
  if (!viewport) return null;
  const bounds = viewport.getBoundingClientRect();
  const maxHeight = strip ? Math.round(bounds.bottom - strip.getBoundingClientRect().bottom - 16) : null;
  return { width: Math.round(bounds.width), maxHeight: maxHeight && maxHeight > 0 ? maxHeight : null };
}

export function WorkbenchViewportTools({ context, marqueeSelectionEnabled, onToggleMarqueeSelection }: WorkbenchViewportToolsProps) {
  const t = context.i18n.t;
  const id = useId();
  const menu = useCommandMenu();
  const [, forceUpdate] = useReducer(useReducerCount, 0);
  // Radix mirrors its own open state on the trigger; writing the same values here keeps them equal.
  const openMenu = menu.open;
  const openMenuRef = menu.openRef;

  // The strip lives inside the viewport, so its width is what a menu has to fit into.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [space, setSpace] = useState<MenuSpace>({ width: 0, maxHeight: null });

  useLayoutEffect(() => {
    const next = measureMenuSpace();
    if (next && (next.width !== space.width || next.maxHeight !== space.maxHeight)) setSpace(next);
  });

  const layerId = `${id}-menu-layer`;
  const entries = buildViewportToolEntries(context, {
    marqueeSelectionEnabled,
    onToggleMarqueeSelection
  });
  const directGroups = entries.filter((entry): entry is Extract<(typeof entries)[number], { kind: "group" }> => entry.kind === "group");
  const menus = entries.filter((entry): entry is MenuEntry => entry.kind === "menu");

  function owned(key: string) {
    return openMenu === key ? "true" : "false";
  }

  useEffect(() => {
    if (!openMenu) return;
    // Typed characters and scene shortcuts are swallowed for the whole open menu, whichever
    // element holds focus (the trigger after a pointer click, an item after arrow navigation).
    function stopSceneKeys(event: KeyboardEvent) {
      if (!(event.target instanceof HTMLElement)) return;
      const panel = document.getElementById(`${id}-${openMenu}`);
      const trigger = document.getElementById(`${id}-${openMenu}-trigger`);
      if (!panel?.contains(event.target) && !trigger?.contains(event.target)) return;
      if (event.target.closest(MENU_ITEM)) return;
      if (event.key.length > 1 || event.key === " " || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
    }
    document.addEventListener("keydown", stopSceneKeys, true);
    return () => document.removeEventListener("keydown", stopSceneKeys, true);
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;
    // Escape reaches three listeners on this layer (the panel's Radix focus loop, the command list,
    // and this one); joining the layer lets its first claim stand and keeps focus restoration intact.
    return registerCommandLayer((event) => {
      if (event.key !== "Escape") return false;
      event.preventDefault();
      menu.closeMenu();
      return true;
    }, { join: layerId });
  }, [openMenu, menu]);

  /** Runs one menu command: toggles stay open so repeated helper switches are one press, one-shot
   * commands close the menu and hand focus back to its trigger. */
  function activate(group: ViewportToolGroup, command: ViewportToolCommand, menuKey: string) {
    command["onClick"]();
    if (group.kind === "action") {
      menu.closeMenu();
      return;
    }
    // Re-read the context after the click so toggles show their new state before the next focus.
    forceUpdate();
    menu.focusItem(document.getElementById(`${id}-${menuKey}`), command.key);
  }

  function panelElement(key: string | null) {
    return key ? document.getElementById(`${id}-${key}`) : null;
  }

  function menuCommand(menuKey: string, group: ViewportToolGroup, command: ViewportToolCommand): CommandMenuCommand {
    return {
      key: command.key,
      label: t(command.label),
      title: t(command.title),
      icon: <WorkbenchIcon name={command.icon} />,
      shortcut: command.shortcut,
      pressed: command.pressed,
      disabled: command.disabled,
      disabledReason: command.disabledReason,
      kind: group.kind,
      onClick: () => activate(group, command, menuKey)
    };
  }

  function renderCommand(command: ViewportToolCommand, compact: boolean) {
    return (
      <button
        key={command.key}
        type="button"
        data-ek-discard-draft={command.key === "undo" || command.key === "redo" ? true : undefined}
        className={`ek-workbench__command-button${compact ? " ek-workbench__command-button--icon" : ""}`}
        onClick={() => {
          command.onClick();
          // Core applies continuous toggles synchronously, so re-read before the next render.
          if (command.pressed !== undefined) forceUpdate();
        }}
        disabled={command.disabled}
        aria-label={t(command.label)}
        aria-keyshortcuts={command.shortcut}
        aria-pressed={command.pressed}
        data-tooltip={command.disabled && command.disabledReason ? command.disabledReason : undefined}
        title={command.disabled && command.disabledReason ? `${t(command.title)} — ${command.disabledReason}` : t(command.title)}
      >
        <WorkbenchIcon name={command.icon} />
        {command.key.startsWith("snap-") ? <i className="ek-workbench__snap-mark" aria-hidden="true"><WorkbenchIcon name="snap" /></i> : null}
        <span>{t(command.label)}</span>
      </button>
    );
  }

  return (
    <div
      ref={rootRef}
      className="ek-workbench__viewport-tools"
      aria-label={t("reactWorkbench.toolbar.tools.label")}
      // Key events are handled here, in the React tree that owns the menu, because the panel is
      // portaled out of this DOM node but stays inside this component's React subtree.
      onKeyDown={(event) => {
        if (!openMenu) return;
        if (event.key === "Escape") {
          event.preventDefault();
          menu.closeMenu();
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const delta = event.key === "End" ? "last" : event.key === "Home" ? "first" : event.key === "ArrowDown" ? 1 : -1;
        const panel = panelElement(openMenu);
        menu.moveFocus(panel, delta);
      }}
    >
      <div className="ek-workbench__viewport-tool-strip">
        {directGroups.map((entry) => (
          <div key={entry.key} className="ek-workbench__tool-group" role="group" aria-label={t(entry.label)}>
            {entry.groups.flatMap((group) => group.commands.map((command) => renderCommand(command, true)))}
          </div>
        ))}
        <div className="ek-workbench__tool-group">
          {menus.map((entry) => (
            <Popover
              key={entry.key}
              open={openMenu === entry.key}
              // The menu is driven by the trigger's click, Escape, focus leaving, and command
              // activation. Radix's own dismissal requests must not close a pressed toggle's menu.
              // Radix unmounts the panel as soon as its own open state turns false, before any
              // focus move can land inside it. Accept its state only while React still considers
              // this menu open, so a stale callback cannot tear down a visible panel.
              onOpenChange={(next) => {
                // The visible menu is decided here; Radix's own toggle requests are advisory.
                if (!next || openMenuRef.current !== entry.key) return;
                menu.closeMenu({ restore: false });
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="ek-workbench__command-button ek-workbench__command-button--icon"
                  aria-label={t(entry.label)}
                  title={t(entry.label)}
                  id={`${id}-${entry.key}-trigger`}
                  ref={menu.triggerRef(entry.key)}
                  aria-expanded={owned(entry.key)}
                  data-state={openMenu === entry.key ? "open" : "closed"}
                  onClick={() => menu.toggleMenu(entry.key)}
                >
                  <WorkbenchIcon name={entry.key === "helpers" ? "grid" : entry.key === "camera" ? "capture-view" : "group"} />
                  <span>{t(entry.label)}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                onPointerDownOutside={(event) => event.preventDefault()}
                onFocusOutside={(event) => event.preventDefault()}
                onEscapeKeyDown={(event) => event.preventDefault()}
                id={`${id}-${entry.key}`}
                ref={menu.panelRef(entry.key)}
                className="ek-workbench__menu"
                data-state="open"
                style={{
                  ...getPortalTheme(entry.key === openMenu ? (document.getElementById(`${id}-${entry.key}-trigger`) ?? null) : null),
                  // Collision padding keeps the menu inside the viewport it was opened from.
                  "--radix-popover-content-available-width": `${Math.max(160, space.width - 24)}px`,
                  ...(space.maxHeight ? { "--ek-menu-max-height": `${space.maxHeight}px` } : {}),
                } as CSSProperties}
                aria-label={t(entry.label)}
                onKeyDown={(event) => {
                  // The list inside the panel already claims Escape and Tab; this covers the
                  // label above it, which is not focusable but still bubbles its keys here.
                  if (event.defaultPrevented) return;
                  if (event.key === "Escape") {
                    event.preventDefault();
                    menu.closeMenu();
                  } else if (event.key === "Tab") {
                    menu.closeMenu({ restore: false });
                  }
                }}
              >
                <CommandMenu
                  group={{ key: entry.key, label: t(entry.group.label), kind: entry.group.kind, commands: entry.group.commands.map((command) => menuCommand(entry.key, entry.group, command)) }}
                  idPrefix={`${id}-${entry.key}`}
                  onMoveFocus={(panel, where) => menu.moveFocus(panel, where)}
                  onActivate={(commandKey) => menu.focusItem(panelElement(openMenu), commandKey)}
                  roving={menu.roving}
                  onEscape={() => menu.closeMenu()}
                  onTab={() => menu.closeMenu({ restore: false })}
                />
              </PopoverContent>
            </Popover>
          ))}
        </div>
      </div>
    </div>
  );
}
