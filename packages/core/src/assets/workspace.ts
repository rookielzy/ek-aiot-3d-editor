import type { MaterialAssignment, TextureSlotName } from "../materials/types";
import type { Problem, ProblemSeverity } from "../problems/types";
import type { ProjectCompleteness, ProjectProblem } from "../project/package-types";
import { findObjectNodeId } from "../snapshot/nodes";
import type { AssetKind, AssetReference, JsonValue, SceneSnapshot } from "../snapshot/types";
import {
  getGlbImportManifestFromMetadata,
  resolveGlbImportStatus,
  type GlbImportManifest,
  type GlbImportStatus
} from "./import-pipeline";

export type AssetWorkspaceReferenceKind =
  | "object-glb"
  | "material-texture"
  | "environment-background"
  | "environment-lighting"
  | "environment-cubemap-face";

export type AssetWorkspacePayloadStatus = "available" | "missing" | "not-required" | "kind-mismatch";
export type AssetWorkspacePackageStatus = "complete" | "partial" | "blocked" | "not-referenced";
export type AssetWorkspaceStatus = "ready" | "missing-payload" | "missing-reference" | "has-problems" | "unreferenced";
export type AssetWorkspaceSortKey = "label" | "kind" | "referenced" | "payload" | "severity" | "status";

export interface AssetReferenceLocationBase {
  kind: AssetWorkspaceReferenceKind;
  assetId: string;
  label: string;
}

export interface ObjectAssetReferenceLocation extends AssetReferenceLocationBase {
  kind: "object-glb";
  objectId: string;
  nodeId?: string;
  objectName: string;
}

export interface MaterialTextureAssetReferenceLocation extends AssetReferenceLocationBase {
  kind: "material-texture";
  materialId: string;
  materialName: string;
  slot: TextureSlotName;
  assignmentId?: string;
  objectId?: string;
  assignmentTarget?: string;
}

export interface EnvironmentBackgroundAssetReferenceLocation extends AssetReferenceLocationBase {
  kind: "environment-background";
  sourceKind: "flat-image" | "equirectangular" | "hdr";
}

export interface EnvironmentLightingAssetReferenceLocation extends AssetReferenceLocationBase {
  kind: "environment-lighting";
  sourceKind: "equirectangular" | "hdr";
}

export interface EnvironmentCubemapFaceAssetReferenceLocation extends AssetReferenceLocationBase {
  kind: "environment-cubemap-face";
  source: "background" | "lighting";
  faceRole: string;
}

export type AssetReferenceLocation =
  | ObjectAssetReferenceLocation
  | MaterialTextureAssetReferenceLocation
  | EnvironmentBackgroundAssetReferenceLocation
  | EnvironmentLightingAssetReferenceLocation
  | EnvironmentCubemapFaceAssetReferenceLocation;

export interface AssetWorkspacePayloadSummary {
  assetId: string;
  kind: AssetKind;
  available: boolean;
  exportable: boolean;
  label?: string;
  mimeType?: string;
  byteSize?: number;
  checksum?: string;
  metadata?: Record<string, JsonValue>;
}

export interface AssetWorkspaceProblemSummary {
  id: string;
  severity: ProblemSeverity;
  code: string;
  source: Problem["source"];
  title: string;
  detail?: string;
  recoverability: Problem["recoverability"];
  actionLabel?: string;
  assetId?: string;
  objectId?: string;
  target: Problem["target"];
  project: boolean;
}

export interface AssetWorkspaceItem {
  id: string;
  label: string;
  kind: AssetKind;
  registered: boolean;
  referenced: boolean;
  missingReference: boolean;
  snapshotAsset?: AssetReference;
  metadata?: Record<string, JsonValue>;
  references: AssetReferenceLocation[];
  referenceCount: number;
  payload: AssetWorkspacePayloadSummary | null;
  payloadStatus: AssetWorkspacePayloadStatus;
  packageStatus: AssetWorkspacePackageStatus;
  packageBlocking: boolean;
  importStatus?: GlbImportStatus;
  importManifest?: GlbImportManifest | null;
  importDiagnostics?: AssetWorkspaceProblemSummary[];
  problems: AssetWorkspaceProblemSummary[];
  problemIds: string[];
  problemCount: number;
  highestProblemSeverity: ProblemSeverity | null;
  missing: boolean;
  recoverable: boolean;
  actionLabel?: string;
  status: AssetWorkspaceStatus;
  searchText: string;
}

