import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKBENCH_LOCALE,
  EditorViewport,
  EditorWorkbench,
  InspectorPanel,
  WORKBENCH_LOCALE_LABELS,
  WORKBENCH_LOCALES,
  getWorkbenchLocaleLabel,
  isWorkbenchLocale,
  normalizeWorkbenchLocale,
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
  type WorkbenchMessageDescriptor,
  type WorkbenchMessageInput,
  type WorkbenchMessageKey,
  type WorkbenchMessageValues,
  type WorkbenchTranslate,
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
    const translate: WorkbenchTranslate = (descriptor, activeLocale) =>
      descriptor.key === "host.status.saved" && activeLocale === "zh-CN" ? "已保存" : undefined;
    const descriptor: WorkbenchMessageDescriptor = {
      key: "host.custom.message",
      fallback: "Host {name}",
      values: { name: "Workbench" } satisfies WorkbenchMessageValues
    };
    const key: WorkbenchMessageKey = "reactWorkbench.toolbar.project.open.label";
    const input: WorkbenchMessageInput = descriptor;
    const props: Pick<EditorWorkbenchProps, "showDefaultToolbar" | "viewportClassName" | "inspectorClassName" | "locale" | "defaultLocale" | "translate" | "showLocaleSwitcher" | "localeSwitcherDisabled"> = {
      showDefaultToolbar: true,
      viewportClassName: "host-viewport",
      inspectorClassName: "host-inspector",
      locale,
      defaultLocale: "en",
      translate,
      showLocaleSwitcher: false,
      localeSwitcherDisabled: true
    };
    const slots: EditorWorkbenchSlots = {
      leftPanel: (context: WorkbenchContext) => context.model.hierarchy.totalCount,
      rightPanel: (context) => context.problems.totalCount,
      sidePanel: (context) => context.history.undoCount,
      status: (context) => context.i18n?.t({ key: "host.status.saved", fallback: "Saved" }) ?? context.model.status.problemCount
    };
    const emits: EditorWorkbenchEmits = {
      runtimeReady: [null],
      "update:locale": ["zh-CN"]
    };
    const legacyEmits: EditorWorkbenchEmits = {
      runtimeReady: [null]
    };
    const i18n: Pick<WorkbenchI18n, "locale" | "t"> = {
      locale,
      t: (message) => resolveWorkbenchMessage(locale, message)
    };

    expect(regionName).toBe("leftPanel");
    expect(DEFAULT_WORKBENCH_LOCALE).toBe("en");
    expect(WORKBENCH_LOCALES).toEqual(["en", "zh-CN"]);
    expect(WORKBENCH_LOCALE_LABELS["zh-CN"]).toBe("简体中文");
    expect(getWorkbenchLocaleLabel("zh-CN")).toBe("简体中文");
    expect(isWorkbenchLocale("zh-CN")).toBe(true);
    expect(isWorkbenchLocale("fr")).toBe(false);
    expect(normalizeWorkbenchLocale(undefined)).toBe("en");
    expect(props.showDefaultToolbar).toBe(true);
    expect(props.locale).toBe("zh-CN");
    expect(props.defaultLocale).toBe("en");
    expect(props.showLocaleSwitcher).toBe(false);
    expect(props.localeSwitcherDisabled).toBe(true);
    expect(typeof slots.leftPanel).toBe("function");
    expect(typeof slots.rightPanel).toBe("function");
    expect(typeof slots.sidePanel).toBe("function");
    expect(typeof slots.status).toBe("function");
    expect(emits["update:locale"][0]).toBe("zh-CN");
    expect(legacyEmits.runtimeReady).toEqual([null]);
    expect(i18n.t(key)).toBe("打开");
    expect(i18n.t(input)).toBe("Host Workbench");
    expect(props.translate?.({ key: "host.status.saved", fallback: "Saved" }, locale)).toBe("已保存");
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
