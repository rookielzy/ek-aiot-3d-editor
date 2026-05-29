import { PerspectiveCamera, Scene, WebGLRenderer, type Object3D } from "three";
import { AssetResolverBridge } from "../assets/resolver";
import type { Problem } from "../assets/problems";
import type { CommandDispatcher } from "../commands/dispatcher";
import type { CommandResult } from "../commands/types";
import type { EditorStore } from "../editor/store";
import type { SceneSnapshot } from "../snapshot/types";
import type { GltfLoaderAdapter } from "./gltf-loader-adapter";
import { SceneProjector } from "./scene-projector";
import { ObjectPicker } from "./picking";

export interface RendererLike {
  domElement: HTMLElement;
  setSize(width: number, height: number): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
}

export type RendererFactory = (container: HTMLElement) => RendererLike;

export interface EditorRuntimeOptions {
  container: HTMLElement;
  store: EditorStore;
  dispatcher: CommandDispatcher;
  resolver?: AssetResolverBridge;
  loader?: GltfLoaderAdapter;
  rendererFactory?: RendererFactory;
}

export interface EditorRuntime {
  project(snapshot?: SceneSnapshot): Promise<void>;
  pickObject(objectId: string | null): CommandResult;
  getObject(objectId: string): Object3D | undefined;
  getProblems(): Problem[];
  dispose(): void;
  readonly disposed: boolean;
}

export class ThreeEditorRuntime implements EditorRuntime {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 1000);
  readonly projector: SceneProjector;
  readonly picker: ObjectPicker;
  #container: HTMLElement;
  #store: EditorStore;
  #renderer: RendererLike;
  #unsubscribe: (() => void) | null = null;
  #disposed = false;

  constructor(options: EditorRuntimeOptions) {
    this.#container = options.container;
    this.#store = options.store;
    this.#renderer = (options.rendererFactory ?? createDefaultRenderer)(options.container);
    this.projector = new SceneProjector({
      scene: this.scene,
      resolver: options.resolver,
      loader: options.loader
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
    await this.projector.project(snapshot);
    this.#renderer.render(this.scene, this.camera);
  }

  pickObject(objectId: string | null): CommandResult {
    this.#assertActive();
    return this.picker.selectObject(objectId);
  }

  getObject(objectId: string): Object3D | undefined {
    return this.projector.objects.get(objectId);
  }

  getProblems(): Problem[] {
    return this.projector.problems;
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
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.projector.dispose();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error("Editor runtime has been disposed.");
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
