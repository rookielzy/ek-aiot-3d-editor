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
  useEditorSnapshot,
  useInspector,
  useWorkbench,
  type EditorWorkbenchProps,
  type ResolvedWorkbenchContext,
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
    const props: Pick<EditorWorkbenchProps, "locale" | "defaultLocale" | "onLocaleChange" | "showLocaleSwitcher" | "localeSwitcherDisabled" | "translate" | "leftPanel" | "rightPanel" | "sidePanel" | "status"> = {
      locale,
      defaultLocale: "en",
      onLocaleChange: (nextLocale) => {
        expect(nextLocale).toBe("zh-CN");
      },
      showLocaleSwitcher: false,
      localeSwitcherDisabled: true,
      translate,
      leftPanel: (context: ResolvedWorkbenchContext) => context.i18n.t("reactWorkbench.leftPanel.hierarchy.label"),
      rightPanel: (context) => context.problems.totalCount,
      sidePanel: (context) => context.history.undoCount,
      status: (context) => context.model.status.problemCount === 0 && context.project.exportProject().ok ? "ok" : "blocked"
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
    expect(props.locale).toBe("zh-CN");
    expect(props.defaultLocale).toBe("en");
    expect(props.showLocaleSwitcher).toBe(false);
    expect(props.localeSwitcherDisabled).toBe(true);
    expect(i18n.t(key)).toBe("打开");
    expect(i18n.t(input)).toBe("Host Workbench");
    expect(props.translate?.({ key: "host.status.saved", fallback: "Saved" }, locale)).toBe("已保存");
    expect(typeof props.leftPanel).toBe("function");
    expect(typeof props.rightPanel).toBe("function");
    expect(typeof props.sidePanel).toBe("function");
    expect(typeof props.status).toBe("function");
  });

  it("keeps WorkbenchContext mock-compatible while resolved regions expose i18n", () => {
    const oldStyleContext = {
      model: {
        hierarchy: { totalCount: 0 },
        status: { problemCount: 0 }
      },
      history: { undoCount: 0 },
      project: { exportProject: () => ({ ok: true }) },
      problems: { totalCount: 0 }
    } as unknown as WorkbenchContext;

    const region: NonNullable<EditorWorkbenchProps["toolbar"]> = (context) =>
      context.i18n.t("reactWorkbench.toolbar.project.open.label");

    expect(oldStyleContext.i18n).toBeUndefined();
    expect(typeof region).toBe("function");
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

    expect(Object.keys(packageJson.exports)).toEqual([".", "./styles.css"]);
    expect(packageJson.exports["./styles.css"]).toBe("./dist/index.css");
    expect(packageJson.exports).not.toHaveProperty("./components/EditorWorkbench");
    expect(packageJson.description).toContain("React hooks");
    expect(packageJson.files).toEqual(expect.arrayContaining(["dist", "README.md", "CHANGELOG.md"]));
    expect(packageJson.license).toBe("MIT");
    expect(packageJson.publishConfig?.access).toBe("public");
    expect(packageJson.repository?.directory).toBe("packages/react");
    expect(packageJson.dependencies["@ek-aiot/3d-editor-core"]).toBe(`workspace:^${corePackageJson.version}`);
    expect(packageJson.dependencies["@phosphor-icons/react"]).toMatch(/^\^2\./);
    expect(packageJson.peerDependencies.react).toMatch(/^\^19/);
    expect(packageJson.peerDependencies["react-dom"]).toMatch(/^\^19/);
    expect(packageJson.peerDependencies).not.toHaveProperty("@phosphor-icons/react");
  });
});
