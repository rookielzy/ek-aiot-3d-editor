// Adapted from shadcn/ui (MIT): https://ui.shadcn.com/r/styles/new-york/switch.json
import { forwardRef, type ComponentProps } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "./utils";
import "./ui.css";

export const Switch = forwardRef<HTMLButtonElement, ComponentProps<typeof SwitchPrimitive.Root>>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root ref={ref} className={cn("ek-ui-switch ek:inline-flex ek:items-center ek:shrink-0", className)} {...props}>
    <SwitchPrimitive.Thumb className="ek-ui-switch-thumb ek:block ek:rounded-full" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";
