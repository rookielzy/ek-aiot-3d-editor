import { describe, expect, it } from "vitest";
import { createDisplayMessageDescriptor } from "@ek-aiot/3d-editor-core";
import {
  DEFAULT_WORKBENCH_LOCALE,
  WORKBENCH_DICTIONARIES,
  getWorkbenchLocaleLabel,
  isWorkbenchLocale,
  normalizeWorkbenchLocale,
  resolveWorkbenchMessage,
  type WorkbenchTranslate
} from "../src/i18n/workbench-i18n";

describe("Vue Workbench i18n", () => {
  it("keeps built-in English and Chinese dictionaries in key parity", () => {
    const englishKeys = Object.keys(WORKBENCH_DICTIONARIES.en).sort();
    const chineseKeys = Object.keys(WORKBENCH_DICTIONARIES["zh-CN"]).sort();

    expect(chineseKeys).toEqual(englishKeys);
    expect(englishKeys).toEqual(expect.arrayContaining([
      "reactWorkbench.toolbar.project.open.label",
      "reactWorkbench.leftPanel.assets.import.label",
      "reactWorkbench.status.selection",
      "workbench.selection.none.label",
      "assetWorkspace.importDiagnostic.glb.decoder.missing.title",
      "problem.asset.unresolved.title",
      "workbenchImport.diagnostic.workbench.import.kind.unsupported.title"
    ]));
  });

  it("normalizes locales and exposes labels", () => {
    expect(DEFAULT_WORKBENCH_LOCALE).toBe("en");
    expect(normalizeWorkbenchLocale("zh-CN")).toBe("zh-CN");
    expect(normalizeWorkbenchLocale(undefined)).toBe("en");
    expect(isWorkbenchLocale("zh-CN")).toBe(true);
    expect(isWorkbenchLocale("fr")).toBe(false);
    expect(getWorkbenchLocaleLabel("zh-CN")).toBe("简体中文");
  });

  it("resolves core descriptors in the active locale and interpolates values", () => {
    const descriptor = createDisplayMessageDescriptor({
      namespace: "workbench",
      path: "project.status.problems",
      field: "label",
      fallback: "{problemCount} problems",
      values: { problemCount: 2 }
    });

    expect(resolveWorkbenchMessage("zh-CN", descriptor)).toBe("2 个问题");
  });

  it("lets host translation win before built-in dictionaries", () => {
    const translate: WorkbenchTranslate = (descriptor, locale) =>
      descriptor.key === "reactWorkbench.toolbar.project.open.label" && locale === "zh-CN"
        ? "Host open"
        : undefined;

    expect(resolveWorkbenchMessage("zh-CN", "reactWorkbench.toolbar.project.open.label", undefined, translate)).toBe("Host open");
  });

  it("falls back when host translation throws or returns a non-string value", () => {
    const throwingTranslate: WorkbenchTranslate = () => {
      throw new Error("host translator failed");
    };
    const nonStringTranslate = (() => 42) as unknown as WorkbenchTranslate;

    expect(resolveWorkbenchMessage("zh-CN", "reactWorkbench.toolbar.project.open.label", undefined, throwingTranslate)).toBe("打开");
    expect(resolveWorkbenchMessage("zh-CN", {
      key: "host.custom.missing.message",
      fallback: "Missing {name}",
      values: { name: "Robot arm" }
    }, undefined, nonStringTranslate)).toBe("Missing Robot arm");
  });

  it("falls back to descriptor fallback text with interpolation", () => {
    expect(resolveWorkbenchMessage("zh-CN", {
      key: "host.custom.missing.message",
      fallback: "Missing {name}",
      values: { name: "Robot arm" }
    })).toBe("Missing Robot arm");
  });

  it("treats authored values as interpolation values, not message keys", () => {
    expect(resolveWorkbenchMessage("zh-CN", {
      key: "reactWorkbench.toolbar.status.opened.message",
      fallback: "Opened {fileName}",
      values: { fileName: "motor-control-panel.glb" }
    })).toBe("已打开 motor-control-panel.glb");
    expect(resolveWorkbenchMessage("zh-CN", {
      key: "reactWorkbench.status.selection",
      fallback: "Selection {selection}",
      values: { selection: "Robot arm" }
    })).toBe("选择 Robot arm");
  });
});
