import { createImportedGlbTargetDescriptors } from "../imported-targets/keys";
import type {
  ImportedGlbMaterialSlotDescriptor,
  ImportedGlbSourceDescriptor,
  ImportedGlbTargetDescriptor
} from "../imported-targets/types";
import type { SceneImportedGlbNode } from "../snapshot/types";
import type { GlbImportManifest } from "./import-pipeline";

export type GlbImportRemapMatchKind = "exact" | "source" | "relationship" | "name";
export type GlbImportRemapConfidence = "exact" | "high" | "medium" | "low";

export interface GlbImportTargetRemap {
  previousNodeId: string;
  previousImportKey: string;
  previousMaterialSlots: ImportedGlbMaterialSlotDescriptor[];
  nextImportKey: string;
  nextDescriptor: ImportedGlbTargetDescriptor;
  kind: GlbImportRemapMatchKind;
  confidence: GlbImportRemapConfidence;
  reason: string;
}

export interface GlbImportUnresolvedTarget {
  nodeId: string;
  previousImportKey: string;
  candidateImportKeys: string[];
  reason: string;
}

export interface GlbImportNewTarget {
  importKey: string;
  descriptor: ImportedGlbTargetDescriptor;
}

export interface GlbImportSlotRemap {
  nodeId: string;
  previousImportKey: string;
  nextImportKey: string;
  previousSlotKey: string;
  nextSlotKey: string;
  nextSlot: ImportedGlbMaterialSlotDescriptor;
  confidence: GlbImportRemapConfidence;
  reason: string;
}

export interface GlbImportUnresolvedSlot {
  nodeId: string;
  importKey: string;
  slotKey: string;
  candidateSlotKeys: string[];
  reason: string;
}

export interface GlbImportRemapSummary {
  exactTargetCount: number;
  remappedTargetCount: number;
  unresolvedTargetCount: number;
  newTargetCount: number;
  remappedSlotCount: number;
  unresolvedSlotCount: number;
}

export interface GlbImportRemapPlan {
  ownerObjectId: string;
  targetRemaps: GlbImportTargetRemap[];
  unresolvedTargets: GlbImportUnresolvedTarget[];
  newTargets: GlbImportNewTarget[];
  slotRemaps: GlbImportSlotRemap[];
  unresolvedSlots: GlbImportUnresolvedSlot[];
  summary: GlbImportRemapSummary;
}

export interface PlanGlbImportRemapOptions {
  ownerObjectId: string;
  currentTargets: readonly SceneImportedGlbNode[];
  replacementManifest: GlbImportManifest;
  idPrefix?: string;
}

interface MatchCandidate {
  descriptor: ImportedGlbTargetDescriptor;
  kind: GlbImportRemapMatchKind;
  confidence: GlbImportRemapConfidence;
  reason: string;
}

export function planGlbImportRemap(options: PlanGlbImportRemapOptions): GlbImportRemapPlan {
  const currentTargets = [...options.currentTargets]
    .filter((node) => node.ownerObjectId === options.ownerObjectId)
    .sort((left, right) => compareStrings(left.id, right.id));
  const nextDescriptors = createImportedGlbTargetDescriptors({
    ownerObjectId: options.ownerObjectId,
    manifest: options.replacementManifest,
    ...(options.idPrefix ? { idPrefix: options.idPrefix } : {})
  }).sort((left, right) => compareStrings(left.importKey, right.importKey));

  const descriptorsByImportKey = new Map(nextDescriptors.map((descriptor) => [descriptor.importKey, descriptor]));
  const usedNextImportKeys = new Set<string>();
  const targetRemaps: GlbImportTargetRemap[] = [];
  const unresolvedTargets: GlbImportUnresolvedTarget[] = [];

  for (const current of currentTargets) {
    const exact = descriptorsByImportKey.get(current.importKey);
    if (exact && !usedNextImportKeys.has(exact.importKey)) {
      targetRemaps.push(createTargetRemap(current, exact, "exact", "exact", "Matched by stable import key."));
      usedNextImportKeys.add(exact.importKey);
      continue;
    }

    const candidates = findTargetCandidates(current, nextDescriptors, usedNextImportKeys)
      .sort(compareCandidates);
    const selected = candidates.find((candidate, index) =>
      candidate.confidence !== "low" &&
      (candidates.length === 1 || (index === 0 && isHigherConfidence(candidate, candidates[1])))
    );

    if (selected) {
      targetRemaps.push(createTargetRemap(
        current,
        selected.descriptor,
        selected.kind,
        selected.confidence,
        selected.reason
      ));
      usedNextImportKeys.add(selected.descriptor.importKey);
      continue;
    }

    unresolvedTargets.push({
      nodeId: current.id,
      previousImportKey: current.importKey,
      candidateImportKeys: candidates.map((candidate) => candidate.descriptor.importKey).sort(compareStrings),
      reason: candidates.length > 0
        ? "Multiple replacement targets matched with the same confidence."
        : "No replacement target matched the previous source descriptor."
    });
  }

  const newTargets = nextDescriptors
    .filter((descriptor) => !usedNextImportKeys.has(descriptor.importKey))
    .map((descriptor) => ({
      importKey: descriptor.importKey,
      descriptor
    }));
  const slotPlan = planSlotRemaps(targetRemaps);

  return {
    ownerObjectId: options.ownerObjectId,
    targetRemaps,
    unresolvedTargets,
    newTargets,
    slotRemaps: slotPlan.slotRemaps,
    unresolvedSlots: slotPlan.unresolvedSlots,
    summary: {
      exactTargetCount: targetRemaps.filter((remap) => remap.kind === "exact").length,
      remappedTargetCount: targetRemaps.filter((remap) => remap.kind !== "exact").length,
      unresolvedTargetCount: unresolvedTargets.length,
      newTargetCount: newTargets.length,
      remappedSlotCount: slotPlan.slotRemaps.length,
      unresolvedSlotCount: slotPlan.unresolvedSlots.length
    }
  };
}

