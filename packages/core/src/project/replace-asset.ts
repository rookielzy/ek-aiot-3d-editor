import type { ProjectAssetStore } from "./asset-store";
import type { ProjectProblem, ReplaceAssetInput, ReplaceAssetResult } from "./package-types";
import { createProjectProblem } from "./package-validation";
import type { SceneSnapshot } from "../snapshot/types";

export async function replaceProjectAsset(
  snapshot: SceneSnapshot,
  assets: ProjectAssetStore,
  input: ReplaceAssetInput
): Promise<ReplaceAssetResult> {
  const problems: ProjectProblem[] = [];
  const asset = snapshot.assets[input.assetId];
  if (!asset) {
    return {
      ok: false,
      problems: [createProjectProblem("project-replace-asset-missing", `Asset ${input.assetId} does not exist in the scene snapshot.`, {
        assetId: input.assetId
      })]
    };
  }

  if (input.kind && input.kind !== asset.kind) {
    problems.push(createProjectProblem("project-replace-kind-mismatch", `Replacement kind ${input.kind} does not match asset ${input.assetId} kind ${asset.kind}.`, {
      assetId: input.assetId
    }));
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  try {
    assets.register({
      asset,
      source: input.source,
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      ...(input.label ? { label: input.label } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {})
    });
  } catch (error) {
    return {
      ok: false,
      problems: [createProjectProblem("project-replace-source-invalid", error instanceof Error ? error.message : String(error), {
        assetId: input.assetId
      })]
    };
  }

  return { ok: true, problems: [] };
}
