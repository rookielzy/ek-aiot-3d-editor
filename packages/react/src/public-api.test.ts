import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EditorViewport, EditorWorkbench, InspectorPanel, useEditor, useEditorSnapshot, useInspector, useWorkbench, type EditorWorkbenchProps, type WorkbenchContext, type WorkbenchRegionName } from "./index";

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

  it("exposes the install-ready workbench contract from the package root", () => {
    const regionName: WorkbenchRegionName = "leftPanel";
    const props: Pick<EditorWorkbenchProps, "leftPanel" | "rightPanel" | "sidePanel" | "status"> = {
      leftPanel: (context: WorkbenchContext) => context.selection.count,
      rightPanel: (context) => context.problems.totalCount,
      sidePanel: (context) => context.history.undoCount,
      status: (context) => context.project.exportProject().ok ? "ok" : "blocked"
    };

    expect(regionName).toBe("leftPanel");
    expect(typeof props.leftPanel).toBe("function");
    expect(typeof props.rightPanel).toBe("function");
    expect(typeof props.sidePanel).toBe("function");
    expect(typeof props.status).toBe("function");
  });

  it("declares React as peer dependency and core as workspace dependency", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const packageJson = JSON.parse(readFileSync(resolve(here, "../package.json"), "utf8")) as {
      description?: string;
      dependencies: Record<string, string>;
      peerDependencies: Record<string, string>;
      exports: Record<string, unknown>;
      files?: string[];
      license?: string;
      publishConfig?: { access?: string };
      repository?: { directory?: string };
    };
    const corePackageJson = JSON.parse(readFileSync(resolve(here, "../../core/package.json"), "utf8")) as {
      version: string;
    };

    expect(Object.keys(packageJson.exports)).toEqual(["."]);
    expect(packageJson.description).toContain("React hooks");
    expect(packageJson.files).toEqual(expect.arrayContaining(["dist", "README.md", "CHANGELOG.md"]));
    expect(packageJson.license).toBe("MIT");
    expect(packageJson.publishConfig?.access).toBe("public");
    expect(packageJson.repository?.directory).toBe("packages/react");
    expect(packageJson.dependencies["@ek-aiot/3d-editor-core"]).toBe(`workspace:^${corePackageJson.version}`);
    expect(packageJson.peerDependencies.react).toMatch(/^\^19/);
    expect(packageJson.peerDependencies["react-dom"]).toMatch(/^\^19/);
  });
});
