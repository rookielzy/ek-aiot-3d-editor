import { Box3, PerspectiveCamera, Sphere, Vector3, type Object3D } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SelectionMode } from "../selection/selection";
import type { RuntimeTransformControlsOptions } from "./transform/transform-controls-adapter";

export interface RuntimeCameraControlsOptions {
  enabled?: boolean;
  enablePan?: boolean;
  enableRotate?: boolean;
  enableZoom?: boolean;
  enableDamping?: boolean;
  dampingFactor?: number;
  minDistance?: number;
  maxDistance?: number;
}

export interface RuntimePointerSelectionOptions {
  enabled?: boolean;
  button?: number;
  clickTolerance?: number;
  defaultMode?: SelectionMode;
}

export interface RuntimePointerSelectionModifiers {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export interface RuntimePointerSelectionInput {
  clientX: number;
  clientY: number;
  mode?: SelectionMode;
  modifiers?: RuntimePointerSelectionModifiers;
}

export interface RuntimeCameraFrameOptions {
  padding?: number;
  minDistance?: number;
}

export interface RuntimeSelectionVisualOptions {
  enabled?: boolean;
  selectedColor?: number | string;
  primarySelectedColor?: number | string;
}

export interface ResolvedRuntimeSelectionVisualOptions extends Required<RuntimeSelectionVisualOptions> {
  enabled: true;
}

export interface RuntimeInteractionOptions {
  camera?: boolean | RuntimeCameraControlsOptions;
  pointerSelection?: boolean | RuntimePointerSelectionOptions;
  resize?: boolean;
  selectionVisuals?: boolean | RuntimeSelectionVisualOptions;
  transform?: boolean | RuntimeTransformControlsOptions;
}

export interface ResolvedRuntimeInteractionOptions {
  camera: false | RuntimeCameraControlsOptions;
  pointerSelection: false | Required<RuntimePointerSelectionOptions>;
  resize: boolean;
  selectionVisuals: false | ResolvedRuntimeSelectionVisualOptions;
  transform: false | RuntimeTransformControlsOptions;
}

export interface ViewportCameraControls {
  enabled: boolean;
  target: Vector3;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
  update(deltaTime?: number | null): boolean;
  reset(): void;
  saveState(): void;
  dispose(): void;
}

export interface ViewportCameraControlsFactoryOptions {
  camera: PerspectiveCamera;
  domElement: HTMLElement;
  options: RuntimeCameraControlsOptions;
}

export type ViewportCameraControlsFactory = (options: ViewportCameraControlsFactoryOptions) => ViewportCameraControls;

const DEFAULT_CAMERA_POSITION = new Vector3(0, 2, 5);
const DEFAULT_CAMERA_TARGET = new Vector3(0, 0, 0);

export function normalizeRuntimeInteractionOptions(
  options: boolean | RuntimeInteractionOptions | undefined
): ResolvedRuntimeInteractionOptions {
  if (!options) {
    return {
      camera: false,
      pointerSelection: false,
      resize: false,
      selectionVisuals: false,
      transform: false
    };
  }

  if (options === true) {
    return {
      camera: {},
      pointerSelection: normalizePointerSelectionOptions(true),
      resize: true,
      selectionVisuals: normalizeSelectionVisualOptions(true),
      transform: normalizeTransformControlsOptions(true)
    };
  }

  return {
    camera: options.camera === undefined ? false : normalizeCameraOptions(options.camera),
    pointerSelection: options.pointerSelection === undefined ? false : normalizePointerSelectionOptions(options.pointerSelection),
    resize: options.resize ?? true,
    selectionVisuals: options.selectionVisuals === undefined ? false : normalizeSelectionVisualOptions(options.selectionVisuals),
    transform: options.transform === undefined ? false : normalizeTransformControlsOptions(options.transform)
  };
}

export function createOrbitViewportCameraControls({
  camera,
  domElement,
  options
}: ViewportCameraControlsFactoryOptions): ViewportCameraControls {
  const controls = new OrbitControls(camera, domElement);
  controls.enabled = options.enabled ?? true;
  controls.enablePan = options.enablePan ?? true;
  controls.enableRotate = options.enableRotate ?? true;
  controls.enableZoom = options.enableZoom ?? true;
  controls.enableDamping = options.enableDamping ?? false;
  controls.dampingFactor = options.dampingFactor ?? controls.dampingFactor;
  controls.minDistance = options.minDistance ?? controls.minDistance;
  controls.maxDistance = options.maxDistance ?? controls.maxDistance;
  controls.target.copy(DEFAULT_CAMERA_TARGET);
  controls.update();
  controls.saveState();
  return controls;
}

export function resolvePointerSelectionMode(
  modifiers: RuntimePointerSelectionModifiers | undefined,
  defaultMode: SelectionMode = "replace"
): SelectionMode {
  if (modifiers?.altKey) {
    return "remove";
  }
  if (modifiers?.ctrlKey || modifiers?.metaKey) {
    return "toggle";
  }
  if (modifiers?.shiftKey) {
    return "add";
  }
  return defaultMode;
}

export function resetCameraView(camera: PerspectiveCamera, controls?: ViewportCameraControls): void {
  camera.position.copy(DEFAULT_CAMERA_POSITION);
  camera.lookAt(DEFAULT_CAMERA_TARGET);
  camera.updateProjectionMatrix();
  controls?.target.copy(DEFAULT_CAMERA_TARGET);
  controls?.update();
  controls?.saveState();
}

export function frameCameraToObjects(
  camera: PerspectiveCamera,
  objects: Iterable<Object3D>,
  controls?: ViewportCameraControls,
  options: RuntimeCameraFrameOptions = {}
): boolean {
  const bounds = new Box3();
  let hasObject = false;

  for (const object of objects) {
    object.updateWorldMatrix(true, true);
    const objectBounds = new Box3().setFromObject(object);
    if (!objectBounds.isEmpty()) {
      bounds.union(objectBounds);
      hasObject = true;
      continue;
    }

    const worldPosition = new Vector3();
    object.getWorldPosition(worldPosition);
    bounds.expandByPoint(worldPosition);
    hasObject = true;
  }

  if (!hasObject) {
    return false;
  }

  const sphere = bounds.getBoundingSphere(new Sphere());
  const radius = Math.max(sphere.radius, 0.5);
  const padding = options.padding ?? 1.4;
  const minDistance = options.minDistance ?? 2;
  const fov = camera.fov * Math.PI / 180;
  const distance = Math.max(minDistance, radius / Math.sin(fov / 2)) * padding;
  const target = sphere.center;
  const currentTarget = controls?.target ?? DEFAULT_CAMERA_TARGET;
  const direction = camera.position.clone().sub(currentTarget);
  if (direction.lengthSq() === 0) {
    direction.copy(DEFAULT_CAMERA_POSITION).sub(DEFAULT_CAMERA_TARGET);
  }
  direction.normalize();

  camera.position.copy(target).add(direction.multiplyScalar(distance));
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  controls?.target.copy(target);
  controls?.update();
  return true;
}

function normalizeCameraOptions(options: boolean | RuntimeCameraControlsOptions | undefined): false | RuntimeCameraControlsOptions {
  if (options === false) {
    return false;
  }
  if (options === true || options === undefined) {
    return {};
  }
  if (options.enabled === false) {
    return false;
  }
  return options;
}

function normalizePointerSelectionOptions(
  options: boolean | RuntimePointerSelectionOptions | undefined
): false | Required<RuntimePointerSelectionOptions> {
  if (options === false) {
    return false;
  }
  const normalized = options === true || options === undefined ? {} : options;
  if (normalized.enabled === false) {
    return false;
  }
  return {
    enabled: true,
    button: normalized.button ?? 0,
    clickTolerance: normalized.clickTolerance ?? 4,
    defaultMode: normalized.defaultMode ?? "replace"
  };
}

function normalizeSelectionVisualOptions(
  options: boolean | RuntimeSelectionVisualOptions | undefined
): false | ResolvedRuntimeSelectionVisualOptions {
  if (options === false) {
    return false;
  }
  const normalized = options === true || options === undefined ? {} : options;
  if (normalized.enabled === false) {
    return false;
  }
  return {
    enabled: true,
    selectedColor: normalized.selectedColor ?? 0x4f8cff,
    primarySelectedColor: normalized.primarySelectedColor ?? 0xffc247
  };
}

function normalizeTransformControlsOptions(
  options: boolean | RuntimeTransformControlsOptions | undefined
): false | RuntimeTransformControlsOptions {
  if (options === false) {
    return false;
  }
  const normalized = options === true || options === undefined ? {} : options;
  if (normalized.enabled === false) {
    return false;
  }
  return normalized;
}
