import {
  buildAssetWorkspaceModel,
  type AssetWorkspaceModel,
  type AssetWorkspacePayloadSummary
} from "../assets/workspace";
import { buildInspectorModel } from "../inspector/selection";
import type { InspectorModel, InspectorProblemItem } from "../inspector/types";
import type { HistoryState } from "../history/history";
import type { Problem, ProblemSeverity } from "../problems/types";
import type { ProjectCompleteness, ProjectProblem } from "../project/package-types";
import type { ViewportHelperStateSnapshot, ViewportHelperVisibility, ViewportSnapFeedbackState } from "../editor/viewport-helper-state";
import type { SnapSettings } from "../runtime/transform/snap";
import type { TransformMode } from "../runtime/transform/transform-mode";
import { deriveImportedRemapProblems } from "../runtime/remap-problems";
import type { AssetReference, SceneNode, SceneSnapshot } from "../snapshot/types";

export interface BuildWorkbenchModelOptions {
  inspector?: InspectorModel;
  history?: HistoryState;
  snap?: SnapSettings;
  viewportHelpers?: ViewportHelperStateSnapshot;
  transformMode?: TransformMode;
  runtimeReady?: boolean;
  runtimeProblems?: readonly Problem[];
  projectProblems?: readonly (ProjectProblem | Problem)[];
  projectCompleteness?: ProjectCompleteness;
  assetPayloads?: readonly AssetWorkspacePayloadSummary[];
  assetWorkspace?: AssetWorkspaceModel;
  dirty?: boolean;
}

export interface WorkbenchHierarchyModel {
  roots: WorkbenchHierarchyRow[];
  rows: WorkbenchHierarchyRow[];
  totalCount: number;
  selectedIds: string[];
  selectedCount: number;
  empty: boolean;
}

export interface WorkbenchHierarchyRow {
  id: string;
  label: string;
  kind: SceneNode["kind"];
  depth: number;
  parentId: string | null;
  childIds: string[];
  objectId?: string;
  lightId?: string;
  cameraViewId?: string;
  assetId?: string;
  selected: boolean;
  problemCount: number;
  problemIds: string[];
  highestProblemSeverity: ProblemSeverity | null;
}

export interface WorkbenchAssetModel {
  workspace?: AssetWorkspaceModel;
  items: WorkbenchAssetItem[];
  missing: WorkbenchMissingAssetItem[];
  totalCount: number;
  referencedCount: number;
  missingCount: number;
  empty: boolean;
}

export interface WorkbenchAssetItem {
  id: string;
  label: string;
  kind: AssetReference["kind"];
  referenced: boolean;
  missing: boolean;
  problemCount: number;
  problemIds: string[];
  highestProblemSeverity: ProblemSeverity | null;
}

export interface WorkbenchMissingAssetItem {
  problemId: string;
  assetId: string;
  objectId?: string;
  label: string;
  title: string;
  detail?: string;
  severity: ProblemSeverity;
  actionLabel?: string;
}

export interface WorkbenchProblemItem extends InspectorProblemItem {
  project: boolean;
}

export interface WorkbenchProblemsModel {
  items: WorkbenchProblemItem[];
  authoredCount: number;
  runtimeCount: number;
  projectCount: number;
  totalCount: number;
  bySeverity: Record<ProblemSeverity, number>;
}

export interface WorkbenchSelectionModel {
  count: number;
  label: string;
  nodeId: string | null;
  nodeIds: string[];
  nodeKind: InspectorModel["selection"]["nodeKind"];
  objectId: string | null;
  objectIds: string[];
  lightId: string | null;
  cameraViewId: string | null;
}

export interface WorkbenchToolbarModel {
  canUndo: boolean;
  canRedo: boolean;
  canCopy: boolean;
  canPaste: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  canSelectAll: boolean;
  canClearSelection: boolean;
  canFrameSelected: boolean;
  canFrameAll: boolean;
  canCaptureCameraView: boolean;
  canApplyCameraView: boolean;
  transformMode: TransformMode;
  snapEnabled: Record<keyof SnapSettings, boolean>;
  viewportHelpers: ViewportHelperVisibility;
}

export interface WorkbenchStatusModel {
  selectionLabel: string;
  selectionCount: number;
  undoCount: number;
  redoCount: number;
  runtimeReady: boolean;
  dirty: boolean;
  projectCompleteness: ProjectCompleteness;
  problemCount: number;
  authoredProblemCount: number;
  runtimeProblemCount: number;
  projectProblemCount: number;
  snapFeedback: ViewportSnapFeedbackState;
  snapFeedbackLabel: string;
}

