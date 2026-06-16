import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  SphereGeometry,
  SpotLight,
  type Light,
  type Scene
} from "three";
import type {
  DirectionalLightDefinition,
  DirectionalLightShadowSettings,
  LightDefinition,
  LightKind,
  PointLightDefinition,
  PointLightShadowSettings,
  SpotLightDefinition,
  SpotLightShadowSettings
} from "../lights/types";
import { disposeObjectTree } from "./disposal";
import { applyTransform } from "./transform";

interface RuntimeLightEntry {
  kind: LightKind;
  light: Light;
  definition: LightDefinition;
  target?: Object3D;
  pickProxy?: Mesh;
}

export interface ProjectedRuntimeLight {
  light: Light;
  target?: Object3D;
  pickProxy?: Object3D;
}

export interface RuntimeLightShadowEntry {
  lightId: string;
  kind: "directional" | "point" | "spot";
  enabled: boolean;
  mapSize: {
    width: number;
    height: number;
  };
  faces: number;
  texelCost: number;
  camera: {
    near: number;
    far: number;
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };
}

export interface RuntimeLightShadowSummary {
  enabled: boolean;
  entries: RuntimeLightShadowEntry[];
  totalTexelCost: number;
}

const EMPTY_SHADOW_SUMMARY: RuntimeLightShadowSummary = {
  enabled: false,
  entries: [],
  totalTexelCost: 0
};

export class LightProjector {
  #scene: Scene;
  #lights = new Map<string, RuntimeLightEntry>();
  #shadowSummary: RuntimeLightShadowSummary = EMPTY_SHADOW_SUMMARY;

  constructor(scene: Scene) {
    this.#scene = scene;
  }

  project(lights: Record<string, LightDefinition>): void {
    const nextIds = new Set(Object.keys(lights));
    for (const [lightId, entry] of [...this.#lights]) {
      if (!nextIds.has(lightId)) {
        this.#remove(lightId, entry);
      }
    }

    for (const light of Object.values(lights)) {
      this.projectLight(light, this.#scene);
    }
    this.#shadowSummary = createShadowSummary(Object.values(lights));
  }

  projectLight(definition: LightDefinition, parent?: Object3D): ProjectedRuntimeLight {
    const entry = this.#projectLight(definition);
    const lightParent = parent ?? this.#scene;
    if (entry.light.parent !== lightParent) {
      lightParent.add(entry.light);
    }
    if (entry.target && entry.target.parent !== this.#scene) {
      this.#scene.add(entry.target);
    }
    return {
      light: entry.light,
      ...(entry.target ? { target: entry.target } : {}),
      ...(entry.pickProxy ? { pickProxy: entry.pickProxy } : {})
    };
  }

  release(activeLightIds: Set<string>): void {
    for (const [lightId, entry] of [...this.#lights]) {
      if (!activeLightIds.has(lightId)) {
        this.#remove(lightId, entry);
      }
    }
    this.#shadowSummary = createShadowSummary([...activeLightIds]
      .map((lightId) => this.#lights.get(lightId))
      .filter((entry): entry is RuntimeLightEntry => Boolean(entry))
      .map((entry) => entry.definition));
  }

  get shadowSummary(): RuntimeLightShadowSummary {
    return {
      enabled: this.#shadowSummary.enabled,
      entries: this.#shadowSummary.entries.map((entry) => ({
        ...entry,
        mapSize: { ...entry.mapSize },
        camera: { ...entry.camera }
      })),
      totalTexelCost: this.#shadowSummary.totalTexelCost
    };
  }

  get(lightId: string): Light | undefined {
    return this.#lights.get(lightId)?.light;
  }

  getTarget(lightId: string): Object3D | undefined {
    return this.#lights.get(lightId)?.target;
  }

  dispose(): void {
    for (const [lightId, entry] of [...this.#lights]) {
      this.#remove(lightId, entry);
    }
    this.#shadowSummary = EMPTY_SHADOW_SUMMARY;
  }

  #projectLight(definition: LightDefinition): RuntimeLightEntry {
    let entry = this.#lights.get(definition.id);
    if (!entry || entry.kind !== definition.kind) {
      if (entry) {
        this.#remove(definition.id, entry);
      }
      entry = this.#create(definition);
      this.#lights.set(definition.id, entry);
    }

    updateRuntimeLight(entry, definition);
    return entry;
  }

  #create(definition: LightDefinition): RuntimeLightEntry {
    const light = createLight(definition);
    light.name = definition.name;
    light.userData.runtimeLightId = definition.id;

    if (definition.kind === "directional" || definition.kind === "spot") {
      const target = new Object3D();
      target.name = `${definition.name} target`;
      target.userData.runtimeLightTargetId = definition.id;
      (light as DirectionalLight | SpotLight).target = target;
      const pickProxy = createLightPickProxy(definition.id);
      light.add(pickProxy);
      return { kind: definition.kind, definition, light, target, pickProxy };
    }

    if (definition.kind === "point") {
      const pickProxy = createLightPickProxy(definition.id);
      light.add(pickProxy);
      return { kind: definition.kind, definition, light, pickProxy };
    }

    return { kind: definition.kind, definition, light };
  }

  #remove(lightId: string, entry: RuntimeLightEntry): void {
    entry.target?.removeFromParent();
    disposeObjectTree(entry.light);
    this.#lights.delete(lightId);
  }
}

function createLightPickProxy(lightId: string): Mesh {
  const proxy = new Mesh(
    new SphereGeometry(0.25, 12, 8),
    new MeshBasicMaterial({
      opacity: 0,
      transparent: true,
      depthWrite: false
    })
  );
  proxy.name = `Light pick proxy ${lightId}`;
  proxy.userData.runtimeOnly = true;
  proxy.userData.runtimeLightPickProxyId = lightId;
  return proxy;
}

