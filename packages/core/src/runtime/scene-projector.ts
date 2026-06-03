import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Scene } from "three";
import { AssetResolverBridge } from "../assets/resolver";
import { createMissingAssetProblem, type Problem } from "../assets/problems";
import type { SceneLightNode, SceneNode, SceneObject, SceneObjectNode, SceneSnapshot } from "../snapshot/types";
import { EnvironmentProjector } from "./environment-projector";
import type { GltfLoaderAdapter } from "./gltf-loader-adapter";
import { PlaceholderGltfLoaderAdapter } from "./gltf-loader-adapter";
import { LightProjector } from "./light-projector";
import { MaterialProjector } from "./material-projector";
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
  #materials: MaterialProjector;
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
    this.#materials = new MaterialProjector({
      resolver: this.#resolver,
      textureLoader: options.textureLoader
    });
  }

  get problems(): Problem[] {
    return [...this.#problems];
  }

  async project(snapshot: SceneSnapshot): Promise<void> {
    if (this.#disposed) {
      return;
    }

    const generation = this.#beginProjection();
    const nextNodeIds = new Set(Object.keys(snapshot.nodes));
    const nextObjectIds = new Set(Object.keys(snapshot.objects));
    this.#materials.releaseObjects(nextObjectIds);

    this.#releaseRemovedTargets(snapshot, nextNodeIds);

    this.#problems = [];
    const activeLightIds = new Set<string>();

    for (const nodeId of snapshot.rootNodeIds) {
      await this.#projectNode(nodeId, snapshot, this.scene, generation, activeLightIds);
      if (!this.#isActive(generation)) {
        return;
      }
    }
    this.#lights.release(activeLightIds);

    const materialProblems = await this.#materials.project(snapshot, this.objects.entries());
    if (!this.#isActive(generation)) {
      return;
    }
    this.#appendProblems(materialProblems);

    const environmentProblems = await this.#environment.project(snapshot);
    if (!this.#isActive(generation)) {
      return;
    }
    this.#appendProblems(environmentProblems);
  }

  getLight(lightId: string): Object3D | undefined {
    return this.#lights.get(lightId);
  }

  getLightTarget(lightId: string): Object3D | undefined {
    return this.#lights.getTarget(lightId);
  }

  async #projectNode(
    nodeId: string,
    snapshot: SceneSnapshot,
    parent: Object3D,
    generation: number,
    activeLightIds: Set<string>
  ): Promise<Object3D | null> {
    if (!this.#isActive(generation)) {
      return null;
    }

    const node = snapshot.nodes[nodeId];
    if (!node) {
      return null;
    }

    let runtimeObject: Object3D | null;
    switch (node.kind) {
      case "object":
        runtimeObject = await this.#projectObjectNode(node, snapshot, generation);
        break;
      case "group":
        runtimeObject = this.#projectGroupNode(node, snapshot);
        break;
      case "light":
        runtimeObject = this.#projectLightNode(node, snapshot, parent, activeLightIds);
        break;
      default:
        return assertNever(node);
    }

    if (!this.#isActive(generation)) {
      return null;
    }
    if (!runtimeObject) {
      return null;
    }
    if (runtimeObject.parent !== parent) {
      parent.add(runtimeObject);
    }

    for (const childId of node.children) {
      await this.#projectNode(childId, snapshot, runtimeObject, generation, activeLightIds);
      if (!this.#isActive(generation)) {
        return null;
      }
    }

    return runtimeObject;
  }

  async #projectObjectNode(node: SceneObjectNode, snapshot: SceneSnapshot, generation: number): Promise<Object3D | null> {
    if (!this.#isActive(generation)) {
      return null;
    }

    const object = snapshot.objects[node.objectId];
    if (!object) {
      return null;
    }

    let runtimeObject: Object3D | null | undefined = this.objects.get(node.id);
    if (runtimeObject?.userData.problem) {
      const replacement = await this.#createRuntimeObject(object, generation);
      if (!this.#isActive(generation)) {
        replacement && disposeObjectTree(replacement);
        return null;
      }
      if (!replacement) {
        return null;
      }
      this.objects.set(node.id, replacement, {
        kind: "object",
        objectId: object.id,
        transformable: true,
        pickable: true
      });
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
      this.objects.set(node.id, runtimeObject, {
        kind: "object",
        objectId: object.id,
        transformable: true,
        pickable: true
      });
    }

    applyTransform(runtimeObject, node.transform);
    runtimeObject.name = node.name;
    runtimeObject.userData = {
      ...runtimeObject.userData,
      sceneNodeId: node.id,
      nodeKind: node.kind,
      sceneObjectId: object.id,
      selected: snapshot.selection.nodeIds.includes(node.id),
      primarySelected: snapshot.selection.nodeId === node.id
    };

    return runtimeObject;
  }

  #projectGroupNode(node: SceneNode & { kind: "group" }, snapshot: SceneSnapshot): Object3D {
    let runtimeObject = this.objects.get(node.id);
    if (!runtimeObject) {
      runtimeObject = new Group();
      this.objects.set(node.id, runtimeObject, {
        kind: "group",
        transformable: true,
        pickable: true
      });
    }

    applyTransform(runtimeObject, node.transform);
    runtimeObject.name = node.name;
    runtimeObject.userData = {
      ...runtimeObject.userData,
      sceneNodeId: node.id,
      nodeKind: node.kind,
      selected: snapshot.selection.nodeIds.includes(node.id),
      primarySelected: snapshot.selection.nodeId === node.id
    };
    return runtimeObject;
  }

  #projectLightNode(
    node: SceneLightNode,
    snapshot: SceneSnapshot,
    parent: Object3D,
    activeLightIds: Set<string>
  ): Object3D | null {
    const light = snapshot.lights[node.lightId];
    if (!light) {
      return null;
    }

    const definition = "transform" in light && node.transform
      ? { ...light, name: node.name, transform: node.transform }
      : { ...light, name: node.name };
    const projected = this.#lights.projectLight(definition, parent);
    activeLightIds.add(light.id);
    this.objects.set(node.id, projected.light, {
      kind: "light",
      lightId: light.id,
      transformable: Boolean(node.transform),
      pickable: true
    });
    projected.light.userData = {
      ...projected.light.userData,
      sceneNodeId: node.id,
      nodeKind: node.kind,
      runtimeLightId: light.id,
      selected: snapshot.selection.nodeIds.includes(node.id),
      primarySelected: snapshot.selection.nodeId === node.id
    };
    if (projected.target) {
      projected.target.userData = {
        ...projected.target.userData,
        runtimeOnly: true,
        sceneNodeId: node.id,
        nodeKind: node.kind,
        runtimeLightTargetId: light.id
      };
    }
    if (projected.pickProxy) {
      this.objects.link(node.id, projected.pickProxy);
      projected.pickProxy.userData = {
        ...projected.pickProxy.userData,
        runtimeOnly: true,
        sceneNodeId: node.id,
        nodeKind: node.kind,
        runtimeLightPickProxyId: light.id
      };
    }
    return projected.light;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    this.#projectionGeneration += 1;
    const roots = [...this.objects.targetEntries()]
      .filter(([, target]) => target.kind !== "light")
      .map(([, target]) => target.object)
      .filter((object) => !this.#hasMappedAncestor(object));

    this.#materials.dispose();
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

  #releaseRemovedTargets(snapshot: SceneSnapshot, nextNodeIds: Set<string>): void {
    const removedNodeIds = new Set<string>();
    for (const [nodeId, target] of this.objects.targetEntries()) {
      if (!this.#shouldRetainTarget(snapshot, nodeId, target)) {
        removedNodeIds.add(nodeId);
      }
    }

    for (const [nodeId, target] of [...this.objects.targetEntries()]) {
      if (!removedNodeIds.has(nodeId)) {
        continue;
      }
      if (target.kind !== "light" && !this.#hasMappedAncestor(target.object, removedNodeIds)) {
        disposeObjectTree(target.object);
      }
    }

    for (const nodeId of removedNodeIds) {
      this.objects.delete(nodeId);
    }

    for (const nodeId of nextNodeIds) {
      const target = this.objects.getTarget(nodeId);
      const node = snapshot.nodes[nodeId];
      if (target && node && target.kind !== node.kind) {
        if (target.kind !== "light") {
          disposeObjectTree(target.object);
        }
        this.objects.delete(nodeId);
      }
    }
  }

  #shouldRetainTarget(snapshot: SceneSnapshot, nodeId: string, target: ReturnType<ThreeObjectMap["getTarget"]>): boolean {
    if (!target) {
      return false;
    }
    const node = snapshot.nodes[nodeId];
    if (!node || node.kind !== target.kind) {
      return false;
    }
    switch (node.kind) {
      case "object":
        return target.objectId === node.objectId && Boolean(snapshot.objects[node.objectId]);
      case "group":
        return true;
      case "light":
        return target.lightId === node.lightId && Boolean(snapshot.lights[node.lightId]);
      default:
        return assertNever(node);
    }
  }

  #hasMappedAncestor(object: Object3D, limitedToNodeIds?: Set<string>): boolean {
    let parent = object.parent;
    while (parent) {
      const nodeId = this.objects.getId(parent);
      if (nodeId && (!limitedToNodeIds || limitedToNodeIds.has(nodeId))) {
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

function assertNever(value: never): never {
  throw new Error(`Unsupported scene node: ${JSON.stringify(value)}`);
}
