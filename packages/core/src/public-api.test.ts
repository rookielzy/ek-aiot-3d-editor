import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createEditor,
  createEmptySnapshot,
  validateSceneSnapshot,
  type LightDefinition,
  type Problem,
  type SceneEnvironment,
  type SetMaterialCommand,
  type AddLightCommand,
  type AuthoredProblemState,
  type MaterialState,
  type ProblemTarget,
  type RegisterAssetCommand,
  type RemoveLightCommand,
  type SetEnvironmentCommand,
  type TextureSlot,
  type UpdateLightCommand
} from "./index";

describe("core public API", () => {
  it("exports the editor creation and snapshot contracts from the package root", () => {
    const editor = createEditor();

    expect(editor.getSnapshot()).toEqual(createEmptySnapshot(editor.getSnapshot().scene.id));
    expect(validateSceneSnapshot(editor.getSnapshot()).ok).toBe(true);

    editor.dispose();
  });

  it("keeps internal runtime modules out of package exports", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const packageJson = JSON.parse(readFileSync(resolve(here, "../package.json"), "utf8")) as {
      exports: Record<string, unknown>;
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    expect(Object.keys(packageJson.exports)).toEqual(["."]);
    expect(packageJson.dependencies).toHaveProperty("three");
    expect(packageJson.peerDependencies ?? {}).not.toHaveProperty("vue");
    expect(packageJson.peerDependencies ?? {}).not.toHaveProperty("react");
  });

  it("does not re-export internal runtime projectors or resource seams", async () => {
    const publicApi = await import("./index");

    expect(publicApi).not.toHaveProperty("EnvironmentProjector");
    expect(publicApi).not.toHaveProperty("EnvironmentResourceManager");
    expect(publicApi).not.toHaveProperty("LightProjector");
    expect(publicApi).not.toHaveProperty("ThreeTextureLoaderAdapter");
    expect(publicApi).not.toHaveProperty("ThreeHdrTextureLoaderAdapter");
    expect(publicApi).not.toHaveProperty("ThreePmremAdapter");
  });

  it("exports expanded schema and command contracts from the package root", () => {
    const command: SetMaterialCommand = {
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { color: "#ffffff" }
    };
    const environment: SceneEnvironment = createEmptySnapshot("scene-a").environment;
    const light: LightDefinition = {
      id: "light-a",
      kind: "ambient",
      name: "Fill",
      color: "#ffffff",
      intensity: 1
    };
    const problem: Problem = {
      id: "asset-unresolved:asset-a:object-a",
      severity: "warning",
      code: "asset-unresolved",
      source: "asset-resolver",
      target: { kind: "object", objectId: "object-a" },
      assetId: "asset-a",
      message: "Missing",
      recoverability: "user-action"
    };
    const registerAsset: RegisterAssetCommand = { type: "register-asset", asset: { id: "texture-a", kind: "texture" } };
    const setEnvironment: SetEnvironmentCommand = { type: "set-environment", environment: { background: { mode: "solid", color: "#ffffff" } } };
    const addLight: AddLightCommand = { type: "add-light", light: { kind: "ambient" } };
    const updateLight: UpdateLightCommand = { type: "update-light", lightId: "light-a", patch: { intensity: 2 } };
    const removeLight: RemoveLightCommand = { type: "remove-light", lightId: "light-a" };
    const textureSlot: TextureSlot = { assetId: "texture-a", colorSpace: "srgb" };
    const materialState: MaterialState = { definitions: {}, assignments: {} };
    const authoredProblems: AuthoredProblemState = { acknowledged: {} };
    const target: ProblemTarget = { kind: "environment", assetId: "hdr-a" };

    expect(command.type).toBe("set-material");
    expect(registerAsset.asset.kind).toBe("texture");
    expect(setEnvironment.environment.background?.mode).toBe("solid");
    expect(addLight.light.kind).toBe("ambient");
    expect(updateLight.patch.intensity).toBe(2);
    expect(removeLight.lightId).toBe("light-a");
    expect(textureSlot.assetId).toBe("texture-a");
    expect(materialState.assignments).toEqual({});
    expect(authoredProblems.acknowledged).toEqual({});
    expect(target.kind).toBe("environment");
    expect(environment.mode).toBe("none");
    expect(light.kind).toBe("ambient");
    expect(problem.target).toEqual({ kind: "object", objectId: "object-a" });
  });
});
