import { PerspectiveCamera, Scene, Vector3, WebGLRenderer, type Object3D, type Quaternion, type WebGLRenderer as ThreeWebGLRenderer } from "three";
import { AssetResolverBridge } from "../assets/resolver";
import type { Problem } from "../assets/problems";
import type { CommandDispatcher } from "../commands/dispatcher";
import type { CommandResult } from "../commands/types";
import type { SelectionMode } from "../selection/selection";
import type { EditorStore } from "../editor/store";
import type { SceneSnapshot } from "../snapshot/types";
import { isDataDisplayAnchor } from "../snapshot/nodes";
import { supportsNodeMotion } from "../snapshot/node-motion";
import type { AuthoredCameraView, AuthoredCameraViewInput } from "../cameras/types";
import type { GltfLoaderAdapter } from "./gltf-loader-adapter";
import type { RuntimePmremAdapter } from "./pmrem-adapter";
import { ThreePmremAdapter } from "./pmrem-adapter";
import { SceneProjector } from "./scene-projector";
import { ObjectPicker } from "./picking";
import type { RuntimeTextureLoaderAdapter } from "./texture-loader-adapter";
import type { Unsubscribe } from "../editor/subscription";
import { normalizeMarqueeSelectionRect, type EditorMarqueeSelectionState, type MarqueeSelectionPoint, type MarqueeSelectionRect } from "../editor/marquee-selection-state";
import type { EditorSnapState } from "../editor/snap-state";
import { IDLE_VIEWPORT_SNAP_FEEDBACK, type EditorViewportHelperState, type ViewportHelperStateSnapshot } from "../editor/viewport-helper-state";
import {
  DataColorProjector,
  type DataColorAssignment,
  type DataColorObjectCapability
} from "./data-color-projector";
import { RuntimeSelectionVisuals } from "./selection-visuals";
import { RuntimeMarqueeSelection } from "./marquee-selection";
import type { RuntimeNodeTarget } from "./three-object-map";
import { RuntimeViewportHelpers } from "./viewport-helpers";
import { RuntimeLightHelpers } from "./light-helpers";
import { TransformControlsAdapter, createThreeTransformControls, type RuntimeTransformControlsFactory } from "./transform/transform-controls-adapter";
import { TransformController } from "./transform/transform-controller";
import type { EditorTransformModeState } from "./transform/transform-mode";
import { applyAuthoredCameraViewToRuntime, captureAuthoredCameraView, type RuntimeCameraViewCaptureResult } from "./authored-camera-view";
import {
  createOrbitViewportCameraControls,
  frameCameraToObjects,
  normalizeRuntimeInteractionOptions,
  resetCameraView,
  resolvePointerSelectionMode,
  type RuntimeCameraFrameOptions,
  type RuntimeInteractionOptions,
  type RuntimePointerSelectionInput,
  type ViewportCameraControls,
  type ViewportCameraControlsFactory
} from "./viewport-controls";

export interface RendererLike {
  domElement: HTMLElement;
  shadowMap?: {
    enabled: boolean;
    autoUpdate?: boolean;
    needsUpdate?: boolean;
    type?: number;
  };
  setSize(width: number, height: number): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
}

export type RendererFactory = (container: HTMLElement) => RendererLike;
export type PmremFactory = (renderer: RendererLike) => RuntimePmremAdapter;
export type RuntimeAnimationFrameScheduler = (callback: FrameRequestCallback) => number;
export type RuntimeAnimationFrameCancel = (handle: number) => void;

export interface EditorRuntimeOptions {
  container: HTMLElement;
  store: EditorStore;
  dispatcher: CommandDispatcher;
  resolver?: AssetResolverBridge;
  loader?: GltfLoaderAdapter;
  rendererFactory?: RendererFactory;
  interactions?: boolean | RuntimeInteractionOptions;
  scheduleFrame?: RuntimeAnimationFrameScheduler;
  cancelFrame?: RuntimeAnimationFrameCancel;
}

interface ThreeEditorRuntimeOptions extends EditorRuntimeOptions {
  textureLoader?: RuntimeTextureLoaderAdapter;
  hdrLoader?: RuntimeTextureLoaderAdapter;
  pmremFactory?: PmremFactory;
  cameraControlsFactory?: ViewportCameraControlsFactory;
  transformControlsFactory?: RuntimeTransformControlsFactory;
  snap?: EditorSnapState;
  marqueeSelection?: EditorMarqueeSelectionState;
  viewportHelpers?: EditorViewportHelperState;
  transformMode?: EditorTransformModeState;
  resizeObserverFactory?: ResizeObserverFactory;
}

