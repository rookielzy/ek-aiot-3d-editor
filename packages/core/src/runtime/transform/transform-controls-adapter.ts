import type { Camera, Object3D, Scene } from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { CommandResult } from "../../commands/types";
import type { ViewportSnapFeedbackState } from "../../editor/viewport-helper-state";
import type { SceneSnapshot, Transform } from "../../snapshot/types";
import { readTransform } from "../transform";
import type { ThreeObjectMap } from "../three-object-map";
import type { ViewportCameraControls } from "../viewport-controls";
import { snapTransform, type SnapSettings } from "./snap";
import { TransformController } from "./transform-controller";
import type { TransformMode } from "./transform-mode";

export interface RuntimeTransformControlsOptions {
  enabled?: boolean;
  size?: number;
  space?: "world" | "local";
}

export interface RuntimeTransformControlsFactoryOptions {
  camera: Camera;
  domElement: HTMLElement;
  options: RuntimeTransformControlsOptions;
}

export type RuntimeTransformControlsFactory = (options: RuntimeTransformControlsFactoryOptions) => RuntimeTransformControls;
type TransformControlsEventType = "change" | "mouseDown" | "mouseUp" | "objectChange";
type TransformControlsListener = () => void;

export interface RuntimeTransformControls {
  attach(object: Object3D): unknown;
  detach(): unknown;
  dispose(): void;
  getHelper(): Object3D;
  setMode(mode: TransformMode): void;
  setTranslationSnap(value: number | null): void;
  setRotationSnap(value: number | null): void;
  setScaleSnap(value: number | null): void;
  addEventListener(type: TransformControlsEventType, listener: TransformControlsListener): void;
  removeEventListener(type: TransformControlsEventType, listener: TransformControlsListener): void;
  setSize?(value: number): void;
  setSpace?(value: "world" | "local"): void;
}

export interface TransformControlsAdapterOptions {
  scene: Scene;
  controls: RuntimeTransformControls;
  objects: ThreeObjectMap;
  controller: TransformController;
  cameraControls?: ViewportCameraControls | null;
  mode?: TransformMode;
  snap?: SnapSettings;
  onChange?: () => void;
  onSnapFeedback?: (feedback: ViewportSnapFeedbackState) => void;
}

export class TransformControlsAdapter {
  #scene: Scene;
  #controls: RuntimeTransformControls;
  #objects: ThreeObjectMap;
  #controller: TransformController;
  #cameraControls: ViewportCameraControls | null;
  #onChange: () => void;
  #onSnapFeedback: (feedback: ViewportSnapFeedbackState) => void;
  #mode: TransformMode;
  #snap: SnapSettings;
  #helper: Object3D;
  #attachedNodeId: string | null = null;
  #dragNodeId: string | null = null;
  #cameraEnabledBeforeDrag: boolean | null = null;
  #enabled = true;
  #disposed = false;

