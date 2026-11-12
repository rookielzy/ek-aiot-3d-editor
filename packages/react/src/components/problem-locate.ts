import type { ProblemTarget, WorkbenchHierarchyRow, WorkbenchModel, WorkbenchProblemItem } from "@ek-aiot/3d-editor-core";

/**
 * The region a problem's target lives in, as far as the workbench can actually show it. Only
 * regions this shell can put the user inside are representable, so a problem whose target has no
 * home here reports no request at all instead of offering a press that goes nowhere.
 */
export type ProblemLocateRequest =
  | { kind: "data-query"; connectionId: string; queryId: string }
  | { kind: "data-object"; nodeId: string; queryId: string }
  | { kind: "data-field"; nodeId: string; queryId: string; propertyKey: string }
  | { kind: "node"; nodeId: string }
  | { kind: "asset"; assetId: string };

/** The requests a left-panel region can carry out itself, once the shell has brought it forward. */
export type PanelLocateRequest = Extract<ProblemLocateRequest, { kind: "node" | "asset" }>;

/**
 * Where the user has to go to act on a problem.
 *
 * Data targets name their own region. Everything else resolves against what the model reports:
 * a recoverable asset problem lands in the asset workspace, because that is where the missing file
 * is supplied, even when a scene object is what references the asset; the remaining problems land
 * on the deepest scene row that reported them.
 */
export function locateProblemRequest(
  problem: WorkbenchProblemItem,
  model: WorkbenchModel
): ProblemLocateRequest | null {
  const dataRequest = dataRequestFor(problem.target);
  if (dataRequest) return dataRequest;

  const assetId = problem.assetId ?? assetIdOf(problem.target);
  const assetListed = assetId !== null && Boolean(model.assets.workspace?.items.some((item) => item.id === assetId));
  if (assetId !== null && assetListed && problem.recoverability === "user-action") {
    return { kind: "asset", assetId };
  }
  const row = deepestProblemRow(problem, model);
  if (row) {
    return { kind: "node", nodeId: row.id };
  }
  return assetId !== null && assetListed ? { kind: "asset", assetId } : null;
}

/** Data targets name the panel they live in, so they need no lookup. */
function dataRequestFor(target: ProblemTarget): ProblemLocateRequest | null {
  switch (target.kind) {
    case "data-query":
      return { kind: "data-query", connectionId: target.connectionId, queryId: target.queryId };
    case "data-object":
      return { kind: "data-object", nodeId: target.nodeId, queryId: target.queryId };
    case "data-field":
      return { kind: "data-field", nodeId: target.nodeId, queryId: target.queryId, propertyKey: target.propertyKey };
    default:
      return null;
  }
}

/** The asset a target names itself, for the targets that carry one. */
function assetIdOf(target: ProblemTarget): string | null {
  switch (target.kind) {
    case "asset":
      return target.assetId;
    case "texture-slot":
    case "environment":
      return target.assetId ?? null;
    default:
      return null;
  }
}

/** The node itself, not the branch that contains it: a container row matches by its children. */
function deepestProblemRow(problem: WorkbenchProblemItem, model: WorkbenchModel): WorkbenchHierarchyRow | null {
  return model.hierarchy.rows.reduce<WorkbenchHierarchyRow | null>((best, row) => {
    if (!row.problemIds.includes(problem.id)) return best;
    if (!best || row.depth > best.depth) return row;
    // Same depth: the row that carries the problem's own object is the more precise target.
    if (row.depth === best.depth && problem.objectId && row.objectId === problem.objectId && best.objectId !== problem.objectId) {
      return row;
    }
    return best;
  }, null);
}