function createTargetRemap(
  current: SceneImportedGlbNode,
  nextDescriptor: ImportedGlbTargetDescriptor,
  kind: GlbImportRemapMatchKind,
  confidence: GlbImportRemapConfidence,
  reason: string
): GlbImportTargetRemap {
  return {
    previousNodeId: current.id,
    previousImportKey: current.importKey,
    previousMaterialSlots: cloneMaterialSlots(current.materialSlots ?? []),
    nextImportKey: nextDescriptor.importKey,
    nextDescriptor,
    kind,
    confidence,
    reason
  };
}

function findTargetCandidates(
  current: SceneImportedGlbNode,
  descriptors: readonly ImportedGlbTargetDescriptor[],
  usedImportKeys: ReadonlySet<string>
): MatchCandidate[] {
  const available = descriptors.filter((descriptor) =>
    !usedImportKeys.has(descriptor.importKey) &&
    descriptor.source.kind === current.source.kind
  );
  const sourceMatches = available
    .filter((descriptor) => sourcesShareStableIdentity(current.source, descriptor.source))
    .map((descriptor) => ({
      descriptor,
      kind: "source" as const,
      confidence: "high" as const,
      reason: "Matched by source descriptor identity."
    }));
  if (sourceMatches.length > 0) {
    return sourceMatches;
  }

  const relationshipMatches = available
    .filter((descriptor) => sourcesShareRelationship(current.source, descriptor.source))
    .map((descriptor) => ({
      descriptor,
      kind: "relationship" as const,
      confidence: "medium" as const,
      reason: "Matched by unique mesh, primitive, material, or camera relationship."
    }));
  if (relationshipMatches.length > 0) {
    return relationshipMatches;
  }

  return available
    .filter((descriptor) => normalizeName(descriptor.displayName) === normalizeName(current.name))
    .map((descriptor) => ({
      descriptor,
      kind: "name" as const,
      confidence: "low" as const,
      reason: "Matched by display name only."
    }));
}

function sourcesShareStableIdentity(left: ImportedGlbSourceDescriptor, right: ImportedGlbSourceDescriptor): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.fingerprint && right.fingerprint && left.fingerprint === right.fingerprint) {
    return true;
  }
  if (left.path === right.path && left.index === right.index) {
    return true;
  }
  return left.index !== undefined && left.index === right.index && left.path === right.path;
}

function sourcesShareRelationship(left: ImportedGlbSourceDescriptor, right: ImportedGlbSourceDescriptor): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "primitive":
      return left.meshIndex !== undefined &&
        left.meshIndex === right.meshIndex &&
        left.primitiveIndex !== undefined &&
        left.primitiveIndex === right.primitiveIndex &&
        left.materialIndex !== undefined &&
        left.materialIndex === right.materialIndex;
    case "mesh":
      return left.meshIndex !== undefined && left.meshIndex === right.meshIndex;
    case "node":
      return (left.meshIndex !== undefined && left.meshIndex === right.meshIndex) ||
        (left.cameraIndex !== undefined && left.cameraIndex === right.cameraIndex);
    case "camera":
      return left.cameraIndex !== undefined && left.cameraIndex === right.cameraIndex;
    case "material":
      return left.materialIndex !== undefined && left.materialIndex === right.materialIndex;
    case "scene":
      return left.index !== undefined && left.index === right.index;
    default:
      return false;
  }
}

