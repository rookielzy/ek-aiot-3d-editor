// Adapted from shadcn/ui (MIT): https://ui.shadcn.com/r/styles/new-york/select.json
import { forwardRef, type ComponentProps } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { CaretDown, CaretUp, Check } from "@phosphor-icons/react";
import { cn } from "./utils";
import "./ui.css";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectTrigger = forwardRef<HTMLButtonElement, ComponentProps<typeof SelectPrimitive.Trigger>>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger ref={ref} className={cn("ek-ui-button ek-ui-select-trigger ek:flex ek:items-center ek:justify-between ek:gap-2", className)} {...props}>
    {children}<SelectPrimitive.Icon asChild><CaretDown aria-hidden size={14} /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";
export const SelectContent = forwardRef<HTMLDivElement, ComponentProps<typeof SelectPrimitive.Content>>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content ref={ref} position={position} sideOffset={4} className={cn("ek-ui-scope ek-ui-popup ek-ui-select-content", className)} {...props}>
      <SelectPrimitive.ScrollUpButton className="ek-ui-scroll"><CaretUp aria-hidden size={14} /></SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="ek-ui-scroll"><CaretDown aria-hidden size={14} /></SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = "SelectContent";
export const SelectItem = forwardRef<HTMLDivElement, ComponentProps<typeof SelectPrimitive.Item>>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item ref={ref} className={cn("ek-ui-option ek:flex ek:items-center ek:justify-between ek:gap-2", className)} {...props}>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator><Check aria-hidden size={14} /></SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";