function createLight(definition: LightDefinition): Light {
  switch (definition.kind) {
    case "ambient":
      return new AmbientLight(definition.color, definition.intensity);
    case "directional":
      return new DirectionalLight(definition.color, definition.intensity);
    case "hemisphere":
      return new HemisphereLight(definition.color, definition.groundColor, definition.intensity);
    case "point":
      return new PointLight(definition.color, definition.intensity, definition.distance ?? 0, definition.decay ?? 2);
    case "spot":
      return new SpotLight(
        definition.color,
        definition.intensity,
        definition.distance ?? 0,
        definition.angle,
        definition.penumbra ?? 0,
        definition.decay ?? 2
      );
    default:
      return assertNever(definition);
  }
}

function updateRuntimeLight(entry: RuntimeLightEntry, definition: LightDefinition): void {
  entry.definition = definition;
  entry.light.name = definition.name;
  entry.light.color.set(definition.color);
  entry.light.intensity = definition.intensity;

  switch (definition.kind) {
    case "ambient":
      entry.light.castShadow = false;
      return;
    case "hemisphere":
      (entry.light as HemisphereLight).groundColor.set(definition.groundColor);
      entry.light.castShadow = false;
      return;
    case "directional":
      applyTransform(entry.light, definition.transform);
      updateTarget(entry, definition.target);
      updateDirectionalShadow(entry.light as DirectionalLight, definition);
      return;
    case "point": {
      const point = entry.light as PointLight;
      applyTransform(point, definition.transform);
      point.distance = definition.distance ?? 0;
      point.decay = definition.decay ?? 2;
      updatePointShadow(point, definition);
      return;
    }
    case "spot": {
      const spot = entry.light as SpotLight;
      applyTransform(spot, definition.transform);
      spot.distance = definition.distance ?? 0;
      spot.angle = definition.angle;
      spot.penumbra = definition.penumbra ?? 0;
      spot.decay = definition.decay ?? 2;
      updateTarget(entry, definition.target);
      updateSpotShadow(spot, definition);
      return;
    }
    default:
      return assertNever(definition);
  }
}

function updateDirectionalShadow(light: DirectionalLight, definition: DirectionalLightDefinition): void {
  updateBaseShadow(light, definition.shadow);
  const camera = light.shadow.camera;
  if (camera instanceof OrthographicCamera) {
    camera.left = definition.shadow.camera.left;
    camera.right = definition.shadow.camera.right;
    camera.top = definition.shadow.camera.top;
    camera.bottom = definition.shadow.camera.bottom;
    camera.near = definition.shadow.camera.near;
    camera.far = definition.shadow.camera.far;
    camera.updateProjectionMatrix();
  }
}

function updatePointShadow(light: PointLight, definition: PointLightDefinition): void {
  updateBaseShadow(light, definition.shadow);
  const camera = light.shadow.camera;
  if (camera instanceof PerspectiveCamera) {
    camera.near = definition.shadow.camera.near;
    camera.far = definition.shadow.camera.far;
    camera.updateProjectionMatrix();
  }
}

function updateSpotShadow(light: SpotLight, definition: SpotLightDefinition): void {
  updateBaseShadow(light, definition.shadow);
  const camera = light.shadow.camera;
  if (camera instanceof PerspectiveCamera) {
    camera.near = definition.shadow.camera.near;
    camera.far = definition.shadow.camera.far;
    camera.updateProjectionMatrix();
  }
}

function updateBaseShadow(
  light: DirectionalLight | PointLight | SpotLight,
  shadow: DirectionalLightShadowSettings | PointLightShadowSettings | SpotLightShadowSettings
): void {
  light.castShadow = shadow.enabled;
  light.shadow.mapSize.set(shadow.mapSize.width, shadow.mapSize.height);
  light.shadow.bias = shadow.bias;
  light.shadow.normalBias = shadow.normalBias;
  light.shadow.radius = shadow.radius;
  light.shadow.camera.near = shadow.camera.near;
  light.shadow.camera.far = shadow.camera.far;
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.needsUpdate = true;
}

function updateTarget(entry: RuntimeLightEntry, target: [number, number, number]): void {
  if (!entry.target) {
    return;
  }
  entry.target.position.set(...target);
  entry.target.updateMatrixWorld(true);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported light definition: ${JSON.stringify(value)}`);
}

function createShadowSummary(lights: LightDefinition[]): RuntimeLightShadowSummary {
  const entries = lights
    .filter(isShadowCapableLight)
    .map((light): RuntimeLightShadowEntry => {
      const faces = light.kind === "point" ? 6 : 1;
      const texelCost = light.shadow.mapSize.width * light.shadow.mapSize.height * faces;
      return {
        lightId: light.id,
        kind: light.kind,
        enabled: light.shadow.enabled,
        mapSize: { ...light.shadow.mapSize },
        faces,
        texelCost,
        camera: { ...light.shadow.camera }
      };
    });
  const enabledEntries = entries.filter((entry) => entry.enabled);
  return {
    enabled: enabledEntries.length > 0,
    entries,
    totalTexelCost: enabledEntries.reduce((total, entry) => total + entry.texelCost, 0)
  };
}

function isShadowCapableLight(light: LightDefinition): light is DirectionalLightDefinition | PointLightDefinition | SpotLightDefinition {
  return light.kind === "directional" || light.kind === "point" || light.kind === "spot";
}
