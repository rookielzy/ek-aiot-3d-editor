import { type InputHTMLAttributes } from "react";
import { useInspectorDraft } from "../hooks/use-inspector-draft";
import { Input } from "./ui/Input";

interface InspectorNumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "type" | "onChange" | "onBlur" | "onKeyDown"> {
  value: number | string;
  onCommit(value: string): boolean;
  onReset?(): void;
  commitUnchanged?: boolean;
}

// Keep the DOM input mounted on commit so Enter preserves keyboard focus.
// The parent keys this input by target; Core value changes also reset its draft.
export function InspectorNumberInput({ value, onCommit, onReset, commitUnchanged = false, ...props }: InspectorNumberInputProps) {
  const draft = useInspectorDraft(String(value), (next) => {
    if (!commitUnchanged && next.trim() !== "" && Number(next) === Number(value)) { onReset?.(); return true; }
    return onCommit(next);
  }, onReset);

  return (
    <Input
      {...props}
      type="number"
      {...draft}
    />
  );
}
