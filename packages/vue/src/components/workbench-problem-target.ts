import type { ProblemTarget } from "@ek-aiot/3d-editor-core";

/** Problems that can jump to a data source location inside the workbench. */
export type DataProblemTarget = Extract<ProblemTarget, { kind: "data-query" | "data-object" | "data-field" }>;

export function isDataProblemTarget(target: ProblemTarget): target is DataProblemTarget {
  return target.kind === "data-query" || target.kind === "data-object" || target.kind === "data-field";
}
