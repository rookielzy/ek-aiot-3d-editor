// Adapted from shadcn/ui (MIT): https://ui.shadcn.com/r/styles/new-york/button.json
import { forwardRef, type ComponentProps } from "react";
import { cn } from "./utils";
import "./ui.css";

export const Button = forwardRef<HTMLButtonElement, ComponentProps<"button">>(({ className, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} className={cn("ek-ui-button ek:inline-flex ek:items-center ek:justify-between ek:gap-2", className)} {...props} />
));
Button.displayName = "Button";
