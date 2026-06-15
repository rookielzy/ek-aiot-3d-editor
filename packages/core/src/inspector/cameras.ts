import type { CreateCameraViewCommand, DeleteCameraViewCommand, SetDefaultCameraViewCommand, UpdateCameraViewCommand } from "../commands/types";
import { createAuthoredCameraViewInput, getAuthoredCameraView, hasAuthoredCameraView } from "../cameras/defaults";
import type { AuthoredCameraView } from "../cameras/types";
import type { SceneSnapshot } from "../snapshot/types";
import { numberField, parseFiniteNumber, textField, type NumberRange } from "./fields";
import type { CameraInspectorSection, CameraViewFieldId, CameraViewListItem, InspectorCommandProblem, InspectorCommandResult } from "./types";

const AXES = ["x", "y", "z"] as const;
const NUMBER_RANGES = {
  fov: { min: Number.MIN_VALUE, max: 179.999 },
  near: { min: Number.MIN_VALUE },
  far: { min: Number.MIN_VALUE }
} satisfies Partial<Record<CameraViewFieldId, NumberRange>>;

type CameraPatchResult = { ok: true; patch: UpdateCameraViewCommand["patch"] } | { ok: false; problem: InspectorCommandProblem };

export function resolveActiveCameraViewId(snapshot: SceneSnapshot, activeCameraViewId?: string | null): string | null {
  if (activeCameraViewId !== null && activeCameraViewId !== undefined && hasAuthoredCameraView(snapshot.cameras, activeCameraViewId)) {
    return activeCameraViewId;
  }
  if (snapshot.presentation.defaultCameraId !== null && hasAuthoredCameraView(snapshot.cameras, snapshot.presentation.defaultCameraId)) {
    return snapshot.presentation.defaultCameraId;
  }
  return Object.keys(snapshot.cameras)[0] ?? null;
}

export function buildCameraSection(
  snapshot: SceneSnapshot,
  options: { activeCameraViewId?: string | null; runtimeReady?: boolean } = {}
): CameraInspectorSection {
  const activeCameraViewId = resolveActiveCameraViewId(snapshot, options.activeCameraViewId);
  const activeCameraView = activeCameraViewId ? getAuthoredCameraView(snapshot.cameras, activeCameraViewId) : null;
  const runtimeReady = options.runtimeReady ?? false;

  return {
    id: "cameras",
    title: "Camera views",
    enabled: true,
    empty: !activeCameraView,
    reason: activeCameraView ? undefined : "Capture a camera view to author presentation state.",
    activeCameraViewId,
    defaultCameraViewId: snapshot.presentation.defaultCameraId,
    cameraViews: buildCameraViewList(snapshot, activeCameraViewId),
    canCapture: runtimeReady,
    canApply: runtimeReady && Boolean(activeCameraView),
    fields: activeCameraView ? buildCameraViewFields(activeCameraView) : []
  };
}

export function buildCreateCameraViewCommand(view?: CreateCameraViewCommand["view"]): InspectorCommandResult {
  return {
    ok: true,
    command: {
      type: "create-camera-view",
      ...(view ? { view } : {})
    }
  };
}

export function buildCreateCameraViewInput(snapshot: SceneSnapshot, view?: CreateCameraViewCommand["view"]): CreateCameraViewCommand["view"] {
  return createAuthoredCameraViewInput(snapshot.cameras, view);
}

export function buildUpdateCameraViewCommand(
  snapshot: SceneSnapshot,
  viewId: string,
  fieldId: CameraViewFieldId,
  value: unknown
): InspectorCommandResult {
  const view = getAuthoredCameraView(snapshot.cameras, viewId);
  if (!view) {
    return problem(fieldId, "Camera view does not exist.");
  }

  const patch = buildCameraViewPatch(view, fieldId, value);
  if (!patch.ok) {
    return patch;
  }

  return {
    ok: true,
    command: {
      type: "update-camera-view",
      viewId,
      patch: patch.patch
    }
  };
}

export function buildDeleteCameraViewCommand(snapshot: SceneSnapshot, viewId: string): InspectorCommandResult {
  if (!hasAuthoredCameraView(snapshot.cameras, viewId)) {
    return problem("viewId", "Camera view does not exist.");
  }
  const command: DeleteCameraViewCommand = {
    type: "delete-camera-view",
    viewId
  };
  return { ok: true, command };
}