export interface WorkbenchProjectModel {
  sceneId: string;
  sceneName: string;
  nodeCount: number;
  objectCount: number;
  lightCount: number;
  cameraViewCount: number;
  defaultCameraViewId: string | null;
  assetCount: number;
  completeness: ProjectCompleteness;
  problemCount: number;
  ready: boolean;
  statusLabel: string;
}

export interface WorkbenchModel {
  hierarchy: WorkbenchHierarchyModel;
  assets: WorkbenchAssetModel;
  problems: WorkbenchProblemsModel;
  selection: WorkbenchSelectionModel;
  toolbar: WorkbenchToolbarModel;
  status: WorkbenchStatusModel;
  project: WorkbenchProjectModel;
}

const EMPTY_HISTORY: HistoryState = { undoCount: 0, redoCount: 0 };
const EMPTY_SNAP: SnapSettings = {};
const SEVERITY_RANK: Record<ProblemSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2
};

export function buildWorkbenchModel(snapshot: SceneSnapshot, options: BuildWorkbenchModelOptions = {}): WorkbenchModel {
  const runtimeProblems = mergeProblems(options.runtimeProblems ?? [], deriveImportedRemapProblems(snapshot));
  const inspector = options.inspector ?? buildInspectorModel(snapshot, {
    runtimeProblems,
    runtimeReady: options.runtimeReady
  });
  const history = options.history ?? EMPTY_HISTORY;
  const snap = options.snap ?? EMPTY_SNAP;
  const viewportHelpers = options.viewportHelpers;
  const transformMode = options.transformMode ?? "translate";
  const runtimeReady = options.runtimeReady ?? false;
  const projectProblems = options.projectProblems ?? [];
  const problems = buildWorkbenchProblems(inspector, projectProblems);
  const selection = buildWorkbenchSelection(snapshot, inspector);
  const hierarchy = buildWorkbenchHierarchy(snapshot, inspector, problems.items);
  const assetWorkspace = options.assetWorkspace ?? buildAssetWorkspaceModel(snapshot, {
    payloads: options.assetPayloads,
    problems: problems.items,
    ...(options.projectCompleteness ? { projectCompleteness: options.projectCompleteness } : {})
  });
  const projectCompleteness = options.projectCompleteness ?? assetWorkspace.readiness.completeness;
  const assets = buildWorkbenchAssets(snapshot, assetWorkspace);
  const toolbar = buildWorkbenchToolbar(snapshot, inspector, {
    history,
    snap,
    viewportHelpers,
    transformMode,
    runtimeReady
  });
  const status = buildWorkbenchStatus(selection, problems, {
    history,
    runtimeReady,
    projectCompleteness,
    dirty: options.dirty,
    snapFeedback: viewportHelpers?.snapFeedback
  });
  const project = buildWorkbenchProject(snapshot, projectCompleteness, problems.totalCount);

  return {
    hierarchy,
    assets,
    problems,
    selection,
    toolbar,
    status,
    project
  };
}

function buildWorkbenchProblems(
  inspector: InspectorModel,
  projectProblems: readonly (ProjectProblem | Problem)[]
): WorkbenchProblemsModel {
  const inspectorItems = inspector.problems.problems.map((problem): WorkbenchProblemItem => ({
    ...problem,
    project: false
  }));
  const projectItems = projectProblems.map(toProjectProblemItem);
  const items = [...inspectorItems, ...projectItems];
  const bySeverity: Record<ProblemSeverity, number> = { info: 0, warning: 0, error: 0 };

  for (const item of items) {
    bySeverity[item.severity] += 1;
  }

  return {
    items,
    authoredCount: inspectorItems.filter((problem) => !problem.runtime).length,
    runtimeCount: inspectorItems.filter((problem) => problem.runtime).length,
    projectCount: projectItems.length,
    totalCount: items.length,
    bySeverity
  };
}

