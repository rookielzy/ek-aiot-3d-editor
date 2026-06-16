import { Color, type Scene } from "three";
import type { EnvironmentBackgroundSource, EnvironmentLightingSource, SceneEnvironment } from "../environment/types";
import type { Problem } from "../problems/types";
import type { SceneSnapshot } from "../snapshot/types";
import {
  EnvironmentResourceManager,
  type EnvironmentResourceManagerOptions
} from "./environment-resource-manager";
import { createEnvironmentAssetUnresolvedProblem, createEnvironmentUnsupportedSettingProblem } from "./problems";

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

    const backgroundProblems = await this.#projectBackground(snapshot, environment, token);
    if (!this.#resources.isActive(token)) {
      return [];
    }
    problems.push(...backgroundProblems);

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
  ): Promise<Problem[]> {
    const problems: Problem[] = [];
    const background = environment.background;
    applyBackgroundScalars(this.#scene, environment);

    if (background.source.kind === "flat-image" && background.blur && background.blur > 0) {
      this.#scene.backgroundBlurriness = 0;
      problems.push(createEnvironmentUnsupportedSettingProblem(
        "background.blur",
        "background",
        "Background blur does not affect flat image backgrounds."
      ));
    }

    switch (background.source.kind) {
      case "none":
        return problems;
      case "solid":
        this.#scene.background = new Color(background.source.color);
        return problems;
      case "flat-image": {
        const problem = await this.#loadBackgroundTexture(snapshot, background.source, token, "flat");
        return pushProblem(problems, problem);
      }
      case "equirectangular": {
        const problem = await this.#loadBackgroundTexture(snapshot, background.source, token, "equirectangular");
        return pushProblem(problems, problem);
      }
      case "hdr": {
        const result = await this.#resources.load({
          snapshot,
          assetId: background.source.assetId,
          kind: "hdr",
          intent: "equirectangular",
          role: "background",
          token
        });
        if (!result.ok) {
          return pushProblem(problems, result.problem);
        }
        this.#scene.background = result.texture;
        return problems;
      }
      case "cubemap": {
        const result = await this.#resources.loadCubemap({
          snapshot,
          faces: background.source.faces,
          role: "background",
          token
        });
        if (!result.ok) {
          return pushProblem(problems, result.problem);
        }
        this.#scene.background = result.texture;
        return problems;
      }
    }
  }

  async #loadBackgroundTexture(
    snapshot: SceneSnapshot,
    source: Extract<EnvironmentBackgroundSource, { assetId: string }>,
    token: number,
    intent: "flat" | "equirectangular"
  ): Promise<Problem | undefined> {
    const result = await this.#resources.load({
      snapshot,
      assetId: source.assetId,
      kind: "texture",
      intent,
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
    const source = environment.lighting.source;

    switch (source.kind) {
      case "none":
        return undefined;
      case "equirectangular":
        return await this.#loadLightingTexture(snapshot, source, token, "texture");
      case "hdr":
        return await this.#loadLightingTexture(snapshot, source, token, "hdr");
      case "cubemap": {
        if (source.faces.length === 0) {
          return createEnvironmentAssetUnresolvedProblem("missing", "environment");
        }
        const result = await this.#resources.loadCubemap({
          snapshot,
          faces: source.faces,
          role: "environment",
          token,
          pmrem: "cubemap"
        });
        if (!result.ok) {
          return result.problem;
        }
        this.#scene.environment = result.pmremTexture ?? result.texture;
        return undefined;
      }
    }
  }

  async #loadLightingTexture(
    snapshot: SceneSnapshot,
    source: Extract<EnvironmentLightingSource, { assetId: string }>,
    token: number,
    kind: "texture" | "hdr"
  ): Promise<Problem | undefined> {
    const result = await this.#resources.load({
      snapshot,
      assetId: source.assetId,
      kind,
      intent: "equirectangular",
      role: "environment",
      token,
      pmrem: "equirectangular"
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
  scene.environmentIntensity = environment.lighting.intensity;
  scene.environmentRotation.set(
    environment.lighting.rotation.x,
    environment.lighting.rotation.y,
    environment.lighting.rotation.z
  );
}

function pushProblem(problems: Problem[], problem: Problem | undefined): Problem[] {
  if (problem) {
    problems.push(problem);
  }
  return problems;
}
