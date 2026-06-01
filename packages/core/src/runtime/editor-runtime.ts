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

export interface RendererLike {
  domElement: HTMLElement;
  setSize(width: number, height: number): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
}

export type RendererFactory = (container: HTMLElement) => RendererLike;
export type PmremFactory = (renderer: RendererLike) => RuntimePmremAdapter;

export interface EditorRuntimeOptions {
  container: HTMLElement;
  store: EditorStore;
  dispatcher: CommandDispatcher;
  resolver?: AssetResolverBridge;
  loader?: GltfLoaderAdapter;
  rendererFactory?: RendererFactory;
}

interface ThreeEditorRuntimeOptions extends EditorRuntimeOptions {
  textureLoader?: RuntimeTextureLoaderAdapter;
  hdrLoader?: RuntimeTextureLoaderAdapter;
  pmremFactory?: PmremFactory;
}

export interface EditorRuntime {
  project(snapshot?: SceneSnapshot): Promise<void>;
  pickObject(objectId: string | null, mode?: SelectionMode): CommandResult;
  getObject(objectId: string): Object3D | undefined;
  getProblems(): Problem[];
  subscribeProblems(subscriber: RuntimeProblemSubscriber): Unsubscribe;
  dispose(): void;
  readonly disposed: boolean;
}

export interface RuntimeProblemSnapshot {
  version: number;
  problems: Problem[];
}

export type RuntimeProblemSubscriber = (snapshot: RuntimeProblemSnapshot) => void;

export class ThreeEditorRuntime implements EditorRuntime {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 1000);
  readonly projector: SceneProjector;
  readonly picker: ObjectPicker;
  #container: HTMLElement;
  #store: EditorStore;
  #renderer: RendererLike;
  #unsubscribe: (() => void) | null = null;
  #problemSubscribers = new Set<RuntimeProblemSubscriber>();
  #problemVersion = 0;
  #disposed = false;
  #projectGeneration = 0;

  constructor(options: ThreeEditorRuntimeOptions) {
    this.#container = options.container;
    this.#store = options.store;
    this.#renderer = (options.rendererFactory ?? createDefaultRenderer)(options.container);
    this.projector = new SceneProjector({
      scene: this.scene,
      resolver: options.resolver,
      loader: options.loader,
      textureLoader: options.textureLoader,
      hdrLoader: options.hdrLoader,
      pmrem: options.pmremFactory?.(this.#renderer) ?? createPmremAdapter(this.#renderer)
    });
    this.picker = new ObjectPicker(this.camera, this.projector.objects, options.dispatcher);
    this.camera.position.set(0, 2, 5);

    this.#container.appendChild(this.#renderer.domElement);
    this.resize();
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
    this.#renderer.render(this.scene, this.camera);
    this.#publishProblems();
  }

  pickObject(objectId: string | null, mode: SelectionMode = "replace"): CommandResult {
    this.#assertActive();
    return this.picker.selectObject(objectId, mode);
  }

  getObject(objectId: string): Object3D | undefined {
    return this.projector.objects.get(objectId);
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
    const width = this.#container.clientWidth || 1;
    const height = this.#container.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.#renderer.setSize(width, height);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    this.#projectGeneration += 1;
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
