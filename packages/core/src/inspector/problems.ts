import type { Problem } from "../problems/types";
import type { SceneSnapshot } from "../snapshot/types";
import { createDisplayMessageDescriptor } from "../i18n/display-messages";
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
        titleDescriptor: createDisplayMessageDescriptor({
          namespace: "inspector",
          path: "problem.acknowledged",
          field: "title",
          fallback: "Acknowledged problem"
        }),
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
    titleDescriptor: createDisplayMessageDescriptor({
      namespace: "inspector",
      path: "section.problems",
      field: "title",
      fallback: "Problems",
      values: { sectionId: "problems" }
    }),
    enabled: true,
    fields: [],
    problems
  };
}

export function toProblemItem(problem: Problem, acknowledged: boolean, runtime: boolean): InspectorProblemItem {
  return {
    id: problem.id,
    severity: problem.severity,
    code: problem.code,
    source: problem.source,
    target: problem.target,
    title: problem.display?.title ?? problem.message,
    titleDescriptor: problem.display?.titleDescriptor ?? createDisplayMessageDescriptor({
      namespace: "problem",
      path: `fallback.${problem.code}`,
      field: "title",
      fallback: problem.display?.title ?? problem.message,
      values: { code: problem.code }
    }),
    detail: problem.display?.detail ?? problem.message,
    detailDescriptor: problem.display?.detailDescriptor,
    assetId: problem.assetId,
    objectId: problem.objectId,
    recoverability: problem.recoverability,
    acknowledged,
    actionLabel: problem.display?.actionLabel ?? (problem.recoverability === "user-action" ? "Replace asset" : undefined),
    actionLabelDescriptor: problem.display?.actionLabelDescriptor ?? (problem.recoverability === "user-action"
      ? createDisplayMessageDescriptor({
          namespace: "problem",
          path: "fallback.replaceAsset",
          field: "actionLabel",
          fallback: "Replace asset",
          values: { code: problem.code }
        })
      : undefined),
    runtime
  };
}
