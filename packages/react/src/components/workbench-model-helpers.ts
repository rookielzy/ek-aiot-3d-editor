import type { ProblemSeverity } from "@ek-aiot/3d-editor-core";

export type WorkbenchTone = "neutral" | "info" | "warning" | "error";

export interface ProblemSeverityCounts {
  info: number;
  warning: number;
  error: number;
}

export function problemToneFromCounts(counts: Pick<ProblemSeverityCounts, "warning" | "error">, totalCount: number): WorkbenchTone {
  if (counts.error > 0) {
    return "error";
  }
  if (counts.warning > 0) {
    return "warning";
  }
  return totalCount > 0 ? "info" : "neutral";
}

export function problemToneFromSeverities(problems: readonly { severity: ProblemSeverity }[]): WorkbenchTone {
  let hasWarning = false;
  for (const problem of problems) {
    if (problem.severity === "error") {
      return "error";
    }
    if (problem.severity === "warning") {
      hasWarning = true;
    }
  }
  return hasWarning ? "warning" : problems.length > 0 ? "info" : "neutral";
}
