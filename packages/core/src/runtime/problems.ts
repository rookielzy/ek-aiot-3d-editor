import type { Problem } from "../problems/types";
import type { TextureSlotName } from "../materials/types";
import type { SceneImportedGlbNode } from "../snapshot/types";
import type { RuntimeImportedTargetMatch } from "./imported-target-resolver";

export { createMissingAssetProblem } from "../assets/problems";
export type { Problem } from "../problems/types";

export type EnvironmentProjectionRole = "background" | "environment" | "background-cubemap-face" | "environment-cubemap-face";
export interface MaterialTextureProblemInput {
  materialId: string;
  objectId: string;
  slot: TextureSlotName;
  textureSlot: { assetId: string };
}

export function createEnvironmentAssetUnresolvedProblem(assetId: string, role: EnvironmentProjectionRole): Problem {
  return {
    id: `environment-asset-unresolved:${role}:${assetId}`,
    severity: "warning",
    code: "environment-asset-unresolved",
    assetId,
    source: "runtime",
    target: { kind: "environment", assetId },
    recoverability: "user-action",
    message: `${formatRole(role)} asset ${assetId} could not be resolved.`,
    display: {
      title: `${formatRole(role)} asset could not be resolved`,
      detail: `Asset ${assetId} is missing or unavailable.`
    },
    metadata: { role }
  };
}

export function createEnvironmentAssetLoadProblem(
  assetId: string,
  role: EnvironmentProjectionRole,
  error: unknown
): Problem {
  const message = error instanceof Error ? error.message : String(error);
  return {
    id: `environment-asset-load-failed:${role}:${assetId}`,
    severity: "error",
    code: "environment-asset-load-failed",
    assetId,
    source: "runtime",
    target: { kind: "environment", assetId },
    recoverability: "user-action",
    message,
    display: {
      title: `${formatRole(role)} asset failed to load`,
      detail: message
    },
    metadata: { role }
  };
}

export function createEnvironmentAssetResolveProblem(
  assetId: string,
  role: EnvironmentProjectionRole,
  error: unknown
): Problem {
  const message = error instanceof Error ? error.message : String(error);
  return {
    id: `environment-asset-resolve-failed:${role}:${assetId}`,
    severity: "error",
    code: "environment-asset-resolve-failed",
    assetId,
    source: "runtime",
    target: { kind: "environment", assetId },
    recoverability: "user-action",
    message,
    display: {
      title: `${formatRole(role)} asset failed to resolve`,
      detail: message
    },
    metadata: { role }
  };
}

export function createEnvironmentPmremProblem(assetId: string, role: EnvironmentProjectionRole, error: unknown): Problem {
  const message = error instanceof Error ? error.message : String(error);
  return {
    id: `environment-pmrem-failed:${role}:${assetId}`,
    severity: "error",
    code: "environment-pmrem-failed",
    assetId,
    source: "runtime",
    target: { kind: "environment", assetId },
    recoverability: "automatic",
    message,
    display: {
      title: `${formatRole(role)} PMREM generation failed`,
      detail: message
    },
    metadata: { role }
  };
}

export function createEnvironmentUnsupportedSettingProblem(setting: string, role: EnvironmentProjectionRole, detail: string): Problem {
  return {
    id: `environment-unsupported-setting:${role}:${setting}`,
    severity: "info",
    code: "environment-unsupported-setting",
    source: "runtime",
    target: { kind: "environment" },
    recoverability: "automatic",
    message: detail,
    display: {
      title: `${formatRole(role)} setting is not supported`,
      detail
    },
    metadata: { role, setting }
  };
}

export function createMaterialTextureAssetUnresolvedProblem(input: MaterialTextureProblemInput): Problem {
  return {
    id: `material-texture-asset-unresolved:${input.materialId}:${input.slot}:${input.textureSlot.assetId}:${input.objectId}`,
    severity: "warning",
    code: "material-texture-asset-unresolved",
    objectId: input.objectId,
    assetId: input.textureSlot.assetId,
    source: "runtime",
    target: {
      kind: "texture-slot",
      materialId: input.materialId,
      slot: input.slot,
      assetId: input.textureSlot.assetId
    },
    recoverability: "user-action",
    message: `Material texture asset ${input.textureSlot.assetId} could not be resolved.`,
    display: {
      title: "Material texture asset could not be resolved",
      detail: `Texture slot ${input.slot} references missing or unavailable asset ${input.textureSlot.assetId}.`
    },
    metadata: { slot: input.slot }
  };
}

