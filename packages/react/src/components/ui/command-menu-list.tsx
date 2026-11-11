import { useEffect, useRef, useState, type ReactNode } from "react";
import { CommandMenuItem, type MenuCommand } from "./command-menu-item";
import { moveCommandFocus, type CommandReason } from "./command-menu";

/** A command row: a one-shot action or a toggle that keeps the menu open. */
export interface CommandMenuCommand extends MenuCommand {
  key: string;
  label: string;
  /** Detail behind the label, mirrored into the row's `title`. */
  title?: string;
  icon?: ReactNode;
  /** Whether a `pressed` group's command is currently on. */
  pressed?: boolean;
  /** One-shot commands close their menu; pressed toggles keep it open. */
  kind: "action" | "pressed";
}

/** A group of commands inside one menu; `pressed` groups render as `menuitemcheckbox` rows. */
export interface CommandMenuGroup {
  key: string;
  label: string;
  kind: "action" | "pressed";
  commands: CommandMenuCommand[];
}

/**
 * The one visible hint for a command's shortcut. Screen readers learn the whole binding from the
 * row's `aria-keyshortcuts`; the menu only has room for the triggering key.
 */
export function ShortcutHint({ shortcut }: { shortcut: string }): React.JSX.Element {
  return (
    <kbd className="ek-workbench__menu-shortcut" aria-hidden="true">
      {shortcut.split(" ").at(-1)}
    </kbd>
  );
}

/**
 * The body of a command menu: one labelled list of roving menu items plus the shared reason
 * tooltip that disabled rows point at.
 *
 * The list owns `role="menu"` and is focusable so keyboard entry lands somewhere useful: Radix
 * renders the popover panel itself as `tabIndex -1`, and a container outside the tab order could
 * not receive focus at all. A menu opened from the keyboard enters itself and lands on the first
 * enabled command; every other entry hands focus there once.
 */
export function CommandMenu({
  group,
  listId,
  idPrefix,
  onMoveFocus = moveCommandFocus,
  onActivate,
  roving,
  onEscape,
  onTab,
  claimEntry
}: {
  group: CommandMenuGroup;
  /** Id prefix of the owning menu, used to tie disabled rows to the reason tooltip. */
  idPrefix: string;
  /** Id of the `role="menu"` list, so a trigger can point `aria-controls` at it. */
  listId?: string;
  /** Allows the owner to track the focused command in addition to moving focus. */
  onMoveFocus?(list: HTMLElement, where: 1 | -1 | "first" | "last"): void;
  onActivate(commandKey: string): void;
  /** Command key that arrow-key navigation currently rests on. */
  roving?: string | null;
  onEscape(): void;
  onTab(): void;
  /**
   * Claims focus for a menu whose trigger keeps it.
   *
   * A trigger that stays focused — a row whose menu opens from a keystroke, say — leaves nobody to
   * move focus into the portaled panel. When this is set, the menu takes focus as soon as it holds
   * an available command, once per mount.
   */
  claimEntry?: boolean;
}): React.JSX.Element {
  const [reason, setReason] = useState<CommandReason | null>(null);
  const entered = useRef(false);
  const list = useRef<HTMLDivElement | null>(null);
  const claimed = useRef(false);
  const tooltipId = (commandKey: string) => `${idPrefix}-${commandKey}-reason`;
  const entry = (): void => {
    const target = list.current;
    if (target) onMoveFocus(target, "first");
  };

  useEffect(() => {
    if (!claimEntry || claimed.current) return;
    const target = list.current;
    if (!target) return;
    const available = (): HTMLElement | undefined =>
      [...target.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((item) => item.getAttribute("aria-disabled") !== "true");
    const claim = (): void => {
      if (claimed.current || (document.activeElement instanceof Node && target.contains(document.activeElement))) return;
      const item = available();
      if (!item) return;
      claimed.current = true;
      item.focus();
    };
    claim();
    const frame = requestAnimationFrame(claim);
    return () => cancelAnimationFrame(frame);
  }, [claimEntry, group]);

  return (
    <>
      <strong className="ek-workbench__menu-group" aria-hidden="true">{group.label}</strong>
      <div
        ref={list}
        className="ek-workbench__menu-list"
        id={listId}
        role="menu"
        aria-label={group.label}
        aria-orientation="vertical"
        tabIndex={-1}
        onFocus={(event) => {
          // Entering the menu — on the list itself (`tabIndex -1` lets focus land here) — starts
          // roving at its first command. Focus moving between commands stays where it is.
          if (event.target !== event.currentTarget || entered.current) return;
          entered.current = true;
          entry();
        }}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            onMoveFocus(event.currentTarget, event.key === "Home" ? "first" : event.key === "End" ? "last" : event.key === "ArrowDown" ? 1 : -1);
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onEscape();
          } else if (event.key === "Tab") {
            // Tab leaves the menu; the browser keeps its default focus move after it closes.
            onTab();
          }
        }}
      >
        {group.commands.map((command) => (
          <CommandMenuItem
            key={command.key}
            commandKey={command.key}
            label={command.label}
            title={command.title}
            icon={command.icon}
            checked={command.pressed}
            command={command}
            roving={command.key === roving}
            reasonId={reason?.owner.dataset.command === command.key ? tooltipId(command.key) : null}
            onActivate={() => {
              // The row's own command runs first; the menu then decides whether it survives.
              command.onClick();
              onActivate(command.key);
            }}
            onReasonChange={(text, owner) => setReason(text && owner ? { text, owner } : null)}
            trailing={command.shortcut ? <ShortcutHint shortcut={command.shortcut} /> : undefined}
          />
        ))}
      </div>
      {reason ? (
        <span
          id={tooltipId(reason.owner.dataset.command ?? "reason")}
          role="tooltip"
          className="ek-workbench__tool-reason"
        >
          {reason.text}
        </span>
      ) : null}
    </>
  );
}