export interface EditorRuntime {
  project(snapshot?: SceneSnapshot): Promise<void>;
  pickNode(nodeId: string | null, mode?: SelectionMode): CommandResult;
  pickObject(objectId: string | null, mode?: SelectionMode): CommandResult;
  selectFromPointer(input: RuntimePointerSelectionInput): CommandResult;
  getNodeTarget(nodeId: string): Object3D | undefined;
  getObject(objectId: string): Object3D | undefined;
  getProblems(): Problem[];
  subscribeProblems(subscriber: RuntimeProblemSubscriber): Unsubscribe;
  invalidateRender(): void;
  resize(): void;
  resetCamera(): void;
  frameSelected(options?: RuntimeCameraFrameOptions): boolean;
  frameAll(options?: RuntimeCameraFrameOptions): boolean;
  captureCameraView(input?: Pick<AuthoredCameraViewInput, "id" | "name" | "metadata">): RuntimeCameraViewCaptureResult;
  applyCameraView(view: AuthoredCameraView): void;
  setDataColors?(assignments: readonly DataColorAssignment[]): readonly DataColorObjectCapability[];
  setDataDisplayValues?(values: ReadonlyMap<string, string>, problems?: readonly Problem[]): void;
  startDataDisplayAnchorPick?(onComplete: (nodeId: string | null) => void): (() => void) | null;
  subscribeProjection?(subscriber: RuntimeProjectionSubscriber): Unsubscribe;
  getNodeMotionPreviewState?(nodeId: string): NodeMotionPreviewState;
  subscribeNodeMotionPreview?(subscriber: RuntimeProjectionSubscriber): Unsubscribe;
  startNodeMotionPreview?(nodeId: string): boolean;
  stopNodeMotionPreview?(): void;
  setTransformEnabled?(enabled: boolean, allowDataDisplays?: boolean): void;
  dispose(): void;
  readonly disposed: boolean;
}

export type RuntimeProjectionSubscriber = () => void;
export type NodeMotionPreviewState = "unavailable" | "loading" | "asset-unavailable" |
  "target-unresolved" | "target-not-transformable" | "ready" | "playing";

const SPIN_AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };

export interface RuntimeProblemSnapshot {
  version: number;
  problems: Problem[];
}

export type RuntimeProblemSubscriber = (snapshot: RuntimeProblemSnapshot) => void;
export type ResizeObserverFactory = (callback: ResizeObserverCallback) => Pick<ResizeObserver, "observe" | "disconnect">;

