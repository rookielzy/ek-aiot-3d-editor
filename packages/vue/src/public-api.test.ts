import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EditorViewport,
  EditorWorkbench,
  InspectorPanel,
  resolveWorkbenchMessage,
  useEditor,
  useInspector,
  useWorkbench,
  type EditorWorkbenchEmits,
  type EditorWorkbenchProps,
  type EditorWorkbenchSlots,
  type WorkbenchContext,
  type WorkbenchI18n,
  type WorkbenchLocale,
  type WorkbenchRegionName
} from "./index";

describe("vue public API", () => {
  it("exports only the thin Vue adapter surface", () => {
    expect(EditorViewport).toBeTruthy();
    expect(EditorWorkbench).toBeTruthy();
    expect(InspectorPanel).toBeTruthy();
    expect(useEditor).toEqual(expect.any(Function));
    expect(useInspector).toEqual(expect.any(Function));
    expect(useWorkbench).toEqual(expect.any(Function));
  });

  it("exposes the install-ready workbench contract from the package root", () => {
    const regionName: WorkbenchRegionName = "leftPanel";
    const locale: WorkbenchLocale = "zh-CN";
    const props: Pick<EditorWorkbenchProps, "showDefaultToolbar" | "viewportClassName" | "inspectorClassName" | "locale" | "showLocaleSwitcher"> = {
      showDefaultToolbar: true,
      viewportClassName: "host-viewport",
      inspectorClassName: "host-inspector",
      locale,
      showLocaleSwitcher: false
    };
    const slots: EditorWorkbenchSlots = {
      leftPanel: (context: WorkbenchContext) => context.model.hierarchy.totalCount,
      rightPanel: (context) => context.problems.totalCount,
      sidePanel: (context) => context.history.undoCount,
      status: (context) => context.i18n?.t("reactWorkbench.status.saved") ?? context.model.status.problemCount
    };
    const emits: EditorWorkbenchEmits = {
      runtimeReady: [],
      "update:locale": ["zh-CN"]
    };
    const legacyEmits: EditorWorkbenchEmits = {
      runtimeReady: []
    };
    const i18n: Pick<WorkbenchI18n, "locale" | "t"> = {
      locale,
      t: (key) => resolveWorkbenchMessage(locale, key)
    };

    expect(regionName).toBe("leftPanel");
    expect(props.showDefaultToolbar).toBe(true);
    expect(props.locale).toBe("zh-CN");
    expect(props.showLocaleSwitcher).toBe(false);
    expect(typeof slots.leftPanel).toBe("function");
    expect(typeof slots.rightPanel).toBe("function");
    expect(typeof slots.sidePanel).toBe("function");
    expect(typeof slots.status).toBe("function");
    expect(emits["update:locale"][0]).toBe("zh-CN");
    expect(legacyEmits.runtimeReady).toEqual([]);
    expect(i18n.t("reactWorkbench.toolbar.project.open.label")).toBe("打开");
  });

  it("declares Vue as peer dependency and core as workspace dependency", () => {
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

    expect(Object.keys(packageJson.exports)).toEqual([".", "./styles.css"]);
    expect(packageJson.exports["./styles.css"]).toBe("./dist/index.css");
    expect(packageJson.exports).not.toHaveProperty("./components/EditorWorkbench.vue");
    expect(packageJson.description).toContain("Vue composables");
    expect(packageJson.files).toEqual(expect.arrayContaining(["dist", "README.md", "CHANGELOG.md"]));
    expect(packageJson.license).toBe("MIT");
    expect(packageJson.publishConfig?.access).toBe("public");
    expect(packageJson.repository?.directory).toBe("packages/vue");
    expect(packageJson.dependencies["@ek-aiot/3d-editor-core"]).toBe(`workspace:^${corePackageJson.version}`);
    expect(packageJson.peerDependencies.vue).toMatch(/^\^3/);
  });
});