export interface AssetWorkspaceReadiness {
  completeness: ProjectCompleteness;
  ready: boolean;
  blockingAssetIds: string[];
  missingPayloadAssetIds: string[];
  missingReferenceAssetIds: string[];
  problemAssetIds: string[];
}

export interface AssetWorkspaceModel {
  items: AssetWorkspaceItem[];
  totalCount: number;
  referencedCount: number;
  unreferencedCount: number;
  missingPayloadCount: number;
  missingReferenceCount: number;
  problemCount: number;
  availablePayloadCount: number;
  readiness: AssetWorkspaceReadiness;
  filters: {
    kinds: AssetKind[];
    statuses: AssetWorkspaceStatus[];
    payloadStatuses: AssetWorkspacePayloadStatus[];
  };
}

export interface BuildAssetWorkspaceOptions {
  payloads?: readonly AssetWorkspacePayloadSummary[];
  problems?: readonly (Problem | ProjectProblem | AssetWorkspaceProblemSummary)[];
  projectCompleteness?: ProjectCompleteness;
}

export interface FilterAssetWorkspaceOptions {
  query?: string;
  kinds?: readonly AssetKind[];
  statuses?: readonly AssetWorkspaceStatus[];
  payloadStatuses?: readonly AssetWorkspacePayloadStatus[];
  referenced?: boolean;
  missing?: boolean;
  hasProblems?: boolean;
}

export interface SortAssetWorkspaceOptions {
  key?: AssetWorkspaceSortKey;
  direction?: "asc" | "desc";
}

const SEVERITY_RANK: Record<ProblemSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2
};

export function collectAssetReferenceLocations(snapshot: SceneSnapshot): AssetReferenceLocation[] {
  const locations: AssetReferenceLocation[] = [];

  for (const object of Object.values(snapshot.objects).sort(byId)) {
    const nodeId = findObjectNodeId(snapshot, object.id);
    locations.push({
      kind: "object-glb",
      assetId: object.asset.id,
      objectId: object.id,
      ...(nodeId ? { nodeId } : {}),
      objectName: object.name,
      label: `Object ${object.name}`
    });
  }

  for (const material of Object.values(snapshot.materials.definitions).sort(byId)) {
    const textureEntries = Object.entries(material.override.textures ?? {}) as [TextureSlotName, { assetId: string } | undefined][];
    for (const [slot, texture] of textureEntries.sort(([left], [right]) => compareStrings(left, right))) {
      if (!texture?.assetId) {
        continue;
      }
      const assignments = Object.values(snapshot.materials.assignments)
        .filter((candidate) => candidate.materialId === material.id)
        .sort(byId);
      if (assignments.length === 0) {
        locations.push(createMaterialTextureReferenceLocation(texture.assetId, material.id, material.name, slot));
        continue;
      }
      for (const assignment of assignments) {
        locations.push(createMaterialTextureReferenceLocation(texture.assetId, material.id, material.name, slot, assignment));
      }
    }
  }

  const backgroundSource = snapshot.environment.background.source;
  if ((backgroundSource.kind === "flat-image" || backgroundSource.kind === "equirectangular" || backgroundSource.kind === "hdr") && backgroundSource.assetId) {
    locations.push({
      kind: "environment-background",
      assetId: backgroundSource.assetId,
      sourceKind: backgroundSource.kind,
      label: "Environment background"
    });
  }
  if (backgroundSource.kind === "cubemap") {
    for (const face of backgroundSource.faces) {
      locations.push({
        kind: "environment-cubemap-face",
        source: "background",
        faceRole: face.role,
        assetId: face.assetId,
        label: `Environment skybox ${face.role}`
      });
    }
  }

  const lightingSource = snapshot.environment.lighting.source;
  if ((lightingSource.kind === "equirectangular" || lightingSource.kind === "hdr") && lightingSource.assetId) {
    locations.push({
      kind: "environment-lighting",
      assetId: lightingSource.assetId,
      sourceKind: lightingSource.kind,
      label: "Environment lighting"
    });
  }
  if (lightingSource.kind === "cubemap") {
    for (const face of lightingSource.faces) {
      locations.push({
        kind: "environment-cubemap-face",
        source: "lighting",
        faceRole: face.role,
        assetId: face.assetId,
        label: `Environment lighting cubemap ${face.role}`
      });
    }
  }

  return locations.sort((left, right) =>
    compareStrings(left.assetId, right.assetId) ||
    compareStrings(left.kind, right.kind) ||
    compareStrings(left.label, right.label)
  );
}

