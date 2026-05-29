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
  type SetMaterialCommand
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

    expect(command.type).toBe("set-material");
    expect(environment.mode).toBe("none");
    expect(light.kind).toBe("ambient");
    expect(problem.target).toEqual({ kind: "object", objectId: "object-a" });
  });
});
