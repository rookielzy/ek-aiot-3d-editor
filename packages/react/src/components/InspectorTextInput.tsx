import type { InputHTMLAttributes } from "react";
import { useInspectorDraft } from "../hooks/use-inspector-draft";
import { Input } from "./ui/Input";

interface InspectorTextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "onBlur" | "onKeyDown"> {
  value: string;
  onCommit(value: string): boolean;
  onReset?(): void;
}

export function InspectorTextInput({ value, onCommit, onReset, ...props }: InspectorTextInputProps) {
  const draft = useInspectorDraft(value, (next) => {
    if (next === value) { onReset?.(); return true; }
    return onCommit(next);
  }, onReset);
  return <Input {...props} type="text" {...draft} />;
}
