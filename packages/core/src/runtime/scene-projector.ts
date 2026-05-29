import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, Scene } from "three";
import { AssetResolverBridge } from "../assets/resolver";
import { createMissingAssetProblem, type Problem } from "../assets/problems";
import type { SceneObject, SceneSnapshot, Transform } from "../snapshot/types";
import type { GltfLoaderAdapter } from "./gltf-loader-adapter";
import { PlaceholderGltfLoaderAdapter } from "./gltf-loader-adapter";
import { disposeObjectTree } from "./disposal";
import { ThreeObjectMap } from "./three-object-map";

export interface SceneProjectorOptions {
  scene?: Scene;
  resolver?: AssetResolverBridge;
  loader?: GltfLoaderAdapter;
}

export class SceneProjector {
  readonly scene: Scene;
  readonly objects = new ThreeObjectMap();
  #resolver: AssetResolverBridge;
  #loader: GltfLoaderAdapter;
  #problems: Problem[] = [];
  #loadTokens = new Map<string, number>();

  constructor(options: SceneProjectorOptions = {}) {
    this.scene = options.scene ?? new Scene();
    this.#resolver = options.resolver ?? new AssetResolverBridge();
    this.#loader = options.loader ?? new PlaceholderGltfLoaderAdapter();
  }

  get problems(): Problem[] {
    return [...this.#problems];
  }

  async project(snapshot: SceneSnapshot): Promise<void> {
    const nextIds = new Set(Object.keys(snapshot.objects));

    for (const [objectId, runtimeObject] of [...this.objects.entries()]) {
      if (!nextIds.has(objectId)) {
        disposeObjectTree(runtimeObject);
        this.objects.delete(objectId);
      }
    }

    this.#problems = [];

    for (const objectId of snapshot.rootObjectIds) {
      const object = snapshot.objects[objectId];
      if (object) {
        await this.projectObject(object, snapshot);
      }
    }
  }

  async projectObject(object: SceneObject, snapshot: SceneSnapshot): Promise<Object3D> {
    let runtimeObject = this.objects.get(object.id);
    if (!runtimeObject) {
      runtimeObject = await this.createRuntimeObject(object);
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
      const childRuntime = await this.projectObject(child, snapshot);
      if (childRuntime.parent !== runtimeObject) {
        runtimeObject.add(childRuntime);
      }
    }

    return runtimeObject;
  }

  dispose(): void {
    const roots = [...this.objects.entries()]
      .map(([, object]) => object)
      .filter((object) => !this.#hasMappedAncestor(object));

    for (const object of roots) {
      disposeObjectTree(object);
    }
    this.objects.clear();
    this.#problems = [];
    this.#loadTokens.clear();
  }

  async createRuntimeObject(object: SceneObject): Promise<Object3D> {
    const token = (this.#loadTokens.get(object.id) ?? 0) + 1;
    this.#loadTokens.set(object.id, token);
    const resolved = await this.#resolver.resolve(object.asset);

    if (!resolved) {
      this.#addProblem(createMissingAssetProblem(object.asset.id, object.id));
      return createProblemPlaceholder(object.id);
    }

    try {
      const loaded = await this.#loader.load(resolved);
      if (this.#loadTokens.get(object.id) !== token) {
        disposeObjectTree(loaded);
        return createProblemPlaceholder(object.id);
      }
      return loaded;
    } catch (error) {
      this.#addProblem({
        id: `asset-load-failed:${object.asset.id}:${object.id}`,
        severity: "error",
        code: "asset-load-failed",
        objectId: object.id,
        assetId: object.asset.id,
        message: error instanceof Error ? error.message : String(error)
      });
      return createProblemPlaceholder(object.id);
    }
  }

  #addProblem(problem: Problem): void {
    if (!this.#problems.some((existing) => existing.id === problem.id)) {
      this.#problems.push(problem);
    }
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

export function applyTransform(object: Object3D, transform: Transform): void {
  object.position.set(...transform.position);
  object.rotation.set(...transform.rotation);
  object.scale.set(...transform.scale);
  object.updateMatrixWorld(true);
}

export function readTransform(object: Object3D): Transform {
  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: [object.scale.x, object.scale.y, object.scale.z]
  };
}

function createProblemPlaceholder(objectId: string): Object3D {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffb020, wireframe: true }));
  mesh.name = `Missing asset placeholder ${objectId}`;
  mesh.userData.sceneObjectId = objectId;
  mesh.userData.problem = true;
  return mesh;
}