function toProjectProblemItem(problem: ProjectProblem | Problem): WorkbenchProblemItem {
  return {
    id: problem.id,
    severity: problem.severity,
    code: problem.code,
    source: problem.source,
    target: problem.target,
    title: problem.display?.title ?? problem.message,
    detail: problem.display?.detail ?? problem.message,
    assetId: problem.assetId,
    objectId: problem.objectId,
    recoverability: problem.recoverability,
    acknowledged: false,
    actionLabel: problem.display?.actionLabel ?? (problem.recoverability === "user-action" ? "Replace asset" : undefined),
    runtime: false,
    project: true
  };
}

function buildWorkbenchSelection(snapshot: SceneSnapshot, inspector: InspectorModel): WorkbenchSelectionModel {
  const selection = inspector.selection;

  return {
    count: selection.count,
    label: formatSelectionLabel(snapshot, selection.nodeId, selection.count),
    nodeId: selection.nodeId,
    nodeIds: [...selection.nodeIds],
    nodeKind: selection.nodeKind,
    objectId: selection.objectId,
    objectIds: [...selection.objectIds],
    lightId: selection.lightId,
    cameraViewId: selection.cameraViewId
  };
}

function buildWorkbenchHierarchy(
  snapshot: SceneSnapshot,
  inspector: InspectorModel,
  problems: readonly WorkbenchProblemItem[]
): WorkbenchHierarchyModel {
  const selectedIds = new Set(inspector.selection.nodeIds);
  const rows: WorkbenchHierarchyRow[] = [];
  const roots: WorkbenchHierarchyRow[] = [];
  const visited = new Set<string>();

  const visit = (nodeId: string, depth: number): WorkbenchHierarchyRow | null => {
    const node = snapshot.nodes[nodeId];
    if (!node || visited.has(nodeId)) {
      return null;
    }
    visited.add(nodeId);
    const rowProblems = problems.filter((problem) => problemMatchesNode(snapshot, node, problem));
    const row = createHierarchyRow(snapshot, node, depth, selectedIds, rowProblems);
    rows.push(row);

    for (const childId of node.children) {
      visit(childId, depth + 1);
    }
    return row;
  };

  for (const nodeId of snapshot.rootNodeIds) {
    const root = visit(nodeId, 0);
    if (root) {
      roots.push(root);
    }
  }
  for (const nodeId of Object.keys(snapshot.nodes)) {
    const orphan = visit(nodeId, 0);
    if (orphan) {
      roots.push(orphan);
    }
  }

  return {
    roots,
    rows,
    totalCount: rows.length,
    selectedIds: [...inspector.selection.nodeIds],
    selectedCount: inspector.selection.count,
    empty: rows.length === 0
  };
}

function createHierarchyRow(
  snapshot: SceneSnapshot,
  node: SceneNode,
  depth: number,
  selectedIds: ReadonlySet<string>,
  problems: readonly WorkbenchProblemItem[]
): WorkbenchHierarchyRow {
  const object = node.kind === "object" ? snapshot.objects[node.objectId] : undefined;
  const ownerObject = node.kind === "imported" ? snapshot.objects[node.ownerObjectId] : undefined;

  return {
    id: node.id,
    label: node.name,
    kind: node.kind,
    depth,
    parentId: node.parentId,
    childIds: [...node.children],
    ...(node.kind === "object" ? { objectId: node.objectId, assetId: object?.asset.id } : {}),
    ...(node.kind === "imported" ? { objectId: node.ownerObjectId, assetId: ownerObject?.asset.id } : {}),
    ...(node.kind === "light" ? { lightId: node.lightId } : {}),
    ...(node.kind === "camera" ? { cameraViewId: node.cameraId } : {}),
    selected: selectedIds.has(node.id),
    problemCount: problems.length,
    problemIds: problems.map((problem) => problem.id),
    highestProblemSeverity: highestSeverity(problems)
  };
}

function buildWorkbenchAssets(snapshot: SceneSnapshot, workspace: AssetWorkspaceModel): WorkbenchAssetModel {
  const items = workspace.items
    .filter((asset) => asset.registered)
    .map((asset) => ({
      id: asset.id,
      label: asset.label,
      kind: asset.kind,
      referenced: asset.referenced,
      missing: asset.problems.some((problem) => isMissingAssetProblem(problem)),
      problemCount: asset.problemCount,
      problemIds: [...asset.problemIds],
      highestProblemSeverity: asset.highestProblemSeverity
    }));
  const missing: WorkbenchMissingAssetItem[] = workspace.items
    .filter((asset) => asset.problems.some((problem) => isMissingAssetProblem(problem)))
    .flatMap((asset): WorkbenchMissingAssetItem[] => {
      const missingProblems = asset.problems.filter((problem) => isMissingAssetProblem(problem));
      return missingProblems.map((problem) => ({
        problemId: problem.id,
        assetId: asset.id,
        objectId: problem.objectId,
        label: snapshot.assets[asset.id]?.label ?? asset.label,
        title: problem.title,
        detail: problem.detail,
        severity: problem.severity,
        actionLabel: problem.actionLabel
      }));
    });

  return {
    workspace,
    items,
    missing,
    totalCount: items.length,
    referencedCount: items.filter((asset) => asset.referenced).length,
    missingCount: missing.length,
    empty: items.length === 0
  };
}