export function createMaterialTextureAssetLoadProblem(input: MaterialTextureProblemInput, error: unknown): Problem {
  const message = error instanceof Error ? error.message : String(error);
  return {
    id: `material-texture-asset-load-failed:${input.materialId}:${input.slot}:${input.textureSlot.assetId}:${input.objectId}`,
    severity: "error",
    code: "material-texture-asset-load-failed",
    objectId: input.objectId,
    assetId: input.textureSlot.assetId,
    source: "runtime",
    target: {
      kind: "texture-slot",
      materialId: input.materialId,
      slot: input.slot,
      assetId: input.textureSlot.assetId
    },
    recoverability: "user-action",
    message,
    display: {
      title: "Material texture asset failed to load",
      detail: message
    },
    metadata: { slot: input.slot }
  };
}

export function createMaterialTextureAssetResolveProblem(input: MaterialTextureProblemInput, error: unknown): Problem {
  const message = error instanceof Error ? error.message : String(error);
  return {
    id: `material-texture-asset-resolve-failed:${input.materialId}:${input.slot}:${input.textureSlot.assetId}:${input.objectId}`,
    severity: "error",
    code: "material-texture-asset-resolve-failed",
    objectId: input.objectId,
    assetId: input.textureSlot.assetId,
    source: "runtime",
    target: {
      kind: "texture-slot",
      materialId: input.materialId,
      slot: input.slot,
      assetId: input.textureSlot.assetId
    },
    recoverability: "user-action",
    message,
    display: {
      title: "Material texture asset failed to resolve",
      detail: message
    },
    metadata: { slot: input.slot }
  };
}

export function createImportedTargetMissingProblem(match: RuntimeImportedTargetMatch): Problem {
  return {
    id: `imported-target-missing:${match.ownerObjectId}:${match.node.id}:${match.importKey}`,
    severity: "warning",
    code: "imported-target-missing",
    objectId: match.ownerObjectId,
    source: "runtime",
    target: {
      kind: "imported-target",
      objectId: match.ownerObjectId,
      nodeId: match.node.id,
      importKey: match.importKey
    },
    recoverability: "user-action",
    message: match.message ?? `Imported target ${match.importKey} could not be matched in the loaded GLB.`,
    display: {
      title: "Imported target could not be matched",
      detail: match.message ?? `The loaded GLB no longer exposes ${match.importKey}.`
    },
    metadata: {
      importKey: match.importKey,
      sourceKind: match.source.kind,
      sourcePath: match.source.path
    }
  };
}

export function createImportedTargetUnresolvedProblem(node: SceneImportedGlbNode, assetId?: string): Problem {
  const previousImportKey = node.remap?.previousImportKey ?? node.importKey;
  const candidateImportKeys = node.remap?.candidateImportKeys ?? [];
  return {
    id: `imported-target-unresolved:${node.ownerObjectId}:${node.id}:${previousImportKey}`,
    severity: "warning",
    code: "imported-target-unresolved",
    objectId: node.ownerObjectId,
    ...(assetId ? { assetId } : {}),
    source: "runtime",
    target: {
      kind: "imported-target",
      objectId: node.ownerObjectId,
      nodeId: node.id,
      importKey: node.importKey
    },
    recoverability: "user-action",
    message: `Imported target ${previousImportKey} could not be remapped during GLB reimport.`,
    display: {
      title: "Imported target needs remap",
      detail: candidateImportKeys.length > 0
        ? `Previous target ${previousImportKey} has ${candidateImportKeys.length} possible replacement targets.`
        : `Previous target ${previousImportKey} was not found in the replacement GLB.`,
      actionLabel: "Review remap"
    },
    metadata: {
      importKey: node.importKey,
      previousImportKey,
      candidateImportKeys,
      sourceKind: node.source.kind,
      sourcePath: node.source.path
    }
  };
}

