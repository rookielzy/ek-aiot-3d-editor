import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

interface InspectorNumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "type" | "onChange" | "onBlur" | "onKeyDown"> {
  value: number | string;
  onCommit(value: string): boolean;
}

// Keep the DOM input mounted on commit so Enter preserves keyboard focus.
// The parent keys this input by target; Core value changes also reset its draft.
export function InspectorNumberInput({ value, onCommit, ...props }: InspectorNumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const dirty = useRef(false);
  useEffect(() => {
    setDraft(String(value));
    dirty.current = false;
  }, [value]);

  function commit(value: string) {
    if (dirty.current && onCommit(value)) dirty.current = false;
  }

  return (
    <input
      {...props}
      type="number"
      value={draft}
      onChange={(event) => {
        dirty.current = true;
        setDraft(event.currentTarget.value);
      }}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(event.currentTarget.value);
        }
      }}
    />
  );
}