export function buildAssetWorkspaceModel(snapshot: SceneSnapshot, options: BuildAssetWorkspaceOptions = {}): AssetWorkspaceModel {
  const referenceLocations = collectAssetReferenceLocations(snapshot);
  const referencesByAsset = groupReferencesByAsset(referenceLocations);
  const payloadsByAsset = new Map((options.payloads ?? []).map((payload) => [payload.assetId, payload]));
  const problems = (options.problems ?? []).map(normalizeProblemSummary);
  const problemsByAsset = groupProblemsByAsset(problems);
  const assetIds = new Set<string>([
    ...Object.keys(snapshot.assets),
    ...referenceLocations.map((location) => location.assetId),
    ...payloadsByAsset.keys(),
    ...problems.map((problem) => problem.assetId).filter(isString)
  ]);
  const items = [...assetIds].sort(compareStrings).map((assetId) =>
    buildAssetWorkspaceItem(snapshot, assetId, referencesByAsset.get(assetId) ?? [], payloadsByAsset.get(assetId), problemsByAsset.get(assetId) ?? [])
  );
  const missingPayloadAssetIds = items
    .filter((item) => item.packageBlocking && (item.payloadStatus === "missing" || item.payloadStatus === "kind-mismatch"))
    .map((item) => item.id);
  const missingReferenceAssetIds = items.filter((item) => item.missingReference).map((item) => item.id);
  const problemAssetIds = items.filter((item) => item.problemCount > 0).map((item) => item.id);
  const blockingAssetIds = uniqueSorted([
    ...missingPayloadAssetIds,
    ...missingReferenceAssetIds,
    ...items.filter((item) => item.packageBlocking).map((item) => item.id)
  ]);
  const completeness = options.projectCompleteness ?? (blockingAssetIds.length > 0 ? "partial" : "complete");

  return {
    items,
    totalCount: items.length,
    referencedCount: items.filter((item) => item.referenced).length,
    unreferencedCount: items.filter((item) => !item.referenced).length,
    missingPayloadCount: missingPayloadAssetIds.length,
    missingReferenceCount: missingReferenceAssetIds.length,
    problemCount: items.reduce((count, item) => count + item.problemCount, 0),
    availablePayloadCount: items.filter((item) => item.payloadStatus === "available").length,
    readiness: {
      completeness,
      ready: completeness === "complete" && blockingAssetIds.length === 0 && problemAssetIds.length === 0,
      blockingAssetIds,
      missingPayloadAssetIds,
      missingReferenceAssetIds,
      problemAssetIds
    },
    filters: {
      kinds: uniqueSorted(items.map((item) => item.kind)),
      statuses: uniqueSorted(items.map((item) => item.status)),
      payloadStatuses: uniqueSorted(items.map((item) => item.payloadStatus))
    }
  };
}

export function filterAssetWorkspaceItems(
  items: readonly AssetWorkspaceItem[],
  options: FilterAssetWorkspaceOptions = {}
): AssetWorkspaceItem[] {
  const query = normalizeSearch(options.query);
  const kinds = options.kinds ? new Set(options.kinds) : null;
  const statuses = options.statuses ? new Set(options.statuses) : null;
  const payloadStatuses = options.payloadStatuses ? new Set(options.payloadStatuses) : null;

  return items.filter((item) => {
    if (query && !item.searchText.includes(query)) {
      return false;
    }
    if (kinds && !kinds.has(item.kind)) {
      return false;
    }
    if (statuses && !statuses.has(item.status)) {
      return false;
    }
    if (payloadStatuses && !payloadStatuses.has(item.payloadStatus)) {
      return false;
    }
    if (options.referenced !== undefined && item.referenced !== options.referenced) {
      return false;
    }
    if (options.missing !== undefined && item.missing !== options.missing) {
      return false;
    }
    if (options.hasProblems !== undefined && (item.problemCount > 0) !== options.hasProblems) {
      return false;
    }
    return true;
  });
}

export function sortAssetWorkspaceItems(
  items: readonly AssetWorkspaceItem[],
  options: SortAssetWorkspaceOptions = {}
): AssetWorkspaceItem[] {
  const key = options.key ?? "label";
  const direction = options.direction === "desc" ? -1 : 1;
  return [...items].sort((left, right) => direction * compareWorkspaceItems(left, right, key));
}

