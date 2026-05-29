import type { Problem } from "../problems/types";
import type { SceneSnapshot } from "../snapshot/types";
import type { InspectorProblemItem, ProblemInspectorSection } from "./types";

export function buildProblemSection(snapshot: SceneSnapshot, runtimeProblems: readonly Problem[] = []): ProblemInspectorSection {
  const acknowledged = snapshot.problems.acknowledged;
  const problems = runtimeProblems.map((problem) => toProblemItem(problem, Boolean(acknowledged[problem.id]), true));

  for (const acknowledgement of Object.values(acknowledged)) {
    if (!problems.some((problem) => problem.id === acknowledgement.problemId)) {
      problems.push({
        id: acknowledgement.problemId,
        severity: "info",
        code: "acknowledged",
        source: "command",
        target: { kind: "scene", sceneId: snapshot.scene.id },
        title: "Acknowledged problem",
        detail: acknowledgement.acknowledgedAt,
        recoverability: "user-action",
        acknowledged: true,
        runtime: false
      });
    }
  }

  return {
    id: "problems",
    title: "Problems",
    enabled: true,
    fields: [],
    problems
  };
}

function toProblemItem(problem: Problem, acknowledged: boolean, runtime: boolean): InspectorProblemItem {
  return {
    id: problem.id,
    severity: problem.severity,
    code: problem.code,
    source: problem.source,
    target: problem.target,
    title: problem.display?.title ?? problem.message,
    detail: problem.display?.detail ?? problem.message,
    assetId: problem.assetId,
    objectId: problem.objectId,
    recoverability: problem.recoverability,
    acknowledged,
    actionLabel: problem.display?.actionLabel ?? (problem.recoverability === "user-action" ? "Replace asset" : undefined),
    runtime
  };
}
