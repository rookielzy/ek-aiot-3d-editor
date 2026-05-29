import { Color, type Scene } from "three";
import type { SceneEnvironment } from "../environment/types";
import type { Problem } from "../problems/types";
import type { SceneSnapshot } from "../snapshot/types";
import {
  EnvironmentResourceManager,
  type EnvironmentAssetKind,
  type EnvironmentResourceManagerOptions
} from "./environment-resource-manager";
import { createEnvironmentAssetUnresolvedProblem } from "./problems";

export interface EnvironmentProjectorOptions extends EnvironmentResourceManagerOptions {
  scene: Scene;
}

export class EnvironmentProjector {
  #scene: Scene;
  #resources: EnvironmentResourceManager;

  constructor(options: EnvironmentProjectorOptions) {
    this.#scene = options.scene;
    this.#resources = new EnvironmentResourceManager(options);
  }

  async project(snapshot: SceneSnapshot): Promise<Problem[]> {
    const token = this.#resources.beginProjection();
    const problems: Problem[] = [];
    const environment = snapshot.environment;

    resetSceneEnvironment(this.#scene);

    const backgroundProblem = await this.#projectBackground(snapshot, environment, token);
    if (!this.#resources.isActive(token)) {
      return [];
    }
    if (backgroundProblem) {
      problems.push(backgroundProblem);
    }

    const environmentProblem = await this.#projectEnvironment(snapshot, environment, token);
    if (!this.#resources.isActive(token)) {
      return [];
    }
    if (environmentProblem) {
      problems.push(environmentProblem);
    }

    this.#resources.releaseUnused(token);
    return problems;
  }

  dispose(): void {
    resetSceneEnvironment(this.#scene);
    this.#resources.dispose();
  }

  get resourceCount(): number {
    return this.#resources.size;
  }

  async #projectBackground(
    snapshot: SceneSnapshot,
    environment: SceneEnvironment,
    token: number
  ): Promise<Problem | undefined> {
    const background = environment.background;
    applyBackgroundScalars(this.#scene, environment);

    if (background.mode === "none") {
      return undefined;
    }

    if (background.mode === "solid") {
      this.#scene.background = new Color(background.color ?? "#000000");
      return undefined;
    }

    const result = await this.#resources.load({
      snapshot,
      assetId: background.assetId,
      kind: background.mode,
      role: "background",
      token
    });
    if (!result.ok) {
      return result.problem;
    }

    this.#scene.background = result.texture;
    return undefined;
  }

  async #projectEnvironment(
    snapshot: SceneSnapshot,
    environment: SceneEnvironment,
    token: number
  ): Promise<Problem | undefined> {
    applyEnvironmentScalars(this.#scene, environment);

    if (environment.mode === "none" || environment.mode === "solid") {
      return undefined;
    }

    const assetId = environment.environment.assetId;
    if (!assetId) {
      return createEnvironmentAssetUnresolvedProblem("missing", "environment");
    }

    const result = await this.#resources.load({
      snapshot,
      assetId,
      kind: environment.mode as EnvironmentAssetKind,
      role: "environment",
      token,
      pmrem: true
    });
    if (!result.ok) {
      return result.problem;
    }

    this.#scene.environment = result.pmremTexture ?? result.texture;
    return undefined;
  }
}

function resetSceneEnvironment(scene: Scene): void {
  scene.background = null;
  scene.environment = null;
  scene.backgroundIntensity = 1;
  scene.backgroundBlurriness = 0;
  scene.backgroundRotation.set(0, 0, 0);
  scene.environmentIntensity = 1;
  scene.environmentRotation.set(0, 0, 0);
}

function applyBackgroundScalars(scene: Scene, environment: SceneEnvironment): void {
  const background = environment.background;
  scene.backgroundIntensity = background.intensity ?? 1;
  scene.backgroundBlurriness = background.blur ?? 0;
  if (background.rotation) {
    scene.backgroundRotation.set(background.rotation.x, background.rotation.y, background.rotation.z);
  }
}

function applyEnvironmentScalars(scene: Scene, environment: SceneEnvironment): void {
  scene.environmentIntensity = environment.environment.intensity;
  scene.environmentRotation.set(
    environment.environment.rotation.x,
    environment.environment.rotation.y,
    environment.environment.rotation.z
  );
}