interface RuntimeViewportMetrics {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class ThreeEditorRuntime implements EditorRuntime {
  #dataDisplayProblems: readonly Problem[] = [];
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 1000);
  readonly projector: SceneProjector;
  readonly picker: ObjectPicker;
  #dataColors: DataColorProjector;
  #projectionSubscribers = new Set<RuntimeProjectionSubscriber>();
  #container: HTMLElement;
  #store: EditorStore;
  #renderer: RendererLike;
  #interactions = normalizeRuntimeInteractionOptions(false);
  #controls: ViewportCameraControls | null = null;
  #transformControls: TransformControlsAdapter | null = null;
  #transformEnabled = true;
  #allowDataDisplays = false;
  #anchorPick: ((nodeId: string | null) => void) | null = null;
  #cancelAnchorPickOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    this.#finishAnchorPick(null);
  };
  #transformController: TransformController;
  #selectionVisuals: RuntimeSelectionVisuals | null = null;
  #marqueeSelectionState: EditorMarqueeSelectionState | null = null;
  #viewportHelpers: RuntimeViewportHelpers | null = null;
  #lightHelpers: RuntimeLightHelpers | null = null;
  #viewportHelperState: EditorViewportHelperState | null = null;
  #currentHelperSnapshot: ViewportHelperStateSnapshot | null = null;
  #resizeObserver: Pick<ResizeObserver, "observe" | "disconnect"> | null = null;
  #scheduleFrame: RuntimeAnimationFrameScheduler;
  #cancelFrame: RuntimeAnimationFrameCancel;
  #pendingFrame: number | null = null;
  #motionPreview: {
    nodeId: string;
    object: Object3D;
    base: Quaternion;
    axis: Vector3;
    degreesPerSecond: number;
    firstFrame: number | null;
  } | null = null;
  #motionPreviewSubscribers = new Set<RuntimeProjectionSubscriber>();
  #projectedSnapshot: SceneSnapshot | null = null;
  #unsubscribe: (() => void) | null = null;
  #unsubscribeSnap: (() => void) | null = null;
  #unsubscribeViewportHelpers: (() => void) | null = null;
  #unsubscribeTransformMode: (() => void) | null = null;
  #problemSubscribers = new Set<RuntimeProblemSubscriber>();
  #problemVersion = 0;
  #disposed = false;
  #projectGeneration = 0;
  #pointerStart: { clientX: number; clientY: number; button: number } | null = null;
  #marqueeStart: {
    clientX: number;
    clientY: number;
    point: MarqueeSelectionPoint;
    viewport: RuntimeViewportMetrics;
    button: number;
    pointerId: number;
    mode: SelectionMode;
    cameraControlsEnabled: boolean | null;
  } | null = null;
  #marqueeDragging = false;
  #handleControlsChange = () => {
    this.invalidateRender();
  };
  #handlePointerDown = (event: PointerEvent) => {
    if (!this.#anchorPick && this.#interactions.marqueeSelection && event.button === this.#interactions.marqueeSelection.button && !this.#transformControls?.dragging) {
      const viewport = this.#viewportMetrics();
      const point = this.#clientPointToContainerPoint(event.clientX, event.clientY, viewport);
      this.#marqueeStart = {
        clientX: event.clientX,
        clientY: event.clientY,
        point,
        viewport,
        button: event.button,
        pointerId: event.pointerId,
        mode: resolvePointerSelectionMode(event, this.#interactions.marqueeSelection.defaultMode),
        cameraControlsEnabled: this.#controls?.enabled ?? null
      };
      if (this.#controls) {
        this.#controls.enabled = false;
      }
      this.#capturePointer(event.pointerId);
      this.#marqueeSelectionState?.start(point, this.#marqueeStart.mode);
    }

    if (!this.#interactions.pointerSelection || event.button !== this.#interactions.pointerSelection.button) {
      return;
    }
    this.#pointerStart = {
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button
    };
  };
  #handlePointerUp = (event: PointerEvent) => {
    if (this.#marqueeStart && event.button === this.#marqueeStart.button) {
      const handled = this.#completeMarquee(event);
      if (handled) {
        return;
      }
    }

    const options = this.#interactions.pointerSelection;
    const pointerStart = this.#pointerStart;
    this.#pointerStart = null;
    if (!options || !pointerStart || event.button !== pointerStart.button) {
      return;
    }
    const distance = Math.hypot(event.clientX - pointerStart.clientX, event.clientY - pointerStart.clientY);
    if (distance > options.clickTolerance) {
      return;
    }
    this.selectFromPointer({
      clientX: event.clientX,
      clientY: event.clientY,
      modifiers: event,
      mode: resolvePointerSelectionMode(event, options.defaultMode)
    });
  };
  #handlePointerMove = (event: PointerEvent) => {
    if (this.#marqueeStart) {
      this.#updateMarquee(event);
      if (this.#marqueeDragging) {
        return;
      }
    }

    if (!this.#viewportHelperState || !this.#currentHelperSnapshot?.visibility.hover) {
      return;
    }
    const nodeId = this.#hitNodeFromPointer(event.clientX, event.clientY);
    this.#viewportHelperState.setHover(nodeId);
  };
  #handlePointerCancel = () => {
    this.#cancelMarquee();
    this.#pointerStart = null;
  };
  #handlePointerLeave = () => {
    if (this.#marqueeDragging) {
      return;
    }
    this.#viewportHelperState?.setHover(null);
  };
  #handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      this.#cancelMarquee();
      this.#pointerStart = null;
    }
  };

  constructor(options: ThreeEditorRuntimeOptions) {
    this.#container = options.container;
    this.#store = options.store;
    this.#renderer = (options.rendererFactory ?? createDefaultRenderer)(options.container);
    this.#scheduleFrame = options.scheduleFrame ?? defaultScheduleFrame;
    this.#cancelFrame = options.cancelFrame ?? defaultCancelFrame;
    this.#interactions = normalizeRuntimeInteractionOptions(options.interactions);
    this.projector = new SceneProjector({
      scene: this.scene,
      resolver: options.resolver,
      loader: options.loader,
      textureLoader: options.textureLoader,
      hdrLoader: options.hdrLoader,
      pmrem: options.pmremFactory?.(this.#renderer) ?? createPmremAdapter(this.#renderer)
    });
    this.picker = new ObjectPicker(this.camera, this.projector.objects, options.dispatcher);
    this.#dataColors = new DataColorProjector({ objects: this.projector.objects });
    this.#transformController = new TransformController(this.projector.objects, options.dispatcher);
    this.camera.position.set(0, 2, 5);
    this.camera.lookAt(0, 0, 0);

    this.#container.appendChild(this.#renderer.domElement);
    this.#resizeToContainer(false);
    this.#mountInteractions(options);
    this.#unsubscribe = this.#store.subscribe((snapshot) => {
      void this.project(snapshot);
    });
    void this.project(this.#store.getSnapshot());
  }

  async project(snapshot: SceneSnapshot = this.#store.getSnapshot()): Promise<void> {
    this.#assertActive();
    const generation = this.#beginProject();
    this.#projectedSnapshot = null;
    if (this.#motionPreview) this.stopNodeMotionPreview();
    else this.#notifyMotionPreview();
    this.#cancelMarquee();
    this.#pointerStart = null;
    // Authored materials must be clean before the material projector reads them;
    // current status colors are re-applied once the new projection settles.
    this.#dataColors.restoreAll();
    this.projector.setRendererShadowMapAvailable(Boolean(this.#renderer.shadowMap));
    await this.projector.project(snapshot);
    if (this.#disposed || generation !== this.#projectGeneration) {
      return;
    }
    this.#dataColors.reapply();
    this.#syncRendererShadowMap();
    this.#clearStaleViewportHelperTargets();
    this.#syncSelectionVisuals();
    this.#viewportHelpers?.sync();
    this.#lightHelpers?.sync();
    this.#transformControls?.sync(snapshot);
    this.invalidateRender();
    this.#publishProblems();
    this.#projectedSnapshot = snapshot;
    this.#notifyMotionPreview();
    this.#notifyProjection();
  }

  setDataColors(assignments: readonly DataColorAssignment[]): readonly DataColorObjectCapability[] {
    this.#assertActive();
    const capabilities = this.#dataColors.set(assignments);
    this.invalidateRender();
    return capabilities;
  }

  subscribeProjection(subscriber: RuntimeProjectionSubscriber): Unsubscribe {
    this.#assertActive();
    this.#projectionSubscribers.add(subscriber);
    return () => {
      this.#projectionSubscribers.delete(subscriber);
    };
  }

  getNodeMotionPreviewState(nodeId: string): NodeMotionPreviewState {
    if (this.#disposed) return "unavailable";
    if (this.#motionPreview?.nodeId === nodeId) return "playing";
    if (!this.#projectedSnapshot) return "loading";
    const node = this.#projectedSnapshot.nodes[nodeId];
    if (!supportsNodeMotion(node)) return "unavailable";
    const target = this.projector.objects.getTarget(nodeId);
    const owner = node.kind === "object" ? target?.object : this.projector.objects.getObject(node.ownerObjectId);
    if (!owner || owner.userData.problem || owner.userData.runtimePlaceholder) return "asset-unavailable";
    if (!target || (node.kind === "imported" && node.remap?.status === "unresolved")) return "target-unresolved";
    return target.transformable ? "ready" : "target-not-transformable";
  }

  subscribeNodeMotionPreview(subscriber: RuntimeProjectionSubscriber): Unsubscribe {
    this.#motionPreviewSubscribers.add(subscriber);
    return () => { this.#motionPreviewSubscribers.delete(subscriber); };
  }

  startNodeMotionPreview(nodeId: string): boolean {
    const snapshot = this.#store.getSnapshot();
    if (snapshot.selection.nodeId !== nodeId || snapshot.selection.nodeIds.length !== 1 ||
      this.#transformControls?.dragging || this.getNodeMotionPreviewState(nodeId) !== "ready") return false;
    const node = snapshot.nodes[nodeId];
    const object = this.getNodeTarget(nodeId);
    if (!supportsNodeMotion(node) || !node.motion || !object) return false;
    this.#motionPreview = {
      nodeId, object, base: object.quaternion.clone(), axis: SPIN_AXES[node.motion.axis],
      degreesPerSecond: node.motion.degreesPerSecond, firstFrame: null
    };
    this.setTransformEnabled(this.#transformEnabled, this.#allowDataDisplays);
    this.invalidateRender();
    this.#notifyMotionPreview();
    return true;
  }

  stopNodeMotionPreview(): void {
    const preview = this.#motionPreview;
    if (!preview) return;
    this.#motionPreview = null;
    preview.object.quaternion.copy(preview.base);
    preview.object.updateMatrix();
    this.#syncSelectionVisuals();
    this.#syncRendererShadowMap();
    this.setTransformEnabled(this.#transformEnabled, this.#allowDataDisplays);
    this.invalidateRender();
    this.#notifyMotionPreview();
  }

  #notifyMotionPreview(): void {
    for (const subscriber of this.#motionPreviewSubscribers) subscriber();
  }

  setTransformEnabled(enabled: boolean, allowDataDisplays = false): void {
    if (this.#disposed) {
      return;
    }
    this.#transformEnabled = enabled;
    this.#allowDataDisplays = allowDataDisplays;
    this.#transformControls?.setEnabled(!this.#anchorPick && !this.#motionPreview && enabled, !this.#anchorPick && allowDataDisplays);
    this.#transformControls?.sync(this.#store.getSnapshot());
  }

  startDataDisplayAnchorPick(onComplete: (nodeId: string | null) => void): (() => void) | null {
    if (this.#disposed || !this.#interactions.pointerSelection) return null;
    this.#finishAnchorPick(null);
    this.#cancelMarquee();
    this.#anchorPick = onComplete;
    this.#container.ownerDocument.addEventListener("keydown", this.#cancelAnchorPickOnEscape, true);
    this.setTransformEnabled(this.#transformEnabled, this.#allowDataDisplays);
    return () => {
      if (this.#anchorPick === onComplete) this.#finishAnchorPick(null, false);
    };
  }

  #finishAnchorPick(nodeId: string | null, notify = true): void {
    const onComplete = this.#anchorPick;
    if (!onComplete) return;
    this.#anchorPick = null;
    this.#container.ownerDocument.removeEventListener("keydown", this.#cancelAnchorPickOnEscape, true);
    this.setTransformEnabled(this.#transformEnabled, this.#allowDataDisplays);
    if (notify) onComplete(nodeId);
  }

  pickNode(nodeId: string | null, mode: SelectionMode = "replace"): CommandResult {
    this.#assertActive();
    return this.picker.selectNode(nodeId, mode);
  }

  pickObject(objectId: string | null, mode: SelectionMode = "replace"): CommandResult {
    this.#assertActive();
    return this.picker.selectObject(objectId, mode);
  }

  selectFromPointer(input: RuntimePointerSelectionInput): CommandResult {
    this.#assertActive();
    if (this.#anchorPick) {
      const nodeId = this.#hitNodeFromPointer(input.clientX, input.clientY);
      if (nodeId) this.#finishAnchorPick(nodeId);
      return { ok: true, snapshot: this.#store.getSnapshot() };
    }
    const pointerSelection = this.#interactions.pointerSelection;
    const defaultMode = pointerSelection ? pointerSelection.defaultMode : undefined;
    const mode = input.mode ?? resolvePointerSelectionMode(input.modifiers, defaultMode);
    const candidates = [...this.projector.objects.targetEntries()]
      .filter(([, target]) => target.pickable && !target.object.userData.problem)
      .map(([, target]) => target.object);
    return this.picker.pickNodeFromClientPoint(this.#container, input.clientX, input.clientY, candidates, mode);
  }

  getNodeTarget(nodeId: string): Object3D | undefined {
    return this.projector.objects.get(nodeId);
  }

  getObject(objectId: string): Object3D | undefined {
    return this.projector.objects.getObject(objectId);
  }

  getProblems(): Problem[] {
    return [...this.projector.problems, ...this.#dataDisplayProblems];
  }

  subscribeProblems(subscriber: RuntimeProblemSubscriber): Unsubscribe {
    this.#assertActive();
    this.#problemSubscribers.add(subscriber);
    subscriber({ version: this.#problemVersion, problems: this.getProblems() });

    return () => {
      this.#problemSubscribers.delete(subscriber);
    };
  }

  resize(): void {
    this.#assertActive();
    this.#resizeToContainer(true);
  }

  setDataDisplayValues(values: ReadonlyMap<string, string>, problems: readonly Problem[] = []): void {
    if (this.#disposed) return;
    this.projector.setDataDisplayValues(values);
    if (JSON.stringify(problems) !== JSON.stringify(this.#dataDisplayProblems)) {
      this.#dataDisplayProblems = problems;
      this.#publishProblems();
    }
    this.invalidateRender();
  }

  #resizeToContainer(invalidate: boolean): void {
    const width = this.#container.clientWidth || 1;
    const height = this.#container.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.#renderer.setSize(width, height);
    if (invalidate) {
      this.invalidateRender();
    }
  }

  invalidateRender(): void {
    if (this.#disposed || this.#pendingFrame !== null) {
      return;
    }

    this.#pendingFrame = this.#scheduleFrame((time) => {
      this.#pendingFrame = null;
      if (this.#disposed) {
        return;
      }
      this.#controls?.update();
      const preview = this.#motionPreview;
      if (preview) {
        preview.firstFrame ??= time;
        const period = 360_000 / Math.abs(preview.degreesPerSecond);
        const elapsed = (time - preview.firstFrame) % period;
        const radians = elapsed * (preview.degreesPerSecond / 1000) * (Math.PI / 180);
        preview.object.quaternion.copy(preview.base);
        preview.object.rotateOnAxis(preview.axis, radians);
        preview.object.updateMatrix();
        this.#syncSelectionVisuals();
        this.#syncRendererShadowMap();
      }
      // A non-attenuated perspective sprite is sized in view-space at unit depth.
      this.projector.resizeDataDisplays(2 / ((this.#container.clientHeight || 1) * this.camera.projectionMatrix.elements[5]));
      this.#renderer.render(this.scene, this.camera);
      if (this.#motionPreview) this.invalidateRender();
    });
  }

  resetCamera(): void {
    this.#assertActive();
    resetCameraView(this.camera, this.#controls ?? undefined);
    this.invalidateRender();
  }

  frameSelected(options?: RuntimeCameraFrameOptions): boolean {
    this.#assertActive();
    const snapshot = this.#store.getSnapshot();
    const selected = snapshot.selection.nodeIds.length > 0
      ? snapshot.selection.nodeIds
      : snapshot.selection.nodeId ? [snapshot.selection.nodeId] : [];
    const targets = uniqueObjects(selected
      .map((nodeId) => this.projector.objects.getTarget(nodeId))
      .filter(isFrameableTarget)
      .map((target) => target.object));
    const framed = frameCameraToObjects(this.camera, targets, this.#controls ?? undefined, options);
    if (framed) {
      this.invalidateRender();
    }
    return framed;
  }

  frameAll(options?: RuntimeCameraFrameOptions): boolean {
    this.#assertActive();
    const framed = frameCameraToObjects(
      this.camera,
      uniqueObjects([...this.projector.objects.targetEntries()]
        .filter(([, target]) => target.pickable)
        .map(([, target]) => target.object)),
      this.#controls ?? undefined,
      options
    );
    if (framed) {
      this.invalidateRender();
    }
    return framed;
  }

  captureCameraView(input: Pick<AuthoredCameraViewInput, "id" | "name" | "metadata"> = {}): RuntimeCameraViewCaptureResult {
    this.#assertActive();
    return captureAuthoredCameraView(this.camera, this.#controls, input);
  }

  applyCameraView(view: AuthoredCameraView): void {
    this.#assertActive();
    applyAuthoredCameraViewToRuntime(this.camera, view, this.#controls);
    this.invalidateRender();
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    this.stopNodeMotionPreview();
    this.#motionPreviewSubscribers.clear();
    this.#projectedSnapshot = null;
    this.#finishAnchorPick(null);
    this.#projectGeneration += 1;
    if (this.#pendingFrame !== null) {
      this.#cancelFrame(this.#pendingFrame);
      this.#pendingFrame = null;
    }
    this.#unmountInteractions();
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#dataColors.dispose();
    this.#projectionSubscribers.clear();
    this.projector.dispose();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
    this.#problemSubscribers.clear();
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error("Editor runtime has been disposed.");
    }
  }

  #beginProject(): number {
    this.#projectGeneration += 1;
    return this.#projectGeneration;
  }

  #publishProblems(): void {
    this.#problemVersion += 1;
    const snapshot = { version: this.#problemVersion, problems: this.getProblems() };
    for (const subscriber of [...this.#problemSubscribers]) {
      subscriber(snapshot);
    }
  }

  #notifyProjection(): void {
    for (const subscriber of [...this.#projectionSubscribers]) {
      try {
        subscriber();
      } catch {
        // Projection observers must not change the completed projection.
      }
    }
  }

  #mountInteractions(options: ThreeEditorRuntimeOptions): void {
    if (this.#interactions.camera) {
      const controlsFactory = options.cameraControlsFactory ?? createOrbitViewportCameraControls;
      this.#controls = controlsFactory({
        camera: this.camera,
        domElement: this.#renderer.domElement,
        options: this.#interactions.camera
      });
      this.#controls.addEventListener("change", this.#handleControlsChange);
    }

    if (this.#interactions.selectionVisuals) {
      this.#selectionVisuals = new RuntimeSelectionVisuals(this.scene, this.projector.objects, this.#interactions.selectionVisuals);
    }

    if (this.#interactions.marqueeSelection) {
      this.#marqueeSelectionState = options.marqueeSelection ?? null;
      this.#marqueeSelectionState?.reset();
    }

    if (this.#interactions.viewportHelpers) {
      this.#viewportHelpers = new RuntimeViewportHelpers(this.scene, this.projector.objects, this.#interactions.viewportHelpers);
      this.#lightHelpers = new RuntimeLightHelpers(this.scene, this.projector.objects);
      this.#viewportHelperState = options.viewportHelpers ?? null;
      if (this.#viewportHelperState) {
        this.#viewportHelperState.seedVisibility(this.#interactions.viewportHelpers.visibility);
        this.#currentHelperSnapshot = this.#viewportHelperState.get();
      } else {
        this.#currentHelperSnapshot = {
          visibility: this.#interactions.viewportHelpers.visibility,
          hoverNodeId: null,
          snapFeedback: IDLE_VIEWPORT_SNAP_FEEDBACK
        };
        this.#viewportHelpers.setState(this.#currentHelperSnapshot);
      }
      this.#unsubscribeViewportHelpers = this.#viewportHelperState?.subscribe((snapshot) => {
        this.#currentHelperSnapshot = snapshot;
        this.#viewportHelpers?.setState(snapshot);
        this.#lightHelpers?.setState(snapshot);
        this.#syncSelectionVisuals();
        this.invalidateRender();
      }) ?? null;
      if (!this.#viewportHelperState && this.#currentHelperSnapshot) {
        this.#lightHelpers.setState(this.#currentHelperSnapshot);
      }
    }

    if (this.#interactions.transform) {
      const controlsFactory = options.transformControlsFactory ?? createThreeTransformControls;
      this.#transformControls = new TransformControlsAdapter({
        scene: this.scene,
        controls: controlsFactory({
          camera: this.camera,
          domElement: this.#renderer.domElement,
          options: this.#interactions.transform
        }),
        objects: this.projector.objects,
        controller: this.#transformController,
        cameraControls: this.#controls,
        mode: options.transformMode?.get(),
        space: this.#interactions.transform.space,
        snap: options.snap?.get(),
        onChange: this.#handleControlsChange,
        onSnapFeedback: (feedback) => {
          this.#viewportHelperState?.setSnapFeedback(feedback);
        }
      });
      this.#unsubscribeSnap = options.snap?.subscribe((settings) => {
        this.#transformControls?.setSnap(settings);
      }) ?? null;
      this.#unsubscribeTransformMode = options.transformMode?.subscribe((mode) => {
        this.#transformControls?.setMode(mode);
      }) ?? null;
    }

    if (this.#interactions.pointerSelection || this.#interactions.marqueeSelection) {
      this.#renderer.domElement.addEventListener("pointerdown", this.#handlePointerDown, true);
      this.#renderer.domElement.addEventListener("pointerup", this.#handlePointerUp);
      this.#renderer.domElement.addEventListener("pointercancel", this.#handlePointerCancel);
      this.#renderer.domElement.ownerDocument?.addEventListener("keydown", this.#handleKeyDown);
    }

    if (this.#interactions.viewportHelpers || this.#interactions.marqueeSelection) {
      this.#renderer.domElement.addEventListener("pointermove", this.#handlePointerMove);
      this.#renderer.domElement.addEventListener("pointerleave", this.#handlePointerLeave);
    }

    if (this.#interactions.resize) {
      const observer = createResizeObserver(options.resizeObserverFactory, () => {
        if (this.#disposed) {
          return;
        }
        this.resize();
      });
      if (observer) {
        observer.observe(this.#container);
        this.#resizeObserver = observer;
      }
    }
  }

  #unmountInteractions(): void {
    this.#renderer.domElement.removeEventListener("pointerdown", this.#handlePointerDown, true);
    this.#renderer.domElement.removeEventListener("pointerup", this.#handlePointerUp);
    this.#renderer.domElement.removeEventListener("pointercancel", this.#handlePointerCancel);
    this.#renderer.domElement.removeEventListener("pointermove", this.#handlePointerMove);
    this.#renderer.domElement.removeEventListener("pointerleave", this.#handlePointerLeave);
    this.#renderer.domElement.ownerDocument?.removeEventListener("keydown", this.#handleKeyDown);
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#controls?.removeEventListener("change", this.#handleControlsChange);
    this.#controls?.dispose();
    this.#controls = null;
    this.#unsubscribeSnap?.();
    this.#unsubscribeSnap = null;
    this.#unsubscribeViewportHelpers?.();
    this.#unsubscribeViewportHelpers = null;
    this.#unsubscribeTransformMode?.();
    this.#unsubscribeTransformMode = null;
    this.#transformControls?.dispose();
    this.#transformControls = null;
    this.#cancelMarquee();
    this.#marqueeSelectionState = null;
    this.#clearViewportHelperSessionTargets();
    this.#selectionVisuals?.dispose();
    this.#selectionVisuals = null;
    this.#viewportHelpers?.dispose();
    this.#viewportHelpers = null;
    this.#lightHelpers?.dispose();
    this.#lightHelpers = null;
    this.#viewportHelperState = null;
    this.#currentHelperSnapshot = null;
  }

  #hitNodeFromPointer(clientX: number, clientY: number): string | null {
    const candidates = [...this.projector.objects.targetEntries()]
      .filter(([, target]) => target.pickable && !target.object.userData.problem)
      .map(([, target]) => target.object);
    return this.picker.hitNodeFromClientPoint(this.#container, clientX, clientY, candidates,
      this.#anchorPick ? (target) => isDataDisplayAnchor(this.#store.getSnapshot().nodes[target.nodeId]) : undefined);
  }

  #updateMarquee(event: PointerEvent): void {
    const options = this.#interactions.marqueeSelection;
    const start = this.#marqueeStart;
    if (!options || !start || event.button !== start.button && event.buttons === 0) {
      return;
    }

    const distance = Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY);
    if (!this.#marqueeDragging && distance <= options.dragThreshold) {
      return;
    }

    if (!this.#marqueeDragging) {
      this.#marqueeDragging = true;
      this.#viewportHelperState?.setHover(null);
    }

    const current = this.#clientPointToContainerPoint(event.clientX, event.clientY, start.viewport);
    const rect = normalizeMarqueeSelectionRect(start.point, current);
    const result = options.previewCandidates
      ? this.#selectMarqueeRect(rect, start.viewport)
      : { nodeIds: [] };
    this.#marqueeSelectionState?.drag(current, result.nodeIds);
    event.preventDefault();
  }

  #completeMarquee(event: PointerEvent): boolean {
    const options = this.#interactions.marqueeSelection;
    const start = this.#marqueeStart;
    if (!options || !start) {
      return false;
    }

    const wasDragging = this.#marqueeDragging;
    if (!wasDragging) {
      this.#cancelMarquee();
      return false;
    }

    const rect = normalizeMarqueeSelectionRect(
      start.point,
      this.#clientPointToContainerPoint(event.clientX, event.clientY, start.viewport)
    );
    const largeEnough = rect.width >= options.minSize && rect.height >= options.minSize;
    const result = largeEnough ? this.#selectMarqueeRect(rect, start.viewport) : null;
    const mode = resolvePointerSelectionMode(event, options.defaultMode);
    const commandResult = result
      ? this.#dispatchMarqueeSelection(result.nodeIds, mode, result.primaryNodeId)
      : { ok: true as const, snapshot: this.#store.getSnapshot() };
    this.#releasePointer(start.pointerId);
    this.#restoreMarqueeCameraControls();
    this.#pointerStart = null;
    this.#marqueeStart = null;
    this.#marqueeDragging = false;
    this.#marqueeSelectionState?.reset();
    event.preventDefault();
    return commandResult.ok || wasDragging;
  }

  #dispatchMarqueeSelection(nodeIds: string[], mode: SelectionMode, primaryNodeId: string | null = nodeIds[0] ?? null): CommandResult {
    if (mode === "replace" && nodeIds.length === 0) {
      return this.picker.selectNode(null, "replace");
    }
    return this.picker.selectNodes(nodeIds, mode, primaryNodeId);
  }

  #cancelMarquee(): void {
    if (!this.#marqueeStart && !this.#marqueeDragging) {
      return;
    }
    const pointerId = this.#marqueeStart?.pointerId;
    this.#restoreMarqueeCameraControls();
    if (pointerId !== undefined) {
      this.#releasePointer(pointerId);
    }
    this.#marqueeStart = null;
    this.#marqueeDragging = false;
    this.#marqueeSelectionState?.reset();
  }

  #restoreMarqueeCameraControls(): void {
    const enabled = this.#marqueeStart?.cameraControlsEnabled;
    if (this.#controls && enabled !== null && enabled !== undefined) {
      this.#controls.enabled = enabled;
    }
  }

  #selectMarqueeRect(rect: MarqueeSelectionRect, viewport: RuntimeViewportMetrics = this.#viewportMetrics()): { nodeIds: string[]; primaryNodeId: string | null } {
    return new RuntimeMarqueeSelection({
      camera: this.camera,
      objects: this.projector.objects,
      viewport
    }).select(rect);
  }

  #clientPointToContainerPoint(clientX: number, clientY: number, viewport: RuntimeViewportMetrics = this.#viewportMetrics()): MarqueeSelectionPoint {
    return {
      x: clamp(clientX - viewport.left, 0, viewport.width),
      y: clamp(clientY - viewport.top, 0, viewport.height)
    };
  }

  #viewportMetrics(): RuntimeViewportMetrics {
    const rect = this.#container.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width || this.#container.clientWidth || 1,
      height: rect.height || this.#container.clientHeight || 1
    };
  }

  #capturePointer(pointerId: number): void {
    try {
      this.#renderer.domElement.setPointerCapture?.(pointerId);
    } catch {
      // jsdom and detached canvases may reject pointer capture.
    }
  }

  #releasePointer(pointerId: number): void {
    try {
      this.#renderer.domElement.releasePointerCapture?.(pointerId);
    } catch {
      // Pointer capture may not have been acquired.
    }
  }

  #clearStaleViewportHelperTargets(): void {
    const snapshot = this.#currentHelperSnapshot;
    if (!this.#viewportHelperState || !snapshot) {
      return;
    }
    if (snapshot.hoverNodeId && !this.projector.objects.getTarget(snapshot.hoverNodeId)) {
      this.#viewportHelperState.setHover(null);
    }
    if (snapshot.snapFeedback.nodeId && !this.projector.objects.getTarget(snapshot.snapFeedback.nodeId)) {
      this.#viewportHelperState.setSnapFeedback(IDLE_VIEWPORT_SNAP_FEEDBACK);
    }
  }

  #clearViewportHelperSessionTargets(): void {
    const snapshot = this.#viewportHelperState?.get();
    if (!snapshot) {
      return;
    }
    if (snapshot.hoverNodeId) {
      this.#viewportHelperState?.setHover(null);
    }
    if (snapshot.snapFeedback.status !== "idle" || snapshot.snapFeedback.nodeId) {
      this.#viewportHelperState?.setSnapFeedback(IDLE_VIEWPORT_SNAP_FEEDBACK);
    }
  }

  #syncSelectionVisuals(): void {
    if (!this.#interactions.selectionVisuals) {
      return;
    }
    if (this.#currentHelperSnapshot?.visibility.selectionBounds === false) {
      this.#selectionVisuals?.dispose();
      this.#selectionVisuals = null;
      return;
    }
    this.#selectionVisuals ??= new RuntimeSelectionVisuals(this.scene, this.projector.objects, this.#interactions.selectionVisuals);
    this.#selectionVisuals.sync();
  }

  #syncRendererShadowMap(): void {
    const shadowMap = this.#renderer.shadowMap;
    if (!shadowMap) {
      return;
    }
    const enabled = this.projector.shadowSummary.enabled;
    shadowMap.enabled = enabled;
    if (enabled) {
      shadowMap.needsUpdate = true;
    } else if (shadowMap.needsUpdate !== undefined) {
      shadowMap.needsUpdate = false;
    }
  }
}

