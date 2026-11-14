import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { CSSProperties } from "vue";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Teleported content escapes paint containment and inherits this editor's theme.
export function getPortalTheme(trigger: HTMLElement | null): CSSProperties {
  if (!trigger) return {};
  const style = getComputedStyle(trigger);
  const tokens = ["surface", "surface-raised", "border", "text", "muted", "accent", "accent-soft", "error", "focus", "radius", "radius-sm", "control-height"];
  return Object.fromEntries(tokens.map((token) => [`--ek-workbench-${token}`, style.getPropertyValue(`--ek-workbench-${token}`)]).filter(([, value]) => value?.trim()));
}
