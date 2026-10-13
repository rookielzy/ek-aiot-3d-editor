import { useEffect, useRef, useState } from "react";
import type { InspectorCommandProblem, InspectorFieldDescriptor } from "@ek-aiot/3d-editor-core";

export function useInspectorProblem(fields: InspectorFieldDescriptor[], targetKey: string) {
  const [problem, setState] = useState<InspectorCommandProblem | null>(null);
  const baseline = useRef<{ target: string; value: unknown } | null>(null);
  const currentValue = fields.find((field) => field.id === problem?.fieldId)?.value;
  useEffect(() => {
    if (problem && baseline.current && (targetKey !== baseline.current.target || (problem.fieldId && !Object.is(currentValue, baseline.current.value)))) setState(null);
  }, [targetKey, currentValue, problem]);
  function setProblem(next: InspectorCommandProblem | null) {
    baseline.current = { target: targetKey, value: fields.find((field) => field.id === next?.fieldId)?.value };
    setState(next);
  }
  function clearField(fieldId: string) {
    setState((current) => current?.fieldId === fieldId ? null : current);
  }
  return [problem, setProblem, clearField] as const;
}