function buildAssetWorkspaceItem(
  snapshot: SceneSnapshot,
  assetId: string,
  references: AssetReferenceLocation[],
  payload: AssetWorkspacePayloadSummary | undefined,
  problems: AssetWorkspaceProblemSummary[]
): AssetWorkspaceItem {
  const snapshotAsset = snapshot.assets[assetId];
  const kind = snapshotAsset?.kind ?? payload?.kind ?? inferKindFromReferences(references);
  const metadata = mergeMetadata(snapshotAsset?.metadata, payload?.metadata);
  const importManifest = getGlbImportManifestFromMetadata(metadata);
  const importDiagnostics = (importManifest?.diagnostics ?? [])
    .map((diagnostic): AssetWorkspaceProblemSummary => ({
      id: `glb-import:${assetId}:${diagnostic.id}`,
      severity: diagnostic.severity,
      code: diagnostic.code,
      source: "runtime",
      title: diagnostic.display.title,
      detail: diagnostic.display.detail ?? diagnostic.message,
      recoverability: diagnostic.recoverability,
      ...(diagnostic.display.actionLabel ? { actionLabel: diagnostic.display.actionLabel } : {}),
      assetId,
      target: { kind: "asset", assetId },
      project: false
    }))
    .filter((diagnostic) => !problems.some((problem) => isEquivalentWorkspaceProblem(problem, diagnostic)));
  const allProblems = [...problems, ...importDiagnostics].sort((left, right) => compareStrings(left.id, right.id));
  const referenced = references.length > 0;
  const registered = Boolean(snapshotAsset);
  const missingReference = referenced && !registered;
  const packageRequired = referenced || registered;
  const payloadStatus = resolvePayloadStatus(snapshotAsset, payload, packageRequired);
  const packageBlocking = packageRequired && (missingReference || payloadStatus === "missing" || payloadStatus === "kind-mismatch");
  const packageStatus = packageBlocking
    ? "blocked"
    : !packageRequired
      ? "not-referenced"
      : payloadStatus === "available"
        ? "complete"
        : !referenced
          ? "not-referenced"
          : "partial";
  const highestProblemSeverity = highestSeverity(allProblems);
  const missing = missingReference || (referenced && payloadStatus === "missing") || allProblems.some(isMissingProblem);
  const recoverableProblem = allProblems.find((problem) => problem.actionLabel || problem.recoverability === "user-action");
  const status = missingReference
    ? "missing-reference"
    : referenced && (payloadStatus === "missing" || payloadStatus === "kind-mismatch")
      ? "missing-payload"
      : allProblems.length > 0
        ? "has-problems"
        : referenced
          ? "ready"
          : "unreferenced";
  const label = snapshotAsset?.label ?? payload?.label ?? assetId;
  const item: AssetWorkspaceItem = {
    id: assetId,
    label,
    kind,
    registered,
    referenced,
    missingReference,
    ...(snapshotAsset ? { snapshotAsset: cloneAssetReference(snapshotAsset) } : {}),
    ...(metadata ? { metadata } : {}),
    references: references.map(cloneReferenceLocation),
    referenceCount: references.length,
    payload: payload ? clonePayloadSummary(payload) : null,
    payloadStatus,
    packageStatus,
    packageBlocking,
    importStatus: resolveGlbImportStatus(kind, importManifest),
    importManifest,
    importDiagnostics,
    problems: allProblems,
    problemIds: allProblems.map((problem) => problem.id),
    problemCount: allProblems.length,
    highestProblemSeverity,
    missing,
    recoverable: allProblems.some((problem) => problem.recoverability === "user-action"),
    ...(recoverableProblem?.actionLabel ? { actionLabel: recoverableProblem.actionLabel } : {}),
    status,
    searchText: ""
  };
  item.searchText = createSearchText(item);
  return item;
}

