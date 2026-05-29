import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Object3D,
  PointLight,
  SpotLight,
  type Light,
  type Scene
} from "three";
import type { LightDefinition, LightKind } from "../lights/types";
import { disposeObjectTree } from "./disposal";
import { applyTransform } from "./transform";

interface RuntimeLightEntry {
  kind: LightKind;
  light: Light;
  target?: Object3D;
}

export class LightProjector {
  #scene: Scene;
  #lights = new Map<string, RuntimeLightEntry>();

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
      this.#projectLight(light);
    }
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
  }

  #projectLight(definition: LightDefinition): void {
    let entry = this.#lights.get(definition.id);
    if (!entry || entry.kind !== definition.kind) {
      if (entry) {
        this.#remove(definition.id, entry);
      }
      entry = this.#create(definition);
      this.#lights.set(definition.id, entry);
      this.#scene.add(entry.light);
      if (entry.target) {
        this.#scene.add(entry.target);
      }
    }

    updateRuntimeLight(entry, definition);
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
      return { kind: definition.kind, light, target };
    }

    return { kind: definition.kind, light };
  }

  #remove(lightId: string, entry: RuntimeLightEntry): void {
    entry.target?.removeFromParent();
    disposeObjectTree(entry.light);
    this.#lights.delete(lightId);
  }
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
  entry.light.name = definition.name;
  entry.light.color.set(definition.color);
  entry.light.intensity = definition.intensity;

  switch (definition.kind) {
    case "ambient":
      return;
    case "hemisphere":
      (entry.light as HemisphereLight).groundColor.set(definition.groundColor);
      return;
    case "directional":
      applyTransform(entry.light, definition.transform);
      updateTarget(entry, definition.target);
      return;
    case "point": {
      const point = entry.light as PointLight;
      applyTransform(point, definition.transform);
      point.distance = definition.distance ?? 0;
      point.decay = definition.decay ?? 2;
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
      return;
    }
    default:
      return assertNever(definition);
  }
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