function buildWorkbenchToolbar(
  snapshot: SceneSnapshot,
  inspector: InspectorModel,
  options: {
    history: HistoryState;
    snap: SnapSettings;
    viewportHelpers?: ViewportHelperStateSnapshot;
    transformMode: TransformMode;
    runtimeReady: boolean;
  }
): WorkbenchToolbarModel {
  const selectionCount = inspector.selection.count;
  const selectedNodes = inspector.selection.nodeIds
    .map((nodeId) => snapshot.nodes[nodeId])
    .filter((node): node is SceneNode => Boolean(node));
  const selectionIncludesCamera = inspector.selection.nodeIds.some((nodeId) => nodeSubtreeIncludesKind(snapshot, nodeId, "camera"));

  return {
    canUndo: options.history.undoCount > 0,
    canRedo: options.history.redoCount > 0,
    canCopy: selectionCount > 0 && !selectionIncludesCamera,
    canPaste: true,
    canDuplicate: selectionCount > 0 && !selectionIncludesCamera,
    canDelete: selectionCount > 0,
    canGroup: selectionCount > 1 && !selectionIncludesCamera,
    canUngroup: selectedNodes.some((node) => node.kind === "group"),
    canSelectAll: Object.keys(snapshot.nodes).length > 0,
    canClearSelection: selectionCount > 0,
    canFrameSelected: options.runtimeReady && selectionCount > 0,
    canFrameAll: options.runtimeReady && Object.keys(snapshot.nodes).length > 0,
    canCaptureCameraView: inspector.cameras.canCapture,
    canApplyCameraView: inspector.cameras.canApply,
    transformMode: options.transformMode,
    snapEnabled: {
      translate: isSnapEnabled(options.snap.translate),
      rotate: isSnapEnabled(options.snap.rotate),
      scale: isSnapEnabled(options.snap.scale)
    },
    viewportHelpers: options.viewportHelpers?.visibility ?? {
      grid: false,
      floor: false,
      axes: false,
      selectionBounds: false,
      hover: false,
      snapFeedback: false
    }
  };
}

function buildWorkbenchStatus(
  selection: WorkbenchSelectionModel,
  problems: WorkbenchProblemsModel,
  options: {
    history: HistoryState;
    runtimeReady: boolean;
    projectCompleteness: ProjectCompleteness;
    dirty?: boolean;
    snapFeedback?: ViewportSnapFeedbackState;
  }
): WorkbenchStatusModel {
  const snapFeedback = options.snapFeedback ?? {
    status: "idle",
    nodeId: null,
    mode: null,
    increment: null,
    channelSnapped: false
  } satisfies ViewportSnapFeedbackState;
  return {
    selectionLabel: selection.label,
    selectionCount: selection.count,
    undoCount: options.history.undoCount,
    redoCount: options.history.redoCount,
    runtimeReady: options.runtimeReady,
    dirty: options.dirty ?? options.history.undoCount > 0,
    projectCompleteness: options.projectCompleteness,
    problemCount: problems.totalCount,
    authoredProblemCount: problems.authoredCount,
    runtimeProblemCount: problems.runtimeCount,
    projectProblemCount: problems.projectCount,
    snapFeedback,
    snapFeedbackLabel: formatSnapFeedbackLabel(snapFeedback)
  };
}

function nodeSubtreeIncludesKind(snapshot: SceneSnapshot, nodeId: string, kind: SceneNode["kind"]): boolean {
  const node = snapshot.nodes[nodeId];
  if (!node) {
    return false;
  }
  if (node.kind === kind) {
    return true;
  }
  return node.children.some((childId) => nodeSubtreeIncludesKind(snapshot, childId, kind));
}

