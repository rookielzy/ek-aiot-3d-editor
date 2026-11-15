import type { ProblemTarget, WorkbenchHierarchyRow, WorkbenchModel, WorkbenchProblemItem } from "@ek-aiot/3d-editor-core";

export type ProblemLocateRequest =
  | { kind: "data-query"; connectionId: string; queryId: string }
  | { kind: "data-object"; nodeId: string; queryId: string }
  | { kind: "data-field"; nodeId: string; queryId: string; propertyKey: string }
  | { kind: "node"; nodeId: string }
  | { kind: "asset"; assetId: string };
export type PanelLocateRequest = Extract<ProblemLocateRequest, { kind: "node" | "asset" }>;

export function locateProblemRequest(problem: WorkbenchProblemItem, model: WorkbenchModel): ProblemLocateRequest | null {
  const dataRequest = dataRequestFor(problem.target);
  if (dataRequest) return dataRequest;
  const assetId = problem.assetId ?? assetIdOf(problem.target);
  const assetListed = assetId !== null && Boolean(model.assets.workspace?.items.some((item) => item.id === assetId));
  if (assetId !== null && assetListed && problem.recoverability === "user-action") return { kind: "asset", assetId };
  const row = model.hierarchy.rows.reduce<WorkbenchHierarchyRow | null>((best, current) => {
    if (!current.problemIds.includes(problem.id)) return best;
    if (!best || current.depth > best.depth) return current;
    if (current.depth === best.depth && problem.objectId && current.objectId === problem.objectId && best.objectId !== problem.objectId) return current;
    return best;
  }, null);
  return row ? { kind: "node", nodeId: row.id } : assetId !== null && assetListed ? { kind: "asset", assetId } : null;
}

function dataRequestFor(target: ProblemTarget): ProblemLocateRequest | null {
  if (target.kind === "data-query") return { kind: "data-query", connectionId: target.connectionId, queryId: target.queryId };
  if (target.kind === "data-object") return { kind: "data-object", nodeId: target.nodeId, queryId: target.queryId };
  if (target.kind === "data-field") return { kind: "data-field", nodeId: target.nodeId, queryId: target.queryId, propertyKey: target.propertyKey };
  return null;
}

function assetIdOf(target: ProblemTarget): string | null {
  if (target.kind === "asset" || target.kind === "texture-slot" || target.kind === "environment") return target.assetId ?? null;
  return null;
}