function normalizeProblemSummary(problem: Problem | ProjectProblem | AssetWorkspaceProblemSummary): AssetWorkspaceProblemSummary {
  if (isAssetWorkspaceProblemSummary(problem)) {
    const assetId = problem.assetId ?? extractProblemTargetAssetId(problem.target);
    return {
      ...problem,
      ...(assetId ? { assetId } : {}),
      target: { ...problem.target }
    };
  }
  const assetId = extractProblemAssetId(problem);
  return {
    id: problem.id,
    severity: problem.severity,
    code: problem.code,
    source: problem.source,
    title: problem.display?.title ?? problem.message,
    ...(problem.display?.detail ?? problem.message ? { detail: problem.display?.detail ?? problem.message } : {}),
    recoverability: problem.recoverability,
    ...(problem.display?.actionLabel ?? (problem.recoverability === "user-action" ? "Replace asset" : undefined)
      ? { actionLabel: problem.display?.actionLabel ?? "Replace asset" }
      : {}),
    ...(assetId ? { assetId } : {}),
    ...(problem.objectId ? { objectId: problem.objectId } : {}),
    target: { ...problem.target },
    project: problem.source === "validation" && problem.id.startsWith("project:")
  };
}

function isEquivalentWorkspaceProblem(left: AssetWorkspaceProblemSummary, right: AssetWorkspaceProblemSummary): boolean {
  return left.assetId === right.assetId &&
    left.code === right.code &&
    left.title === right.title &&
    (left.detail ?? "") === (right.detail ?? "");
}

function isAssetWorkspaceProblemSummary(problem: Problem | ProjectProblem | AssetWorkspaceProblemSummary): problem is AssetWorkspaceProblemSummary {
  return "project" in problem && typeof problem.project === "boolean";
}

function extractProblemAssetId(problem: Problem | ProjectProblem): string {
  if (problem.assetId) {
    return problem.assetId;
  }
  const targetAssetId = extractProblemTargetAssetId(problem.target);
  if (targetAssetId) {
    return targetAssetId;
  }
  const metadataAssetId = problem.metadata?.assetId;
  return typeof metadataAssetId === "string" ? metadataAssetId : "";
}

function extractProblemTargetAssetId(target: Problem["target"]): string {
  if (target.kind === "asset" || target.kind === "environment" || target.kind === "texture-slot") {
    return target.assetId ?? "";
  }
  return "";
}

function groupReferencesByAsset(locations: readonly AssetReferenceLocation[]): Map<string, AssetReferenceLocation[]> {
  const grouped = new Map<string, AssetReferenceLocation[]>();
  for (const location of locations) {
    const references = grouped.get(location.assetId) ?? [];
    references.push(location);
    grouped.set(location.assetId, references);
  }
  return grouped;
}

function groupProblemsByAsset(problems: readonly AssetWorkspaceProblemSummary[]): Map<string, AssetWorkspaceProblemSummary[]> {
  const grouped = new Map<string, AssetWorkspaceProblemSummary[]>();
  for (const problem of problems) {
    if (!problem.assetId) {
      continue;
    }
    const assetProblems = grouped.get(problem.assetId) ?? [];
    assetProblems.push(problem);
    grouped.set(problem.assetId, assetProblems);
  }
  for (const [assetId, assetProblems] of grouped) {
    grouped.set(assetId, assetProblems.sort((left, right) => compareStrings(left.id, right.id)));
  }
  return grouped;
}

function resolvePayloadStatus(
  snapshotAsset: AssetReference | undefined,
  payload: AssetWorkspacePayloadSummary | undefined,
  referenced: boolean
): AssetWorkspacePayloadStatus {
  if (!referenced) {
    return payload?.available ? "available" : "not-required";
  }
  if (!snapshotAsset) {
    return "missing";
  }
  if (!payload) {
    return "missing";
  }
  if (payload.kind !== snapshotAsset.kind) {
    return "kind-mismatch";
  }
  return payload.available && payload.exportable ? "available" : "missing";
}

function inferKindFromReferences(references: readonly AssetReferenceLocation[]): AssetKind {
  const environment = references.find((reference) => reference.kind === "environment-background" || reference.kind === "environment-lighting");
  if (environment && "sourceKind" in environment) {
    return environment.sourceKind === "hdr" ? "hdr" : "texture";
  }
  if (references.some((reference) => reference.kind === "environment-cubemap-face")) {
    return "texture";
  }
  if (references.some((reference) => reference.kind === "material-texture")) {
    return "texture";
  }
  return "glb";
}

function highestSeverity(problems: readonly Pick<AssetWorkspaceProblemSummary, "severity">[]): ProblemSeverity | null {
  let current: ProblemSeverity | null = null;
  for (const problem of problems) {
    if (!current || SEVERITY_RANK[problem.severity] > SEVERITY_RANK[current]) {
      current = problem.severity;
    }
  }
  return current;
}

