import { PerspectiveCamera, Scene, WebGLRenderer, type Object3D, type WebGLRenderer as ThreeWebGLRenderer } from "three";
import { AssetResolverBridge } from "../assets/resolver";
import type { Problem } from "../assets/problems";
import type { CommandDispatcher } from "../commands/dispatcher";
import type { CommandResult } from "../commands/types";
import type { SelectionMode } from "../selection/selection";
import type { EditorStore } from "../editor/store";
import type { SceneSnapshot } from "../snapshot/types";
import type { GltfLoaderAdapter } from "./gltf-loader-adapter";
import type { RuntimePmremAdapter } from "./pmrem-adapter";
import { ThreePmremAdapter } from "./pmrem-adapter";
import { SceneProjector } from "./scene-projector";
import { ObjectPicker } from "./picking";
import type { RuntimeTextureLoaderAdapter } from "./texture-loader-adapter";
import type { Unsubscribe } from "../editor/subscription";
import type { EditorSnapState } from "../editor/snap-state";
import { RuntimeSelectionVisuals } from "./selection-visuals";
import type { RuntimeNodeTarget } from "./three-object-map";
import { TransformControlsAdapter, createThreeTransformControls, type RuntimeTransformControlsFactory } from "./transform/transform-controls-adapter";
import { TransformController } from "./transform/transform-controller";
import type { EditorTransformModeState } from "./transform/transform-mode";
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
}

interface ThreeEditorRuntimeOptions extends EditorRuntimeOptions {
  textureLoader?: RuntimeTextureLoaderAdapter;
  hdrLoader?: RuntimeTextureLoaderAdapter;
  pmremFactory?: PmremFactory;
  cameraControlsFactory?: ViewportCameraControlsFactory;
  transformControlsFactory?: RuntimeTransformControlsFactory;
  snap?: EditorSnapState;
  transformMode?: EditorTransformModeState;
  resizeObserverFactory?: ResizeObserverFactory;
  scheduleFrame?: RuntimeAnimationFrameScheduler;
  cancelFrame?: RuntimeAnimationFrameCancel;
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
  dispose(): void;
  readonly disposed: boolean;
}

export interface RuntimeProblemSnapshot {
  version: number;
  problems: Problem[];
}

export type RuntimeProblemSubscriber = (snapshot: RuntimeProblemSnapshot) => void;
export type ResizeObserverFactory = (callback: ResizeObserverCallback) => Pick<ResizeObserver, "observe" | "disconnect">;

export class ThreeEditorRuntime implements EditorRuntime {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 1000);
  readonly projector: SceneProjector;
  readonly picker: ObjectPicker;
  #container: HTMLElement;
  #store: EditorStore;
  #renderer: RendererLike;
  #interactions = normalizeRuntimeInteractionOptions(false);
  #controls: ViewportCameraControls | null = null;
  #transformControls: TransformControlsAdapter | null = null;
  #transformController: TransformController;
  #selectionVisuals: RuntimeSelectionVisuals | null = null;
  #resizeObserver: Pick<ResizeObserver, "observe" | "disconnect"> | null = null;
  #scheduleFrame: RuntimeAnimationFrameScheduler;
  #cancelFrame: RuntimeAnimationFrameCancel;
  #pendingFrame: number | null = null;
  #unsubscribe: (() => void) | null = null;
  #unsubscribeSnap: (() => void) | null = null;
  #unsubscribeTransformMode: (() => void) | null = null;
  #problemSubscribers = new Set<RuntimeProblemSubscriber>();
  #problemVersion = 0;
  #disposed = false;
  #projectGeneration = 0;
  #pointerStart: { clientX: number; clientY: number; button: number } | null = null;
  #handleControlsChange = () => {
    this.invalidateRender();
  };
  #handlePointerDown = (event: PointerEvent) => {
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
    await this.projector.project(snapshot);
    if (this.#disposed || generation !== this.#projectGeneration) {
      return;
    }
    this.#selectionVisuals?.sync();
    this.#transformControls?.sync(snapshot);
    this.invalidateRender();
    this.#publishProblems();
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
    return this.projector.problems;
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

    this.#pendingFrame = this.#scheduleFrame(() => {
      this.#pendingFrame = null;
      if (this.#disposed) {
        return;
      }
      this.#controls?.update();
      this.#renderer.render(this.scene, this.camera);
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
    const targets = selected
      .map((nodeId) => this.projector.objects.getTarget(nodeId))
      .filter(isTransformableTarget)
      .map((target) => target.object);
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
      [...this.projector.objects.targetEntries()]
        .filter(([, target]) => target.transformable)
        .map(([, target]) => target.object),
      this.#controls ?? undefined,
      options
    );
    if (framed) {
      this.invalidateRender();
    }
    return framed;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    this.#projectGeneration += 1;
    if (this.#pendingFrame !== null) {
      this.#cancelFrame(this.#pendingFrame);
      this.#pendingFrame = null;
    }
    this.#unmountInteractions();
    this.#unsubscribe?.();
    this.#unsubscribe = null;
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
        snap: options.snap?.get(),
        onChange: this.#handleControlsChange
      });
      this.#unsubscribeSnap = options.snap?.subscribe((settings) => {
        this.#transformControls?.setSnap(settings);
      }) ?? null;
      this.#unsubscribeTransformMode = options.transformMode?.subscribe((mode) => {
        this.#transformControls?.setMode(mode);
      }) ?? null;
    }

    if (this.#interactions.pointerSelection) {
      this.#renderer.domElement.addEventListener("pointerdown", this.#handlePointerDown);
      this.#renderer.domElement.addEventListener("pointerup", this.#handlePointerUp);
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
    this.#renderer.domElement.removeEventListener("pointerdown", this.#handlePointerDown);
    this.#renderer.domElement.removeEventListener("pointerup", this.#handlePointerUp);
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#controls?.removeEventListener("change", this.#handleControlsChange);
    this.#controls?.dispose();
    this.#controls = null;
    this.#unsubscribeSnap?.();
    this.#unsubscribeSnap = null;
    this.#unsubscribeTransformMode?.();
    this.#unsubscribeTransformMode = null;
    this.#transformControls?.dispose();
    this.#transformControls = null;
    this.#selectionVisuals?.dispose();
    this.#selectionVisuals = null;
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

function isTransformableTarget(target: RuntimeNodeTarget | undefined): target is RuntimeNodeTarget {
  return Boolean(target?.transformable);
}
