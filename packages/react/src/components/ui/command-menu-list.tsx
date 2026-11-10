import { useState, type ReactNode } from "react";
import { CommandMenuItem, type MenuCommand } from "./command-menu-item";
import type { CommandReason } from "./command-menu";

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
 * not receive focus at all. Entering the list hands focus to the first enabled command.
 */
export function CommandMenu({
  group,
  listId,
  idPrefix,
  onMoveFocus,
  onActivate,
  roving,
  onEscape,
  onTab
}: {
  group: CommandMenuGroup;
  /** Id prefix of the owning menu, used to tie disabled rows to the reason tooltip. */
  idPrefix: string;
  /** Id of the `role="menu"` list, so a trigger can point `aria-controls` at it. */
  listId?: string;
  /** Roving focus is opt-in: the viewport menus move focus with arrows, the project menu starts on its first row. */
  onMoveFocus?(list: HTMLElement, where: 1 | -1 | "first" | "last"): void;
  onActivate(commandKey: string): void;
  /** Command key that arrow-key navigation currently rests on. */
  roving?: string | null;
  onEscape(): void;
  onTab(): void;
}): React.JSX.Element {
  const [reason, setReason] = useState<CommandReason | null>(null);
  const tooltipId = (commandKey: string) => `${idPrefix}-${commandKey}-reason`;
  return (
    <>
      <strong className="ek-workbench__menu-group" aria-hidden="true">{group.label}</strong>
      <div
        className="ek-workbench__menu-list"
        id={listId}
        role="menu"
        aria-label={group.label}
        aria-orientation="vertical"
        tabIndex={-1}
        onFocus={(event) => {
          // Landing on the list (keyboard entry) starts roving at its first command.
          if (event.target !== event.currentTarget) return;
          onMoveFocus?.(event.currentTarget, "first");
        }}
        onKeyDown={(event) => {
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
