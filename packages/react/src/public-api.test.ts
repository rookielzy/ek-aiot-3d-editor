import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EditorViewport, EditorWorkbench, InspectorPanel, useEditor, useEditorSnapshot, useInspector, useWorkbench } from "./index";

describe("react public API", () => {
  it("exports only the thin React adapter surface", () => {
    expect(EditorViewport).toEqual(expect.any(Function));
    expect(EditorWorkbench).toEqual(expect.any(Function));
    expect(InspectorPanel).toEqual(expect.any(Function));
    expect(useEditor).toEqual(expect.any(Function));
    expect(useEditorSnapshot).toEqual(expect.any(Function));
    expect(useInspector).toEqual(expect.any(Function));
    expect(useWorkbench).toEqual(expect.any(Function));
  });

  it("declares React as peer dependency and core as workspace dependency", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const packageJson = JSON.parse(readFileSync(resolve(here, "../package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      peerDependencies: Record<string, string>;
      exports: Record<string, unknown>;
    };

    expect(Object.keys(packageJson.exports)).toEqual(["."]);
    expect(packageJson.dependencies["@ek-aiot/3d-editor-core"]).toBe("workspace:*");
    expect(packageJson.peerDependencies.react).toMatch(/^\^19/);
    expect(packageJson.peerDependencies["react-dom"]).toMatch(/^\^19/);
  });
});
