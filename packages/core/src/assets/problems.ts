import type { Problem } from "../problems/types";

export type { Problem, ProblemSeverity } from "../problems/types";

export function createMissingAssetProblem(assetId: string, objectId?: string): Problem {
  return {
    id: `asset-unresolved:${assetId}:${objectId ?? "scene"}`,
    severity: "warning",
    code: "asset-unresolved",
    ...(objectId ? { objectId } : {}),
    assetId,
    source: "asset-resolver",
    target: objectId ? { kind: "object", objectId } : { kind: "asset", assetId },
    recoverability: "user-action",
    message: `Asset ${assetId} could not be resolved.`,
    display: {
      title: "Asset could not be resolved",
      detail: `Asset ${assetId} is missing or unavailable.`
    }
  };
}