export function buildSetDefaultCameraViewCommand(snapshot: SceneSnapshot, viewId: string | null): InspectorCommandResult {
  if (viewId !== null && !hasAuthoredCameraView(snapshot.cameras, viewId)) {
    return problem("defaultCameraId", "Camera view does not exist.");
  }
  const command: SetDefaultCameraViewCommand = {
    type: "set-default-camera-view",
    viewId
  };
  return { ok: true, command };
}

export function getNextActiveCameraViewId(snapshot: SceneSnapshot, removedViewId: string): string | null {
  if (snapshot.presentation.defaultCameraId !== null && snapshot.presentation.defaultCameraId !== removedViewId) {
    return snapshot.presentation.defaultCameraId;
  }
  return Object.keys(snapshot.cameras).find((viewId) => viewId !== removedViewId) ?? null;
}

function buildCameraViewList(snapshot: SceneSnapshot, activeCameraViewId: string | null): CameraViewListItem[] {
  return Object.values(snapshot.cameras).map((view) => ({
    id: view.id,
    label: view.name,
    active: view.id === activeCameraViewId,
    default: view.id === snapshot.presentation.defaultCameraId,
    projection: view.projection.kind,
    summary: `${Math.round(view.projection.fov)}deg FOV`
  }));
}

function buildCameraViewFields(view: AuthoredCameraView) {
  return [
    textField("name", "Name", view.name),
    numberField("fov", "FOV", view.projection.fov, { min: 0, max: 180, step: 0.1 }),
    numberField("near", "Near", view.near, { min: 0, step: 0.01 }),
    numberField("far", "Far", view.far, { min: 0, step: 1 }),
    ...AXES.map((axis, index) => numberField(`position.${axis}`, `Position ${axis.toUpperCase()}`, view.position[index], { step: 0.01 })),
    ...AXES.map((axis, index) => numberField(`target.${axis}`, `Target ${axis.toUpperCase()}`, view.target[index], { step: 0.01 }))
  ];
}

function buildCameraViewPatch(
  view: AuthoredCameraView,
  fieldId: CameraViewFieldId,
  value: unknown
): CameraPatchResult {
  if (fieldId === "name") {
    return { ok: true, patch: { name: String(value) } };
  }
  if (fieldId === "fov") {
    const parsed = parseFiniteNumber(value, fieldId, NUMBER_RANGES.fov);
    return parsed.ok
      ? { ok: true, patch: { projection: { kind: "perspective", fov: parsed.value } } }
      : problem(fieldId, parsed.message);
  }
  if (fieldId === "near" || fieldId === "far") {
    const parsed = parseFiniteNumber(value, fieldId, NUMBER_RANGES[fieldId]);
    if (!parsed.ok) {
      return problem(fieldId, parsed.message);
    }
    if (fieldId === "near" && parsed.value >= view.far) {
      return problem(fieldId, "near must be less than far.");
    }
    if (fieldId === "far" && parsed.value <= view.near) {
      return problem(fieldId, "far must be greater than near.");
    }
    return { ok: true, patch: { [fieldId]: parsed.value } };
  }
  if (fieldId.startsWith("position.") || fieldId.startsWith("target.")) {
    const parsed = parseFiniteNumber(value, fieldId);
    if (!parsed.ok) {
      return problem(fieldId, parsed.message);
    }
    const [vectorName, axisName] = fieldId.split(".") as ["position" | "target", (typeof AXES)[number]];
    const axis = AXES.indexOf(axisName);
    if (axis < 0) {
      return problem(fieldId, "Unsupported camera vector axis.");
    }
    const vector = [...view[vectorName]] as [number, number, number];
    vector[axis] = parsed.value;
    return { ok: true, patch: { [vectorName]: vector } };
  }
  return problem(fieldId, "Unsupported camera view field.");
}

function problem(fieldId: string, message: string): { ok: false; problem: InspectorCommandProblem } {
  return { ok: false, problem: { code: "inspector-camera-invalid", fieldId, message, severity: "warning" } };
}
