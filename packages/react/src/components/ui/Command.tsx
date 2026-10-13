// Adapted from shadcn/ui (MIT): https://ui.shadcn.com/r/styles/new-york/command.json
import { Command as CommandPrimitive } from "cmdk";
import { forwardRef, type ComponentProps } from "react";
import { cn } from "./utils";
import "./ui.css";

export const Command = forwardRef<HTMLDivElement, ComponentProps<typeof CommandPrimitive>>((props, ref) => (
  <CommandPrimitive ref={ref} {...props} />
));
Command.displayName = "Command";
export const CommandEmpty = CommandPrimitive.Empty;
export const CommandList = forwardRef<HTMLDivElement, ComponentProps<typeof CommandPrimitive.List>>(({ className, ...props }, ref) => (
  <CommandPrimitive.List ref={ref} className={cn("ek-ui-command-list ek:overflow-y-auto", className)} {...props} />
));
CommandList.displayName = "CommandList";
export const CommandInput = forwardRef<HTMLInputElement, ComponentProps<typeof CommandPrimitive.Input>>(({ className, ...props }, ref) => (
  <CommandPrimitive.Input ref={ref} className={cn("ek-ui-input ek:w-full", className)} {...props} />
));
CommandInput.displayName = "CommandInput";
export const CommandItem = forwardRef<HTMLDivElement, ComponentProps<typeof CommandPrimitive.Item>>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item ref={ref} className={cn("ek-ui-option ek:flex ek:items-center ek:justify-between ek:gap-2", className)} {...props} />
));
CommandItem.displayName = "CommandItem";