function planSlotRemaps(targetRemaps: readonly GlbImportTargetRemap[]): {
  slotRemaps: GlbImportSlotRemap[];
  unresolvedSlots: GlbImportUnresolvedSlot[];
} {
  const slotRemaps: GlbImportSlotRemap[] = [];
  const unresolvedSlots: GlbImportUnresolvedSlot[] = [];

  for (const remap of targetRemaps) {
    const previousSlots = remapPreviousSlots(remap);
    const nextSlots = remap.nextDescriptor.materialSlots ?? [];
    const usedNextSlotKeys = new Set<string>();
    for (const previousSlot of previousSlots) {
      const exact = nextSlots.find((slot) => slot.slotKey === previousSlot.slotKey);
      if (exact && !usedNextSlotKeys.has(exact.slotKey)) {
        slotRemaps.push(createSlotRemap(remap, previousSlot, exact, "exact", "Matched by stable slot key."));
        usedNextSlotKeys.add(exact.slotKey);
        continue;
      }

      const candidates = nextSlots
        .filter((slot) => !usedNextSlotKeys.has(slot.slotKey))
        .filter((slot) => slotsShareIdentity(previousSlot, slot))
        .sort((left, right) => compareStrings(left.slotKey, right.slotKey));

      if (candidates.length === 1) {
        slotRemaps.push(createSlotRemap(remap, previousSlot, candidates[0], "high", "Matched by material slot source identity."));
        usedNextSlotKeys.add(candidates[0].slotKey);
      } else {
        unresolvedSlots.push({
          nodeId: remap.previousNodeId,
          importKey: remap.nextImportKey,
          slotKey: previousSlot.slotKey,
          candidateSlotKeys: candidates.map((slot) => slot.slotKey),
          reason: candidates.length > 1
            ? "Multiple replacement material slots matched."
            : "No replacement material slot matched."
        });
      }
    }
  }

  return { slotRemaps, unresolvedSlots };
}

function remapPreviousSlots(remap: GlbImportTargetRemap): ImportedGlbMaterialSlotDescriptor[] {
  return remap.previousMaterialSlots;
}

function createSlotRemap(
  remap: GlbImportTargetRemap,
  previousSlot: ImportedGlbMaterialSlotDescriptor,
  nextSlot: ImportedGlbMaterialSlotDescriptor,
  confidence: GlbImportRemapConfidence,
  reason: string
): GlbImportSlotRemap {
  return {
    nodeId: remap.previousNodeId,
    previousImportKey: remap.previousImportKey,
    nextImportKey: remap.nextImportKey,
    previousSlotKey: previousSlot.slotKey,
    nextSlotKey: nextSlot.slotKey,
    nextSlot,
    confidence,
    reason
  };
}

function slotsShareIdentity(
  left: ImportedGlbMaterialSlotDescriptor,
  right: ImportedGlbMaterialSlotDescriptor
): boolean {
  if (
    left.source.meshIndex !== undefined &&
    left.source.meshIndex === right.source.meshIndex &&
    left.source.primitiveIndex !== undefined &&
    left.source.primitiveIndex === right.source.primitiveIndex &&
    left.source.materialIndex === right.source.materialIndex
  ) {
    return true;
  }
  return Boolean(left.materialImportKey && left.materialImportKey === right.materialImportKey);
}

function cloneMaterialSlots(slots: readonly ImportedGlbMaterialSlotDescriptor[]): ImportedGlbMaterialSlotDescriptor[] {
  return slots.map((slot) => ({
    ...slot,
    source: { ...slot.source },
    ...(slot.metadata ? { metadata: { ...slot.metadata } } : {})
  }));
}

function compareCandidates(left: MatchCandidate, right: MatchCandidate): number {
  return compareNumbers(confidenceRank(right.confidence), confidenceRank(left.confidence)) ||
    compareStrings(left.descriptor.importKey, right.descriptor.importKey);
}

function isHigherConfidence(candidate: MatchCandidate, next: MatchCandidate | undefined): boolean {
  return !next || confidenceRank(candidate.confidence) > confidenceRank(next.confidence);
}

function confidenceRank(confidence: GlbImportRemapConfidence): number {
  switch (confidence) {
    case "exact":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return assertNever(confidence);
  }
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported remap value: ${JSON.stringify(value)}`);
}
