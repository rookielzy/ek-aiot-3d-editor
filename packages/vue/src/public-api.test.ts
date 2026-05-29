import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EditorViewport, InspectorPanel, useEditor, useInspector } from "./index";

describe("vue public API", () => {
  it("exports only the thin Vue adapter surface", () => {
    expect(EditorViewport).toBeTruthy();
    expect(InspectorPanel).toBeTruthy();
    expect(useEditor).toEqual(expect.any(Function));
    expect(useInspector).toEqual(expect.any(Function));
  });

  it("declares Vue as peer dependency and core as workspace dependency", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const packageJson = JSON.parse(readFileSync(resolve(here, "../package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      peerDependencies: Record<string, string>;
      exports: Record<string, unknown>;
    };

    expect(Object.keys(packageJson.exports)).toEqual(["."]);
    expect(packageJson.dependencies["@ek-aiot/3d-editor-core"]).toBe("workspace:*");
    expect(packageJson.peerDependencies.vue).toMatch(/^\^3/);
  });
});
