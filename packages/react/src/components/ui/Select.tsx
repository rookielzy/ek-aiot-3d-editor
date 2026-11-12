// Adapted from shadcn/ui (MIT): https://ui.shadcn.com/r/styles/new-york/select.json
import { forwardRef, useContext, type ComponentProps } from "react";
import { Content, Icon, Item, ItemIndicator, ItemText, Portal, Root, ScrollDownButton, ScrollUpButton, Trigger, Value, Viewport } from "@radix-ui/react-select";
import { CaretDown, CaretUp, Check } from "@phosphor-icons/react";
import { DialogPortalContainer } from "./Dialog";
import { cn } from "./utils";
import "./ui.css";

export const Select = Root;
export const SelectValue = Value;
export const SelectTrigger = forwardRef<HTMLButtonElement, ComponentProps<typeof Trigger>>(({ className, children, ...props }, ref) => (
  <Trigger ref={ref} className={cn("ek-ui-button ek-ui-select-trigger ek:flex ek:items-center ek:justify-between ek:gap-2", className)} {...props}>
    {children}<Icon asChild><CaretDown aria-hidden size={14} /></Icon>
  </Trigger>
));
SelectTrigger.displayName = "SelectTrigger";
export const SelectContent = forwardRef<HTMLDivElement, ComponentProps<typeof Content>>(({ className, children, position = "popper", ...props }, ref) => {
  // A native modal makes any popup outside the dialog inert.
  const container = useContext(DialogPortalContainer);
  return (
    <Portal container={container}>
      <Content ref={ref} position={position} sideOffset={4} className={cn("ek-ui-scope ek-ui-popup ek-ui-select-content", className)} {...props}>
        <ScrollUpButton className="ek-ui-scroll"><CaretUp aria-hidden size={14} /></ScrollUpButton>
        <Viewport>{children}</Viewport>
        <ScrollDownButton className="ek-ui-scroll"><CaretDown aria-hidden size={14} /></ScrollDownButton>
      </Content>
    </Portal>
  );
});
SelectContent.displayName = "SelectContent";
export const SelectItem = forwardRef<HTMLDivElement, ComponentProps<typeof Item>>(({ className, children, ...props }, ref) => (
  <Item ref={ref} className={cn("ek-ui-option ek:flex ek:items-center ek:justify-between ek:gap-2", className)} {...props}>
    <ItemText>{children}</ItemText>
    <ItemIndicator><Check aria-hidden size={14} /></ItemIndicator>
  </Item>
));
SelectItem.displayName = "SelectItem";
