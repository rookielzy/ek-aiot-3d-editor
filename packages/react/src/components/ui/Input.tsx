// Adapted from shadcn/ui (MIT): https://ui.shadcn.com/r/styles/new-york/input.json
import { forwardRef, type ComponentProps } from "react";
import { cn } from "./utils";
import "./ui.css";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("ek-ui-input ek:w-full ek:min-w-0", className)} {...props} />
));
Input.displayName = "Input";