export function createImportedMaterialSlotUnresolvedProblem(
  node: SceneImportedGlbNode,
  slotId: string,
  assetId?: string,
  reason: "slot-missing" | "runtime-target-missing" = "slot-missing"
): Problem {
  const runtimeTargetMissing = reason === "runtime-target-missing";
  return {
    id: `imported-material-slot-unresolved:${node.ownerObjectId}:${node.id}:${slotId}`,
    severity: "warning",
    code: "imported-material-slot-unresolved",
    objectId: node.ownerObjectId,
    ...(assetId ? { assetId } : {}),
    source: "runtime",
    target: {
      kind: "imported-material-slot",
      objectId: node.ownerObjectId,
      nodeId: node.id,
      importKey: node.importKey,
      slotId
    },
    recoverability: "user-action",
    message: runtimeTargetMissing
      ? `Imported material slot ${slotId} has no matched runtime target.`
      : `Imported material slot ${slotId} could not be remapped during GLB reimport.`,
    display: {
      title: runtimeTargetMissing ? "Imported material slot unavailable" : "Imported material slot needs remap",
      detail: runtimeTargetMissing
        ? `Material assignment target ${slotId} remains durable but no runtime imported target was registered.`
        : `Material assignment target ${slotId} remains durable but no replacement slot was matched.`,
      actionLabel: runtimeTargetMissing ? "Review imported target" : "Review remap"
    },
    metadata: {
      importKey: node.importKey,
      slotId,
      reason,
      previousImportKey: node.remap?.previousImportKey ?? node.importKey
    }
  };
}

export function createImportedMaterialSlotAssignmentUnresolvedProblem(
  objectId: string,
  slotId: string,
  assetId?: string,
  reason = `Imported material slot ${slotId} could not be resolved.`
): Problem {
  return {
    id: `imported-material-slot-unresolved:${objectId}:assignment:${slotId}`,
    severity: "warning",
    code: "imported-material-slot-unresolved",
    objectId,
    ...(assetId ? { assetId } : {}),
    source: "runtime",
    target: { kind: "object", objectId },
    recoverability: "user-action",
    message: reason,
    display: {
      title: "Imported material slot needs remap",
      detail: `Material assignment target ${slotId} remains durable but no imported slot was matched.`,
      actionLabel: "Review remap"
    },
    metadata: { slotId }
  };
}

export function createImportedMaterialSlotProjectionProblem(
  node: SceneImportedGlbNode,
  slotId: string,
  reason: string,
  assetId?: string
): Problem {
  return {
    id: `imported-material-slot-projection-failed:${node.ownerObjectId}:${node.id}:${slotId}`,
    severity: "warning",
    code: "imported-material-slot-projection-failed",
    objectId: node.ownerObjectId,
    ...(assetId ? { assetId } : {}),
    source: "runtime",
    target: {
      kind: "imported-material-slot",
      objectId: node.ownerObjectId,
      nodeId: node.id,
      importKey: node.importKey,
      slotId
    },
    recoverability: "user-action",
    message: reason,
    display: {
      title: "Imported material slot could not be projected",
      detail: reason,
      actionLabel: "Review material slot"
    },
    metadata: {
      importKey: node.importKey,
      slotId,
      sourceKind: node.source.kind,
      sourcePath: node.source.path
    }
  };
}

export function createImportedTargetAmbiguousProblem(match: RuntimeImportedTargetMatch): Problem {
  return {
    id: `imported-target-ambiguous:${match.ownerObjectId}:${match.node.id}:${match.importKey}`,
    severity: "warning",
    code: "imported-target-ambiguous",
    objectId: match.ownerObjectId,
    source: "runtime",
    target: {
      kind: "imported-target",
      objectId: match.ownerObjectId,
      nodeId: match.node.id,
      importKey: match.importKey
    },
    recoverability: "user-action",
    message: match.message ?? `Imported target ${match.importKey} matched multiple runtime objects.`,
    display: {
      title: "Imported target match is ambiguous",
      detail: match.message ?? `The runtime could not choose one loaded GLB object for ${match.importKey}.`
    },
    metadata: {
      importKey: match.importKey,
      sourceKind: match.source.kind,
      sourcePath: match.source.path
    }
  };
}

export function createImportedTargetNonTransformableProblem(match: RuntimeImportedTargetMatch): Problem {
  return {
    id: `imported-target-non-transformable:${match.ownerObjectId}:${match.node.id}:${match.importKey}`,
    severity: "info",
    code: "imported-target-non-transformable",
    objectId: match.ownerObjectId,
    source: "runtime",
    target: {
      kind: "imported-target",
      objectId: match.ownerObjectId,
      nodeId: match.node.id,
      importKey: match.importKey
    },
    recoverability: "automatic",
    message: `Imported target ${match.importKey} is linked to a shared runtime object and cannot be transformed independently.`,
    display: {
      title: "Imported target cannot be transformed independently"
    },
    metadata: {
      importKey: match.importKey,
      sourceKind: match.source.kind,
      sourcePath: match.source.path,
      aliasNodeIds: match.aliasNodeIds
    }
  };
}

function formatRole(role: EnvironmentProjectionRole): string {
  return role === "background" ? "Background" : "Environment";
}
