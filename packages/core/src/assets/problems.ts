import type { Problem } from "../problems/types";
import { createDisplayMessageDescriptor } from "../i18n/display-messages";

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
      titleDescriptor: createDisplayMessageDescriptor({
        namespace: "problem",
        path: "asset.unresolved",
        field: "title",
        fallback: "Asset could not be resolved",
        values: { assetId, objectId: objectId ?? null }
      }),
      detail: `Asset ${assetId} is missing or unavailable.`,
      detailDescriptor: createDisplayMessageDescriptor({
        namespace: "problem",
        path: "asset.unresolved",
        field: "detail",
        fallback: "Asset {assetId} is missing or unavailable.",
        values: { assetId, objectId: objectId ?? null }
      }),
      actionLabelDescriptor: createDisplayMessageDescriptor({
        namespace: "problem",
        path: "asset.unresolved",
        field: "actionLabel",
        fallback: "Replace asset",
        values: { assetId, objectId: objectId ?? null }
      })
    }
  };
}