function buildWorkbenchProject(
  snapshot: SceneSnapshot,
  completeness: ProjectCompleteness,
  problemCount: number
): WorkbenchProjectModel {
  return {
    sceneId: snapshot.scene.id,
    sceneName: snapshot.scene.name,
    nodeCount: Object.keys(snapshot.nodes).length,
    objectCount: Object.keys(snapshot.objects).length,
    lightCount: Object.keys(snapshot.lights).length,
    cameraViewCount: Object.keys(snapshot.cameras).length,
    defaultCameraViewId: snapshot.presentation.defaultCameraId,
    assetCount: Object.keys(snapshot.assets).length,
    completeness,
    problemCount,
    ready: completeness === "complete" && problemCount === 0,
    statusLabel: problemCount > 0 ? `${problemCount} problems` : completeness === "partial" ? "Partial" : "Ready"
  };
}

function mergeProblems(
  left: readonly Problem[],
  right: readonly Problem[]
): Problem[] {
  const byId = new Map<string, Problem>();
  for (const problem of [...left, ...right]) {
    byId.set(problem.id, problem);
  }
  return [...byId.values()];
}

function formatSelectionLabel(snapshot: SceneSnapshot, nodeId: string | null, count: number): string {
  if (count === 0) {
    return "none";
  }
  const node = nodeId ? snapshot.nodes[nodeId] : undefined;
  if (count === 1 && node) {
    return node.name;
  }
  return `${count} nodes`;
}

function problemMatchesNode(
  snapshot: SceneSnapshot,
  node: SceneNode,
  problem: WorkbenchProblemItem,
  visited = new Set<string>()
): boolean {
  if (visited.has(node.id)) {
    return false;
  }
  visited.add(node.id);

  if (node.children.some((childId) => {
    const child = snapshot.nodes[childId];
    return child ? problemMatchesNode(snapshot, child, problem, visited) : false;
  })) {
    return true;
  }

  if (node.kind === "object") {
    const object = snapshot.objects[node.objectId];
    return problem.objectId === node.objectId ||
      (problem.target.kind === "object" && problem.target.objectId === node.objectId) ||
      (object ? problemMatchesAsset(object.asset.id, problem) : false);
  }
  if (node.kind === "light") {
    return problem.target.kind === "light" && problem.target.lightId === node.lightId;
  }
  if (node.kind === "imported") {
    return problem.target.kind === "imported-target"
      ? problem.target.nodeId === node.id || problem.target.importKey === node.importKey
      : problem.target.kind === "imported-material-slot" &&
        (problem.target.nodeId === node.id || problem.target.importKey === node.importKey);
  }
  return false;
}

function problemMatchesAsset(assetId: string, problem: WorkbenchProblemItem): boolean {
  return problem.assetId === assetId ||
    (problem.target.kind === "asset" && problem.target.assetId === assetId) ||
    (problem.target.kind === "environment" && problem.target.assetId === assetId) ||
    (problem.target.kind === "texture-slot" && problem.target.assetId === assetId);
}

function isMissingAssetProblem(problem: Pick<WorkbenchProblemItem, "recoverability" | "assetId" | "code" | "actionLabel">): boolean {
  return problem.recoverability === "user-action" &&
    Boolean(problem.assetId) &&
    (problem.code.includes("unresolved") || problem.code.includes("missing") || Boolean(problem.actionLabel));
}

function highestSeverity(problems: readonly Pick<WorkbenchProblemItem, "severity">[]): ProblemSeverity | null {
  let current: ProblemSeverity | null = null;
  for (const problem of problems) {
    if (!current || SEVERITY_RANK[problem.severity] > SEVERITY_RANK[current]) {
      current = problem.severity;
    }
  }
  return current;
}

function isSnapEnabled(value: number | null | undefined): boolean {
  return value !== null && value !== undefined;
}

function formatSnapFeedbackLabel(feedback: ViewportSnapFeedbackState): string {
  if (feedback.status === "idle") {
    return "Snap idle";
  }
  if (feedback.status === "invalid") {
    return `Snap ${feedback.mode ?? "mode"} invalid`;
  }
  if (feedback.status === "dragging-snapped") {
    return `Snap ${feedback.mode ?? "mode"} ${feedback.increment ?? ""}`.trim();
  }
  if (feedback.status === "dragging-unsnapped") {
    return `Snap ${feedback.mode ?? "mode"} off`;
  }
  return "Snap disabled";
}