function isMissingProblem(problem: AssetWorkspaceProblemSummary): boolean {
  return problem.recoverability === "user-action" &&
    (problem.code.includes("unresolved") || problem.code.includes("missing") || Boolean(problem.actionLabel));
}

function compareWorkspaceItems(left: AssetWorkspaceItem, right: AssetWorkspaceItem, key: AssetWorkspaceSortKey): number {
  switch (key) {
    case "kind":
      return compareStrings(left.kind, right.kind) || compareStrings(left.label, right.label) || compareStrings(left.id, right.id);
    case "referenced":
      return compareBooleans(right.referenced, left.referenced) || compareStrings(left.label, right.label) || compareStrings(left.id, right.id);
    case "payload":
      return compareStrings(left.payloadStatus, right.payloadStatus) || compareStrings(left.label, right.label) || compareStrings(left.id, right.id);
    case "severity":
      return compareNumbers(SEVERITY_RANK[right.highestProblemSeverity ?? "info"], SEVERITY_RANK[left.highestProblemSeverity ?? "info"]) ||
        compareStrings(left.label, right.label) ||
        compareStrings(left.id, right.id);
    case "status":
      return compareStrings(left.status, right.status) || compareStrings(left.label, right.label) || compareStrings(left.id, right.id);
    case "label":
    default:
      return compareStrings(left.label, right.label) || compareStrings(left.id, right.id);
  }
}

function createSearchText(item: AssetWorkspaceItem): string {
  return normalizeSearch([
    item.id,
    item.label,
    item.kind,
    item.status,
    item.payloadStatus,
    item.packageStatus,
    item.importStatus,
    ...item.references.map((reference) => reference.label),
    ...item.problems.flatMap((problem) => [problem.code, problem.title, problem.detail ?? "", problem.actionLabel ?? ""])
  ].join(" "));
}

function normalizeSearch(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function formatTextureSlot(slot: TextureSlotName): string {
  return slot.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`);
}

function createMaterialTextureReferenceLocation(
  assetId: string,
  materialId: string,
  materialName: string,
  slot: TextureSlotName,
  assignment?: MaterialAssignment
): MaterialTextureAssetReferenceLocation {
  return {
    kind: "material-texture",
    assetId,
    materialId,
    materialName,
    slot,
    ...(assignment ? { assignmentId: assignment.id, assignmentTarget: formatAssignmentTarget(assignment.target) } : {}),
    ...(assignment?.target.objectId ? { objectId: assignment.target.objectId } : {}),
    label: `${materialName} ${formatTextureSlot(slot)}`
  };
}

function formatAssignmentTarget(target: { kind: "object"; objectId: string } | { kind: "material-slot"; objectId: string; slotId: string }): string {
  return target.kind === "object" ? `object:${target.objectId}` : `material-slot:${target.objectId}:${target.slotId}`;
}

function cloneAssetReference(asset: AssetReference): AssetReference {
  return {
    id: asset.id,
    kind: asset.kind,
    ...(asset.label ? { label: asset.label } : {}),
    ...(asset.metadata ? { metadata: { ...asset.metadata } } : {})
  };
}

function clonePayloadSummary(payload: AssetWorkspacePayloadSummary): AssetWorkspacePayloadSummary {
  return {
    assetId: payload.assetId,
    kind: payload.kind,
    available: payload.available,
    exportable: payload.exportable,
    ...(payload.label ? { label: payload.label } : {}),
    ...(payload.mimeType ? { mimeType: payload.mimeType } : {}),
    ...(payload.byteSize !== undefined ? { byteSize: payload.byteSize } : {}),
    ...(payload.checksum ? { checksum: payload.checksum } : {}),
    ...(payload.metadata ? { metadata: { ...payload.metadata } } : {})
  };
}

function cloneReferenceLocation(location: AssetReferenceLocation): AssetReferenceLocation {
  return { ...location };
}

function mergeMetadata(
  left: Record<string, JsonValue> | undefined,
  right: Record<string, JsonValue> | undefined
): Record<string, JsonValue> | undefined {
  const merged = {
    ...(left ?? {}),
    ...(right ?? {})
  };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function byId<T extends { id: string }>(left: T, right: T): number {
  return compareStrings(left.id, right.id);
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function compareBooleans(left: boolean, right: boolean): number {
  return Number(left) - Number(right);
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort(compareStrings);
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}
