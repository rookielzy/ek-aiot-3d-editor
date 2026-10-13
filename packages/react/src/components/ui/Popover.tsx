// Adapted from shadcn/ui (MIT): https://ui.shadcn.com/r/styles/new-york/popover.json
import { forwardRef, type ComponentProps, type CSSProperties } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "./utils";
import "./ui.css";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverContent = forwardRef<HTMLDivElement, ComponentProps<typeof PopoverPrimitive.Content>>(({ className, align = "start", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content ref={ref} align={align} sideOffset={sideOffset} className={cn("ek-ui-scope ek-ui-popup ek-ui-popover", className)} {...props} />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = "PopoverContent";

// Portals escape the Inspector's paint containment; copy this instance's computed
// tokens so multiple editors can have different themes without global CSS state.
export function getPortalTheme(trigger: HTMLElement | null): CSSProperties {
  if (!trigger) return {};
  const computed = getComputedStyle(trigger);
  const tokens = ["surface", "surface-raised", "border", "text", "muted", "accent", "accent-soft", "error", "radius-sm", "control-height"];
  return Object.fromEntries(tokens.map((token) => [`--ek-workbench-${token}`, computed.getPropertyValue(`--ek-workbench-${token}`)]).filter(([, value]) => value?.trim()));
}
