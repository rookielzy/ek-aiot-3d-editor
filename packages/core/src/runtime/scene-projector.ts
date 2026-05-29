import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, Scene } from "three";
import { AssetResolverBridge } from "../assets/resolver";
import { createMissingAssetProblem, type Problem } from "../assets/problems";
import type { SceneObject, SceneSnapshot } from "../snapshot/types";
import { EnvironmentProjector } from "./environment-projector";
import type { GltfLoaderAdapter } from "./gltf-loader-adapter";
import { PlaceholderGltfLoaderAdapter } from "./gltf-loader-adapter";
import { LightProjector } from "./light-projector";
import type { RuntimePmremAdapter } from "./pmrem-adapter";
import { disposeObjectTree } from "./disposal";
import { applyTransform, readTransform } from "./transform";
import { ThreeObjectMap } from "./three-object-map";
import type { RuntimeTextureLoaderAdapter } from "./texture-loader-adapter";

export interface SceneProjectorOptions {
  scene?: Scene;
  resolver?: AssetResolverBridge;
  loader?: GltfLoaderAdapter;
  textureLoader?: RuntimeTextureLoaderAdapter;
  hdrLoader?: RuntimeTextureLoaderAdapter;
  pmrem?: RuntimePmremAdapter;
}

export class SceneProjector {
  readonly scene: Scene;
  readonly objects = new ThreeObjectMap();
  #resolver: AssetResolverBridge;
  #loader: GltfLoaderAdapter;
  #environment: EnvironmentProjector;
  #lights: LightProjector;
  #problems: Problem[] = [];
  #loadTokens = new Map<string, number>();
  #projectionGeneration = 0;
  #disposed = false;

