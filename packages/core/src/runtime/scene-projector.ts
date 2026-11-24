import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Scene } from "three";
import { getGlbImportManifestFromMetadata, glbImportDiagnosticToProblem, normalizeGltfLoaderOutput, type GlbImportDiagnostic, type GlbImportManifest } from "../assets/import-pipeline";
import { AssetResolverBridge } from "../assets/resolver";
import { createMissingAssetProblem, type Problem } from "../assets/problems";
import type { ResolvedAsset } from "../assets/types";
import type { AssetReference } from "../snapshot/types";
import type { SceneCameraNode, SceneImportedGlbNode, SceneLightNode, SceneNode, SceneObject, SceneObjectNode, SceneSnapshot } from "../snapshot/types";
import { cloneTransform } from "../snapshot/transforms";
import { RuntimeDataDisplayCard } from "./data-display-card";
import { EnvironmentProjector } from "./environment-projector";
import type { GltfLoaderAdapter } from "./gltf-loader-adapter";
import { GlbImportError, PlaceholderGltfLoaderAdapter } from "./gltf-loader-adapter";
import { resolveImportedGlbTargets, type RuntimeImportedTargetMatch } from "./imported-target-resolver";
import { LightProjector, type RuntimeLightShadowSummary } from "./light-projector";
import { deriveLightingDiagnostics } from "./lighting-diagnostics";
import { MaterialProjector } from "./material-projector";
import type { RuntimePmremAdapter } from "./pmrem-adapter";
import { disposeObjectTree } from "./disposal";
import { applyTransform, readTransform } from "./transform";
import { ThreeObjectMap } from "./three-object-map";
import type { RuntimeTextureLoaderAdapter } from "./texture-loader-adapter";
import {
  createImportedTargetAmbiguousProblem,
  createImportedTargetMissingProblem,
  createImportedTargetNonTransformableProblem,
  createImportedTargetUnresolvedProblem
} from "./problems";

export interface SceneProjectorOptions {
  scene?: Scene;
  resolver?: AssetResolverBridge;
  loader?: GltfLoaderAdapter;
  textureLoader?: RuntimeTextureLoaderAdapter;
  hdrLoader?: RuntimeTextureLoaderAdapter;
  pmrem?: RuntimePmremAdapter;
}

interface RuntimeAssetResolution {
  resolved: ResolvedAsset | null;
  signature: string;
  error?: unknown;
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
  #loadedManifests = new Map<string, GlbImportManifest>();
  #runtimeObjectAssetSignatures = new Map<string, string>();
  #projectionGeneration = 0;
  #disposed = false;
  #rendererShadowMapAvailable = true;
  #dataDisplayValues: ReadonlyMap<string, string> = new Map();
  #dataDisplayPixelScale = 1;

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

  get shadowSummary(): RuntimeLightShadowSummary {
    return this.#lights.shadowSummary;
  }

  setRendererShadowMapAvailable(available: boolean): void {
    this.#rendererShadowMapAvailable = available;
  }

  setDataDisplayValues(values: ReadonlyMap<string, string>): void {
    this.#dataDisplayValues = values;
    for (const [id, object] of this.objects.nodeEntries()) {
      if (object instanceof RuntimeDataDisplayCard) object.setValue(values.get(id));
    }
  }

