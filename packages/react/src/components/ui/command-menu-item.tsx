import { useRef, type ReactNode } from "react";

/** Every row of a command menu carries a menuitem role; checkbox rows mark toggles. */
export const MENU_ITEM = '[role^="menuitem"]';

/** A command row: a one-shot action or a toggle that keeps the menu open. */
export interface MenuCommand {
  onClick(): void;
  disabled?: boolean;
  /** Why the command is unavailable; shown on hover and read from `aria-describedby`. */
  disabledReason?: string;
  /** Keyboard shortcut text, announced through `aria-keyshortcuts`. */
  shortcut?: string;
  /** One-shot commands close their menu; pressed toggles keep it open. */
  kind: "action" | "pressed";
}

/**
 * One row of a command menu.
 *
 * Menus own their open state, so a row reports the press and lets its menu decide whether the
 * menu survives: pressed toggles stay open so repeated switches are one press, one-shot commands
 * close it. Rows never take the tab order — their menu moves a roving focus instead.
 */
export function CommandMenuItem({
  commandKey,
  label,
  title,
  icon,
  checked,
  command,
  roving,
  trailing,
  reasonId,
  onActivate,
  onReasonChange
}: {
  /** Stable identity used for roving focus and for `aria-describedby`. */
  commandKey: string;
  label: string;
  /** Detail behind the label, mirrored into `title` like the direct command buttons. */
  title?: string;
  icon?: ReactNode;
  checked?: boolean;
  command: MenuCommand;
  /** Whether arrow-key navigation currently rests on this row. */
  roving?: boolean;
  trailing?: ReactNode;
  /** Id of the menu's reason tooltip while this row is the one showing its reason. */
  reasonId: string | null;
  onActivate(): void;
  /** Reports a disabled reason while the row is hovered or focused, and its loss otherwise. */
  onReasonChange(reason: string | null, owner: HTMLElement | null): void;
}): React.JSX.Element {
  const disabled = command.disabled === true;
  // Whether the click that follows a pointerup is the same press and must not run the command twice.
  const pressedRef = useRef(false);
  const reason = disabled ? command.disabledReason : undefined;

  return (
    <button
      type="button"
      role={command.kind === "pressed" ? "menuitemcheckbox" : "menuitem"}
      data-command={commandKey}
      data-roving={roving ? "true" : undefined}
      className="ek-workbench__menu-item"
      tabIndex={-1}
      aria-disabled={disabled}
      aria-checked={command.kind === "pressed" ? Boolean(checked) : undefined}
      aria-keyshortcuts={command.shortcut}
      aria-describedby={reasonId ?? undefined}
      aria-label={disabled ? `${label} — ${reason}` : undefined}
      title={title ? (reason ? `${title} — ${reason}` : title) : undefined}
      data-tooltip={reason}
      onPointerEnter={(event) => onReasonChange(reason ?? null, event.currentTarget)}
      onPointerLeave={() => onReasonChange(null, null)}
      onFocus={(event) => onReasonChange(reason ?? null, event.currentTarget)}
      onBlur={() => onReasonChange(null, null)}
      // Handled on pointer/mouse up: Radix's deferred pointerdown-outside check runs after
      // mousedown and would dismiss a menu whose pressed row is still mounted.
      onPointerUp={(event) => {
        if (disabled || event.button !== 0) return;
        event.preventDefault();
        pressedRef.current = true;
        onActivate();
      }}
      // Keyboard activation; a pointer press already ran on pointerup, so a second dispatch of
      // the same press must not run the command twice. `detail` is 0 for both, but only a press
      // repeats the activation that pointerup already handled.
      onClick={(event) => {
        if (disabled || event.detail !== 0 || pressedRef.current) return;
        pressedRef.current = false;
        onActivate();
      }}
    >
      {icon}
      <span className="ek-workbench__menu-item-label">{label}</span>
      {command.kind === "pressed" ? (
        <span className="ek-workbench__menu-check" data-checked={checked ? "true" : "false"} aria-hidden="true" />
      ) : null}
      {trailing}
    </button>
  );
}