  #handleChange = () => {
    this.#onChange();
  };
  #handleMouseDown = () => {
    this.#startDrag();
  };
  #handleObjectChange = () => {
    this.#previewDrag();
  };
  #handleMouseUp = () => {
    this.#commitDrag();
  };

  constructor(options: TransformControlsAdapterOptions) {
    this.#scene = options.scene;
    this.#controls = options.controls;
    this.#objects = options.objects;
    this.#controller = options.controller;
    this.#cameraControls = options.cameraControls ?? null;
    this.#onChange = options.onChange ?? (() => {});
    this.#onSnapFeedback = options.onSnapFeedback ?? (() => {});
    this.#mode = options.mode ?? "translate";
    this.#snap = options.snap ?? {};
    this.#helper = this.#controls.getHelper();
    this.#helper.userData = {
      ...this.#helper.userData,
      runtimeOnly: true,
      transformControlsHelper: true
    };
    this.#scene.add(this.#helper);
    this.#applyMode();
    this.#applySnap();
    this.#controls.addEventListener("change", this.#handleChange);
    this.#controls.addEventListener("mouseDown", this.#handleMouseDown);
    this.#controls.addEventListener("objectChange", this.#handleObjectChange);
    this.#controls.addEventListener("mouseUp", this.#handleMouseUp);
  }

  sync(snapshot: SceneSnapshot): void {
    if (this.#disposed) {
      return;
    }
    if (!this.#enabled) {
      this.#detach();
      return;
    }

    const nodeId = snapshot.selection.nodeId;
    const target = nodeId ? this.#objects.getTarget(nodeId) : undefined;
    const object = target?.transformable ? target.object : undefined;

    if (this.#dragNodeId && this.#dragNodeId !== nodeId) {
      this.cancel();
    }

    if (!nodeId || !object) {
      this.#detach();
      return;
    }

    if (this.#attachedNodeId !== nodeId) {
      this.#controls.attach(object);
      this.#attachedNodeId = nodeId;
      this.#onChange();
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.#disposed || this.#enabled === enabled) {
      return;
    }
    this.#enabled = enabled;
    if (!enabled) {
      this.#detach();
    }
  }

  setMode(mode: TransformMode): void {
    if (this.#disposed || this.#mode === mode) {
      return;
    }

    if (this.#dragNodeId) {
      this.cancel();
    }

    this.#mode = mode;
    this.#applyMode();
    this.#publishIdleFeedback();
    this.#onChange();
  }

  setSnap(settings: SnapSettings): void {
    if (this.#disposed) {
      return;
    }

    this.#snap = { ...settings };
    this.#applySnap();
    if (this.#dragNodeId) {
      this.cancel();
      return;
    }
    this.#onChange();
  }

  cancel(): void {
    if (!this.#dragNodeId) {
      return;
    }

    this.#controller.cancel();
    this.#dragNodeId = null;
    this.#restoreCameraControls();
    this.#publishIdleFeedback();
    this.#onChange();
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.cancel();
    this.#disposed = true;
    this.#controls.removeEventListener("change", this.#handleChange);
    this.#controls.removeEventListener("mouseDown", this.#handleMouseDown);
    this.#controls.removeEventListener("objectChange", this.#handleObjectChange);
    this.#controls.removeEventListener("mouseUp", this.#handleMouseUp);
    this.#detach();
    this.#helper.removeFromParent();
    this.#controls.dispose();
    this.#publishIdleFeedback();
  }

  get attachedObjectId(): string | null {
    return this.#attachedNodeId;
  }

  get attachedNodeId(): string | null {
    return this.#attachedNodeId;
  }

  get dragging(): boolean {
    return this.#dragNodeId !== null;
  }

  #startDrag(): void {
    if (this.#disposed || !this.#attachedNodeId) {
      return;
    }

    try {
      this.#controller.start(this.#attachedNodeId, this.#mode, { snap: this.#snap });
    } catch {
      this.#detach();
      return;
    }

    this.#dragNodeId = this.#attachedNodeId;
    this.#disableCameraControls();
    this.#publishPreviewFeedback();
    this.#onChange();
  }

  #previewDrag(): void {
    if (this.#disposed || !this.#dragNodeId) {
      return;
    }

    const object = this.#objects.get(this.#dragNodeId);
    if (!object) {
      this.cancel();
      this.#detach();
      return;
    }

    const preview = readTransform(object);
    this.#controller.preview(patchForMode(this.#mode, preview));
    this.#publishPreviewFeedback(preview);
    this.#onChange();
  }

  #commitDrag(): CommandResult | null {
    if (this.#disposed || !this.#dragNodeId) {
      return null;
    }

    const nodeId = this.#dragNodeId;
    this.#dragNodeId = null;
    this.#restoreCameraControls();

    if (!this.#objects.get(nodeId)) {
      this.#controller.cancel();
      this.#detach();
      this.#publishIdleFeedback();
      this.#onChange();
      return null;
    }

    const result = this.#controller.commit();
    this.#publishIdleFeedback();
    this.#onChange();
    return result;
  }

  #detach(): void {
    this.cancel();
    if (!this.#attachedNodeId) {
      return;
    }
    this.#controls.detach();
    this.#attachedNodeId = null;
    this.#onChange();
  }

  #applyMode(): void {
    this.#controls.setMode(this.#mode);
  }

  #applySnap(): void {
    this.#controls.setTranslationSnap(normalizeSnapIncrement(this.#snap.translate));
    this.#controls.setRotationSnap(normalizeSnapIncrement(this.#snap.rotate));
    this.#controls.setScaleSnap(normalizeSnapIncrement(this.#snap.scale));
  }

  #publishPreviewFeedback(previewTransform?: Transform): void {
    if (!this.#dragNodeId) {
      this.#publishIdleFeedback();
      return;
    }
    const transaction = this.#controller.activeTransaction;
    const object = this.#objects.get(this.#dragNodeId);
    if (!transaction || !object) {
      this.#publishIdleFeedback();
      return;
    }
    const current = previewTransform ?? readTransform(object);
    const before = vectorForMode(this.#mode, transaction.before);
    const preview = vectorForMode(this.#mode, current);
    const increment = this.#snap[this.#mode];
    const normalizedIncrement = normalizeSnapIncrement(increment);
    if (increment !== undefined && increment !== null && normalizedIncrement === null) {
      this.#onSnapFeedback({
        status: "invalid",
        nodeId: this.#dragNodeId,
        mode: this.#mode,
        increment: null,
        channelSnapped: false,
        before,
        preview,
        snapped: preview
      });
      return;
    }
    if (normalizedIncrement === null) {
      this.#onSnapFeedback({
        status: "dragging-unsnapped",
        nodeId: this.#dragNodeId,
        mode: this.#mode,
        increment: null,
        channelSnapped: false,
        before,
        preview,
        snapped: preview
      });
      return;
    }
    const snapped = vectorForMode(this.#mode, snapTransform(current, this.#snap));
    this.#onSnapFeedback({
      status: "dragging-snapped",
      nodeId: this.#dragNodeId,
      mode: this.#mode,
      increment: normalizedIncrement,
      channelSnapped: !sameVector(preview, snapped),
      before,
      preview,
      snapped
    });
  }

  #publishIdleFeedback(): void {
    this.#onSnapFeedback({
      status: "idle",
      nodeId: null,
      mode: null,
      increment: null,
      channelSnapped: false
    });
  }

  #disableCameraControls(): void {
    if (!this.#cameraControls || this.#cameraEnabledBeforeDrag !== null) {
      return;
    }

    this.#cameraEnabledBeforeDrag = this.#cameraControls.enabled;
    this.#cameraControls.enabled = false;
  }

  #restoreCameraControls(): void {
    if (!this.#cameraControls || this.#cameraEnabledBeforeDrag === null) {
      return;
    }

    this.#cameraControls.enabled = this.#cameraEnabledBeforeDrag;
    this.#cameraEnabledBeforeDrag = null;
  }
}

export function createThreeTransformControls({
  camera,
  domElement,
  options
}: RuntimeTransformControlsFactoryOptions): RuntimeTransformControls {
  const controls = new TransformControls(camera, domElement);
  if (options.size !== undefined) {
    controls.setSize(options.size);
  }
  if (options.space !== undefined) {
    controls.setSpace(options.space);
  }
  return controls;
}

function patchForMode(mode: TransformMode, transform: Transform): Partial<Transform> {
  switch (mode) {
    case "translate":
      return { position: transform.position };
    case "rotate":
      return { rotation: transform.rotation };
    case "scale":
      return { scale: transform.scale };
  }
}

function vectorForMode(mode: TransformMode, transform: Transform): [number, number, number] {
  switch (mode) {
    case "translate":
      return transform.position;
    case "rotate":
      return transform.rotation;
    case "scale":
      return transform.scale;
  }
}

function normalizeSnapIncrement(value: number | null | undefined): number | null {
  return value !== undefined && value !== null && Number.isFinite(value) && value > 0 ? value : null;
}

function sameVector(left: [number, number, number], right: [number, number, number]): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}