  constructor(options: SceneProjectorOptions = {}) {
    this.scene = options.scene ?? new Scene();
    this.#resolver = options.resolver ?? new AssetResolverBridge();
    this.#loader = options.loader ?? new PlaceholderGltfLoaderAdapter();
    this.#environment = new EnvironmentProjector({
      scene: this.scene,
      resolver: this.#resolver,
      textureLoader: options.textureLoader,
      hdrLoader: options.hdrLoader,
      pmrem: options.pmrem
    });
    this.#lights = new LightProjector(this.scene);
  }

  get problems(): Problem[] {
    return [...this.#problems];
  }

  async project(snapshot: SceneSnapshot): Promise<void> {
    if (this.#disposed) {
      return;
    }

    const generation = this.#beginProjection();
    const nextIds = new Set(Object.keys(snapshot.objects));

    for (const [objectId, runtimeObject] of [...this.objects.entries()]) {
      if (!this.#isActive(generation)) {
        return;
      }
      if (!nextIds.has(objectId)) {
        disposeObjectTree(runtimeObject);
        this.objects.delete(objectId);
      }
    }

    this.#problems = [];

    for (const objectId of snapshot.rootObjectIds) {
      const object = snapshot.objects[objectId];
      if (object) {
        await this.#projectObject(object, snapshot, generation);
        if (!this.#isActive(generation)) {
          return;
        }
      }
    }

    const environmentProblems = await this.#environment.project(snapshot);
    if (!this.#isActive(generation)) {
      return;
    }
    this.#appendProblems(environmentProblems);
    this.#lights.project(snapshot.lights);
  }

  getLight(lightId: string): Object3D | undefined {
    return this.#lights.get(lightId);
  }

  getLightTarget(lightId: string): Object3D | undefined {
    return this.#lights.getTarget(lightId);
  }

  async #projectObject(object: SceneObject, snapshot: SceneSnapshot, generation: number): Promise<Object3D | null> {
    if (!this.#isActive(generation)) {
      return null;
    }

    let runtimeObject: Object3D | null | undefined = this.objects.get(object.id);
    if (runtimeObject?.userData.problem) {
      const replacement = await this.#createRuntimeObject(object, generation);
      if (!this.#isActive(generation)) {
        replacement && disposeObjectTree(replacement);
        return null;
      }
      if (!replacement) {
        return null;
      }
      this.objects.set(object.id, replacement);
      if (runtimeObject.parent) {
        runtimeObject.parent.add(replacement);
      } else {
        this.scene.add(replacement);
      }
      disposeObjectTree(runtimeObject);
      runtimeObject = replacement;
    } else if (!runtimeObject) {
      runtimeObject = await this.#createRuntimeObject(object, generation);
      if (!this.#isActive(generation)) {
        runtimeObject && disposeObjectTree(runtimeObject);
        return null;
      }
      if (!runtimeObject) {
        return null;
      }
      this.objects.set(object.id, runtimeObject);
      this.scene.add(runtimeObject);
    }

    applyTransform(runtimeObject, object.transform);
    runtimeObject.name = object.name;
    runtimeObject.userData = {
      ...runtimeObject.userData,
      sceneObjectId: object.id,
      selected: snapshot.selection.objectId === object.id
    };

    for (const childId of object.children) {
      const child = snapshot.objects[childId];
      if (!child) {
        continue;
      }
      const childRuntime = await this.#projectObject(child, snapshot, generation);
      if (!this.#isActive(generation)) {
        return null;
      }
      if (!childRuntime) {
        continue;
      }
      if (childRuntime.parent !== runtimeObject) {
        runtimeObject.add(childRuntime);
      }
    }

    return runtimeObject;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    this.#projectionGeneration += 1;
    const roots = [...this.objects.entries()]
      .map(([, object]) => object)
      .filter((object) => !this.#hasMappedAncestor(object));

    for (const object of roots) {
      disposeObjectTree(object);
    }
    this.objects.clear();
    this.#environment.dispose();
    this.#lights.dispose();
    this.#problems = [];
    this.#loadTokens.clear();
  }

  async #createRuntimeObject(object: SceneObject, generation: number): Promise<Object3D | null> {
    if (!this.#isActive(generation)) {
      return null;
    }

    const token = (this.#loadTokens.get(object.id) ?? 0) + 1;
    this.#loadTokens.set(object.id, token);
    let resolved;
    try {
      resolved = await this.#resolver.resolve(object.asset);
    } catch (error) {
      if (!this.#isActive(generation)) {
        return null;
      }
      this.#addProblem({
        id: `asset-resolve-failed:${object.asset.id}:${object.id}`,
        severity: "error",
        code: "asset-resolve-failed",
        objectId: object.id,
        assetId: object.asset.id,
        source: "runtime",
        target: { kind: "object", objectId: object.id },
        recoverability: "user-action",
        message: error instanceof Error ? error.message : String(error),
        display: {
          title: "Asset failed to resolve"
        }
      });
      return createProblemPlaceholder(object.id);
    }
    if (!this.#isActive(generation)) {
      return null;
    }

    if (!resolved) {
      this.#addProblem(createMissingAssetProblem(object.asset.id, object.id));
      return createProblemPlaceholder(object.id);
    }

    try {
      const loaded = await this.#loader.load(resolved);
      if (!this.#isActive(generation) || this.#loadTokens.get(object.id) !== token) {
        disposeObjectTree(loaded);
        return null;
      }
      return loaded;
    } catch (error) {
      if (!this.#isActive(generation)) {
        return null;
      }
      this.#addProblem({
        id: `asset-load-failed:${object.asset.id}:${object.id}`,
        severity: "error",
        code: "asset-load-failed",
        objectId: object.id,
        assetId: object.asset.id,
        source: "runtime",
        target: { kind: "object", objectId: object.id },
        recoverability: "user-action",
        message: error instanceof Error ? error.message : String(error),
        display: {
          title: "Asset failed to load"
        }
      });
      return createProblemPlaceholder(object.id);
    }
  }

  #addProblem(problem: Problem): void {
    if (!this.#problems.some((existing) => existing.id === problem.id)) {
      this.#problems.push(problem);
    }
  }

  #appendProblems(problems: Problem[]): void {
    for (const problem of problems) {
      this.#addProblem(problem);
    }
  }

  #beginProjection(): number {
    this.#projectionGeneration += 1;
    return this.#projectionGeneration;
  }

  #isActive(generation: number): boolean {
    return !this.#disposed && generation === this.#projectionGeneration;
  }

  #hasMappedAncestor(object: Object3D): boolean {
    let parent = object.parent;
    while (parent) {
      if (this.objects.getId(parent)) {
        return true;
      }
      parent = parent.parent;
    }
    return false;
  }
}

export { applyTransform, readTransform } from "./transform";

function createProblemPlaceholder(objectId: string): Object3D {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffb020, wireframe: true }));
  mesh.name = `Missing asset placeholder ${objectId}`;
  mesh.userData.sceneObjectId = objectId;
  mesh.userData.problem = true;
  return mesh;
}
