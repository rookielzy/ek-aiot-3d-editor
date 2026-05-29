export type ProblemSeverity = "warning" | "error";

export interface Problem {
  id: string;
  severity: ProblemSeverity;
  code: "asset-unresolved" | "asset-load-failed" | "invalid-command";
  objectId?: string;
  assetId?: string;
  message: string;
}

export function createMissingAssetProblem(assetId: string, objectId?: string): Problem {
  return {
    id: `asset-unresolved:${assetId}:${objectId ?? "scene"}`,
    severity: "warning",
    code: "asset-unresolved",
    objectId,
    assetId,
    message: `Asset ${assetId} could not be resolved.`
  };
}