  resizeDataDisplays(pixelScale: number): void {
    if (pixelScale === this.#dataDisplayPixelScale) return;
    this.#dataDisplayPixelScale = pixelScale;
    for (const [, object] of this.objects.nodeEntries()) {
      if (object instanceof RuntimeDataDisplayCard) object.resize(pixelScale);
    }
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
    this.#syncMeshShadowParticipation(this.#lights.shadowSummary.enabled);

    const materialProblems = await this.#materials.project(snapshot, this.objects.targetEntries());
    if (!this.#isActive(generation)) {
      return;
    }
    this.#appendProblems(materialProblems);

    const environmentProblems = await this.#environment.project(snapshot);
    if (!this.#isActive(generation)) {
      return;
    }
    this.#appendProblems(environmentProblems);

    this.#appendProblems(deriveLightingDiagnostics(snapshot, this.#lights.shadowSummary, {
      rendererShadowMapAvailable: this.#rendererShadowMapAvailable
    }));
  }

  getLight(lightId: string): Object3D | undefined {
    return this.#lights.get(lightId);
  }

  getLightTarget(lightId: string): Object3D | undefined {
    return this.#lights.getTarget(lightId);
  }

  #syncMeshShadowParticipation(enabled: boolean): void {
    const roots = new Set<Object3D>();
    for (const [, target] of this.objects.targetEntries()) {
      if (target.kind === "object" || target.kind === "imported") {
        roots.add(target.object);
      }
    }

    for (const root of roots) {
      root.traverse((object) => {
        if (!(object instanceof Mesh) || object.userData.runtimeOnly || object.userData.problem) {
          return;
        }
        object.castShadow = enabled;
        object.receiveShadow = enabled;
      });
    }
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
      case "data-display": {
        const previous = this.objects.get(node.id);
        const card = previous instanceof RuntimeDataDisplayCard ? previous : new RuntimeDataDisplayCard();
        card.name = node.name;
        card.position.fromArray(node.transform.position);
        card.sync(node, this.#dataDisplayValues.get(node.id));
        card.resize(this.#dataDisplayPixelScale);
        this.objects.set(node.id, card, {
          kind: node.kind,
          selected: snapshot.selection.nodeIds.includes(node.id),
          primarySelected: snapshot.selection.nodeId === node.id
        });
        runtimeObject = card;
        break;
      }
      case "light":
        runtimeObject = this.#projectLightNode(node, snapshot, parent, activeLightIds);
        break;
      case "camera":
        runtimeObject = this.#projectCameraNode(node, snapshot);
        break;
      case "imported":
        runtimeObject = this.#projectImportedNode(node, snapshot);
        break;
      default:
        return assertNever(node);
    }

    if (!this.#isActive(generation)) {
      return null;
    }
    if (!runtimeObject) {
      if (node.kind === "imported") {
        for (const childId of node.children) {
          await this.#projectNode(childId, snapshot, parent, generation, activeLightIds);
          if (!this.#isActive(generation)) {
            return null;
          }
        }
      }
      return null;
    }
    if (node.kind !== "imported" && runtimeObject.parent !== parent) {
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

    const assetResolution = await this.#resolveRuntimeAsset(object);
    if (!this.#isActive(generation)) {
      return null;
    }

    let runtimeObject: Object3D | null | undefined = this.objects.get(node.id);
    const shouldReload = Boolean(
      runtimeObject &&
      !runtimeObject.userData.problem &&
      this.#runtimeObjectAssetSignatures.get(object.id) !== assetResolution.signature
    );
    if (runtimeObject && (runtimeObject.userData.problem || shouldReload)) {
      const previousRuntimeObject = runtimeObject;
      const replacement = await this.#createRuntimeObject(object, generation, assetResolution);
      if (!this.#isActive(generation)) {
        replacement && disposeObjectTree(replacement.object);
        return null;
      }
      if (!replacement) {
        return null;
      }
      this.#releaseImportedTargetsForOwner(object.id, new Set());
      this.#setLoadedManifest(object, replacement.manifest);
      this.#runtimeObjectAssetSignatures.set(object.id, replacement.assetSignature);
      this.objects.set(node.id, replacement.object, {
        kind: "object",
        objectId: object.id,
        transformable: true,
        pickable: true,
        selected: snapshot.selection.nodeIds.includes(node.id),
        primarySelected: snapshot.selection.nodeId === node.id
      });
      if (previousRuntimeObject.parent) {
        previousRuntimeObject.parent.add(replacement.object);
      } else {
        this.scene.add(replacement.object);
      }
      disposeObjectTree(previousRuntimeObject);
      runtimeObject = replacement.object;
    } else if (!runtimeObject) {
      const created = await this.#createRuntimeObject(object, generation, assetResolution);
      if (!this.#isActive(generation)) {
        created && disposeObjectTree(created.object);
        return null;
      }
      if (!created) {
        return null;
      }
      this.#setLoadedManifest(object, created.manifest);
      this.#runtimeObjectAssetSignatures.set(object.id, created.assetSignature);
      runtimeObject = created.object;
      this.objects.set(node.id, runtimeObject, {
        kind: "object",
        objectId: object.id,
        transformable: true,
        pickable: true,
        selected: snapshot.selection.nodeIds.includes(node.id),
        primarySelected: snapshot.selection.nodeId === node.id
      });
    } else {
      this.objects.set(node.id, runtimeObject, {
        kind: "object",
        objectId: object.id,
        transformable: true,
        pickable: true,
        selected: snapshot.selection.nodeIds.includes(node.id),
        primarySelected: snapshot.selection.nodeId === node.id
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

    this.#projectImportedTargetsForOwner(object, snapshot, runtimeObject);

    return runtimeObject;
  }

  #projectGroupNode(node: SceneNode & { kind: "group" }, snapshot: SceneSnapshot): Object3D {
    let runtimeObject = this.objects.get(node.id);
    if (!runtimeObject) {
      runtimeObject = new Group();
      this.objects.set(node.id, runtimeObject, {
        kind: "group",
        transformable: true,
        pickable: true,
        selected: snapshot.selection.nodeIds.includes(node.id),
        primarySelected: snapshot.selection.nodeId === node.id
      });
    } else {
      this.objects.set(node.id, runtimeObject, {
        kind: "group",
        transformable: true,
        pickable: true,
        selected: snapshot.selection.nodeIds.includes(node.id),
        primarySelected: snapshot.selection.nodeId === node.id
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

  #projectImportedNode(node: SceneImportedGlbNode, snapshot: SceneSnapshot): Object3D | null {
    const target = this.objects.getTarget(node.id);
    if (!target || target.kind !== "imported") {
      return null;
    }

    const runtimeObject = target.object;
    runtimeObject.name = node.name;
    runtimeObject.userData = {
      ...runtimeObject.userData,
      sceneNodeId: node.id,
      nodeKind: node.kind,
      ownerObjectId: node.ownerObjectId,
      importKey: node.importKey,
      importedTargetMatchStatus: target.matchStatus,
      importedTargetTransformable: target.transformable,
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
      pickable: true,
      selected: snapshot.selection.nodeIds.includes(node.id),
      primarySelected: snapshot.selection.nodeId === node.id
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
      this.objects.markRuntimeOnly(projected.target);
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
      this.objects.markRuntimeOnly(projected.pickProxy);
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

  #projectCameraNode(node: SceneCameraNode, snapshot: SceneSnapshot): Object3D | null {
    const camera = snapshot.cameras[node.cameraId];
    if (!camera) {
      return null;
    }

    let runtimeObject: PerspectiveCamera;
    const previousRuntimeObject = this.objects.get(node.id);
    if (previousRuntimeObject && !(previousRuntimeObject instanceof PerspectiveCamera)) {
      disposeObjectTree(previousRuntimeObject);
      this.objects.delete(node.id);
    }
    if (!(previousRuntimeObject instanceof PerspectiveCamera)) {
      runtimeObject = new PerspectiveCamera(camera.projection.fov, 1, camera.near, camera.far);
      this.objects.set(node.id, runtimeObject, {
        kind: "camera",
        cameraId: camera.id,
        transformable: true,
        pickable: true,
        selected: snapshot.selection.nodeIds.includes(node.id),
        primarySelected: snapshot.selection.nodeId === node.id
      });
    } else {
      runtimeObject = previousRuntimeObject;
      this.objects.set(node.id, runtimeObject, {
        kind: "camera",
        cameraId: camera.id,
        transformable: true,
        pickable: true,
        selected: snapshot.selection.nodeIds.includes(node.id),
        primarySelected: snapshot.selection.nodeId === node.id
      });
    }

    runtimeObject.name = node.name;
    runtimeObject.fov = camera.projection.fov;
    runtimeObject.near = camera.near;
    runtimeObject.far = camera.far;
    runtimeObject.position.set(...node.transform.position);
    runtimeObject.rotation.set(...node.transform.rotation);
    runtimeObject.scale.set(...node.transform.scale);
    runtimeObject.lookAt(...camera.target);
    runtimeObject.updateProjectionMatrix();
    runtimeObject.updateMatrixWorld(true);
    runtimeObject.userData = {
      ...runtimeObject.userData,
      sceneNodeId: node.id,
      nodeKind: node.kind,
      authoredCameraId: camera.id,
      selected: snapshot.selection.nodeIds.includes(node.id),
      primarySelected: snapshot.selection.nodeId === node.id
    };

    return runtimeObject;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    this.#projectionGeneration += 1;
    const roots = [...new Set([...this.objects.targetEntries()]
      .filter(([, target]) => target.kind !== "light")
      .map(([, target]) => target.object)
      .filter((object) => !this.#hasMappedAncestor(object)))];

    this.#materials.dispose();
    for (const object of roots) {
      disposeObjectTree(object);
    }
    this.objects.clear();
    this.#environment.dispose();
    this.#lights.dispose();
    this.#problems = [];
    this.#loadTokens.clear();
    this.#loadedManifests.clear();
    this.#runtimeObjectAssetSignatures.clear();
  }

  async #createRuntimeObject(
    object: SceneObject,
    generation: number,
    resolution?: RuntimeAssetResolution
  ): Promise<{ object: Object3D; manifest?: GlbImportManifest; assetSignature: string } | null> {
    if (!this.#isActive(generation)) {
      return null;
    }

    const token = (this.#loadTokens.get(object.id) ?? 0) + 1;
    this.#loadTokens.set(object.id, token);
    resolution = resolution ?? await this.#resolveRuntimeAsset(object);
    if (!this.#isActive(generation)) {
      return null;
    }
    if (resolution.error) {
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
        message: resolution.error instanceof Error ? resolution.error.message : String(resolution.error),
        display: {
          title: "Asset failed to resolve"
        }
      });
      this.#loadedManifests.delete(object.id);
      return { object: createProblemPlaceholder(object.id), assetSignature: resolution.signature };
    }

    if (!resolution.resolved) {
      this.#addProblem(createMissingAssetProblem(object.asset.id, object.id));
      this.#loadedManifests.delete(object.id);
      return { object: createProblemPlaceholder(object.id), assetSignature: resolution.signature };
    }

    try {
      const loadResult = this.#loader.analyze
        ? await this.#loader.analyze(resolution.resolved)
        : normalizeGltfLoaderOutput(await this.#loader.load(resolution.resolved));
      if (!this.#isActive(generation) || this.#loadTokens.get(object.id) !== token) {
        disposeObjectTree(loadResult.scene);
        return null;
      }
      for (const diagnostic of mergeGlbDiagnostics(loadResult.diagnostics ?? [], loadResult.manifest?.diagnostics ?? [])) {
        this.#addProblem(glbImportDiagnosticToProblem(diagnostic, object.asset, object.id));
      }
      return {
        object: loadResult.scene,
        ...(loadResult.manifest ? { manifest: loadResult.manifest } : {}),
        assetSignature: resolution.signature
      };
    } catch (error) {
      if (!this.#isActive(generation)) {
        return null;
      }
      if (error instanceof GlbImportError) {
        for (const diagnostic of error.diagnostics) {
          this.#addProblem(glbImportDiagnosticToProblem(diagnostic, object.asset, object.id));
        }
        this.#setLoadedManifest(object, error.manifest);
        return {
          object: createProblemPlaceholder(object.id),
          ...(error.manifest ? { manifest: error.manifest } : {}),
          assetSignature: resolution.signature
        };
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
      this.#loadedManifests.delete(object.id);
      return { object: createProblemPlaceholder(object.id), assetSignature: resolution.signature };
    }
  }

  async #resolveRuntimeAsset(object: SceneObject): Promise<RuntimeAssetResolution> {
    try {
      const resolved = await this.#resolver.resolve(object.asset);
      return {
        resolved,
        signature: createRuntimeAssetSignature(object.asset, resolved)
      };
    } catch (error) {
      return {
        resolved: null,
        error,
        signature: createRuntimeAssetSignature(object.asset, null, error)
      };
    }
  }

  #setLoadedManifest(object: SceneObject, manifest: GlbImportManifest | undefined): void {
    if (manifest) {
      this.#loadedManifests.set(object.id, manifest);
      return;
    }
    const storedManifest = getGlbImportManifestFromMetadata(object.asset.metadata);
    if (storedManifest) {
      this.#loadedManifests.set(object.id, storedManifest);
      return;
    }
    this.#loadedManifests.delete(object.id);
  }

  #projectImportedTargetsForOwner(object: SceneObject, snapshot: SceneSnapshot, ownerRoot: Object3D): void {
    const importedNodes = Object.values(snapshot.nodes)
      .filter((node): node is SceneImportedGlbNode => node.kind === "imported" && node.ownerObjectId === object.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (importedNodes.length === 0 || ownerRoot.userData.problem) {
      this.#releaseImportedTargetsForOwner(object.id, new Set());
      return;
    }

    const matches = resolveImportedGlbTargets({
      ownerObjectId: object.id,
      ownerRoot,
      importedNodes,
      manifest: this.#loadedManifests.get(object.id) ?? getGlbImportManifestFromMetadata(object.asset.metadata)
    });
    const activeMatches = matches.filter((match) => match.object && match.status !== "missing" && match.status !== "ambiguous");
    const matchedNodeIds = new Set(activeMatches.map((match) => match.node.id));
    this.#releaseImportedTargetsForOwner(object.id, matchedNodeIds);

    for (const match of matches) {
      if (match.node.remap?.status === "unresolved") {
        this.#addProblem(createImportedTargetUnresolvedProblem(match.node, object.asset.id));
      }
      if (!match.object || match.status === "missing") {
        if (match.node.remap?.status !== "unresolved") {
          this.#addProblem(createImportedTargetMissingProblem(match));
        }
        continue;
      }
      if (match.status === "ambiguous") {
        this.#addProblem(createImportedTargetAmbiguousProblem(match));
        continue;
      }

      // Scene targets can alias the owner root. Its transform belongs to the
      // authored object, not to an imported descendant's cached GLB base pose.
      if (match.object !== ownerRoot) {
        const baseTransform = this.#baseTransformForMatch(match);
        if (match.transformable && match.node.transform) {
          applyTransform(match.object, match.node.transform);
        } else {
          applyTransform(match.object, baseTransform);
        }
      }
      if (!match.transformable) {
        this.#addProblem(createImportedTargetNonTransformableProblem(match));
      }

      this.objects.set(match.node.id, match.object, {
        kind: "imported",
        ownerObjectId: match.ownerObjectId,
        importKey: match.importKey,
        source: match.source,
        matchStatus: match.status,
        aliasNodeIds: match.aliasNodeIds,
        pickPriority: match.pickPriority,
        transformable: match.transformable,
        pickable: match.pickable,
        selected: snapshot.selection.nodeIds.includes(match.node.id),
        primarySelected: snapshot.selection.nodeId === match.node.id
      });
      match.object.userData = {
        ...match.object.userData,
        sceneNodeId: match.node.id,
        nodeKind: "imported",
        ownerObjectId: match.ownerObjectId,
        importKey: match.importKey,
        importedTargetMatchStatus: match.status,
        importedTargetTransformable: match.transformable,
        selected: snapshot.selection.nodeIds.includes(match.node.id),
        primarySelected: snapshot.selection.nodeId === match.node.id
      };
    }
  }

  #baseTransformForMatch(match: RuntimeImportedTargetMatch) {
    const object = match.object;
    if (!object) {
      throw new Error(`Imported target ${match.node.id} does not have a runtime object.`);
    }
    const previousTarget = this.objects.getTarget(match.node.id);
    if (previousTarget && previousTarget.object === object) {
      const previousBase = object.userData.importedTargetBaseTransform;
      if (isRuntimeTransform(previousBase)) {
        return cloneTransform(previousBase);
      }
    }
    const baseTransform = cloneTransform(match.baseTransform ?? readTransform(object));
    object.userData.importedTargetBaseTransform = cloneTransform(baseTransform);
    return baseTransform;
  }

  #releaseImportedTargetsForOwner(ownerObjectId: string, activeNodeIds: ReadonlySet<string>): void {
    for (const [nodeId, target] of [...this.objects.targetEntries()]) {
      if (target.kind === "imported" && target.ownerObjectId === ownerObjectId && !activeNodeIds.has(nodeId)) {
        this.#releaseImportedTarget(nodeId);
      }
    }
  }

  #releaseImportedTarget(nodeId: string): void {
    const target = this.objects.getTarget(nodeId);
    if (target?.kind === "imported") {
      const ownerRoot = target.ownerObjectId ? this.objects.getObject(target.ownerObjectId) : undefined;
      if (target.object !== ownerRoot) {
        restoreImportedTargetBaseTransform(target.object);
      }
    }
    this.objects.delete(nodeId);
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
      if (target.kind !== "light" && target.kind !== "imported" && !this.#hasMappedAncestor(target.object, removedNodeIds)) {
        disposeObjectTree(target.object);
      }
    }

    for (const nodeId of removedNodeIds) {
      const target = this.objects.getTarget(nodeId);
      if (target?.kind === "imported") {
        this.#releaseImportedTarget(nodeId);
        continue;
      }
      if (target?.kind === "object" && target.objectId) {
        this.#loadedManifests.delete(target.objectId);
        this.#runtimeObjectAssetSignatures.delete(target.objectId);
      }
      this.objects.delete(nodeId);
    }

    for (const nodeId of nextNodeIds) {
      const target = this.objects.getTarget(nodeId);
      const node = snapshot.nodes[nodeId];
      if (target && node && target.kind !== node.kind) {
        if (target.kind === "imported") {
          this.#releaseImportedTarget(nodeId);
          continue;
        }
        if (target.kind === "object" && target.objectId) {
          this.#loadedManifests.delete(target.objectId);
          this.#runtimeObjectAssetSignatures.delete(target.objectId);
        }
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
      case "data-display":
        return true;
      case "light":
        return target.lightId === node.lightId && Boolean(snapshot.lights[node.lightId]);
      case "camera":
        return target.cameraId === node.cameraId && Boolean(snapshot.cameras[node.cameraId]);
      case "imported":
        return target.kind === "imported" && Boolean(snapshot.objects[node.ownerObjectId]);
      default:
        return assertNever(node);
    }
  }

  #hasMappedAncestor(object: Object3D, limitedToNodeIds?: Set<string>): boolean {
    let parent = object.parent;
    while (parent) {
      for (const nodeId of this.objects.getLinkedNodeIds(parent)) {
        if (!limitedToNodeIds || limitedToNodeIds.has(nodeId)) {
          return true;
        }
      }
      parent = parent.parent;
    }
    return false;
  }
}

function isRuntimeTransform(value: unknown): value is ReturnType<typeof readTransform> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const transform = value as Partial<ReturnType<typeof readTransform>>;
  return isVector3(transform.position) && isVector3(transform.rotation) && isVector3(transform.scale);
}

function isVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function restoreImportedTargetBaseTransform(object: Object3D): void {
  const baseTransform = object.userData.importedTargetBaseTransform;
  if (isRuntimeTransform(baseTransform)) {
    applyTransform(object, baseTransform);
  }
  delete object.userData.importedTargetBaseTransform;
}

function createRuntimeAssetSignature(asset: AssetReference, resolved: ResolvedAsset | null, error?: unknown): string {
  return JSON.stringify({
    asset: {
      id: asset.id,
      kind: asset.kind,
      label: asset.label ?? null,
      metadata: asset.metadata ?? null
    },
    resolved: resolved
      ? {
          uri: resolved.uri,
          mimeType: resolved.mimeType ?? null,
          byteSize: numberMetadata(resolved.metadata, "byteSize"),
          checksum: stringMetadata(resolved.metadata, "checksum")
        }
      : null,
    error: error ? error instanceof Error ? error.message : String(error) : null
  });
}

function stringMetadata(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function numberMetadata(metadata: Record<string, unknown> | undefined, key: string): number | null {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mergeGlbDiagnostics(
  left: readonly GlbImportDiagnostic[],
  right: readonly GlbImportDiagnostic[]
): GlbImportDiagnostic[] {
  const diagnostics = new Map<string, GlbImportDiagnostic>();
  for (const diagnostic of [...left, ...right]) {
    diagnostics.set(diagnostic.id, diagnostic);
  }
  return [...diagnostics.values()].sort((a, b) => a.id.localeCompare(b.id));
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