export function createDefaultRenderer(container: HTMLElement): RendererLike {
  try {
    const renderer = new WebGLRenderer({ antialias: true });
    return renderer as unknown as RendererLike;
  } catch {
    const canvas = container.ownerDocument.createElement("canvas");
    return {
      domElement: canvas,
      setSize(width, height) {
        canvas.width = width;
        canvas.height = height;
      },
      render() {},
      dispose() {}
    };
  }
}

function createPmremAdapter(renderer: RendererLike): RuntimePmremAdapter | undefined {
  return isThreeWebGLRenderer(renderer) ? new ThreePmremAdapter(renderer) : undefined;
}

function isThreeWebGLRenderer(renderer: RendererLike): renderer is ThreeWebGLRenderer & RendererLike {
  return "getRenderTarget" in renderer && "xr" in renderer;
}

function defaultScheduleFrame(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(performance.now()), 0) as unknown as number;
}

function defaultCancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle);
}

function createResizeObserver(
  factory: ResizeObserverFactory | undefined,
  callback: ResizeObserverCallback
): Pick<ResizeObserver, "observe" | "disconnect"> | null {
  if (factory) {
    return factory(callback);
  }
  if (typeof ResizeObserver === "undefined") {
    return null;
  }
  return new ResizeObserver(callback);
}

function isObject3D(object: Object3D | undefined): object is Object3D {
  return Boolean(object);
}

function isFrameableTarget(target: RuntimeNodeTarget | undefined): target is RuntimeNodeTarget {
  return Boolean(target?.pickable && (target.kind !== "light" || target.transformable));
}

function uniqueObjects(objects: Object3D[]): Object3D[] {
  return [...new Set(objects)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
