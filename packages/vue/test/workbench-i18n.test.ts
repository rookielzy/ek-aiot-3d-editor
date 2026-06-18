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
      "reactWorkbench.inspector.scene.label",
      "reactWorkbench.inspector.problems.empty",
      "inspector.section.material.title",
      "inspector.option.light.kind.point.label",
      "workbench.selection.none.label",
      "assetWorkspace.importDiagnostic.glb.decoder.missing.title",
      "problem.asset.unresolved.title",
      "problem.lighting.pointShadowCost.title",
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
    expect(resolveWorkbenchMessage("zh-CN", createDisplayMessageDescriptor({
      namespace: "inspector",
      path: "field.position.x",
      field: "label",
      fallback: "Position X"
    }))).toBe("位置 X");
    expect(resolveWorkbenchMessage("zh-CN", createDisplayMessageDescriptor({
      namespace: "problem",
      path: "lighting.pointShadowCost",
      field: "detail",
      fallback: "{lightName} uses {formattedTexelCost} effective shadow texels because point shadows render six faces.",
      values: { lightName: "Key light", formattedTexelCost: "12K" }
    }))).toBe("Key light 使用 12K 有效阴影纹素，因为点光阴影会渲染六个面。");
    expect(resolveWorkbenchMessage("zh-CN", {
      key: "reactWorkbench.inspector.environment.presetFailedDetail.message",
      fallback: "Environment preset failed: {detail}",
      values: { detail: "Unsupported environment field." }
    })).toBe("环境预设失败：Unsupported environment field.");
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
    expect(resolveWorkbenchMessage("zh-CN", {
      key: "reactWorkbench.inspector.problems.replaceAsset.label",
      fallback: "Replace asset",
      values: { assetId: "asset-a" }
    })).toBe("替换资源");
  });
});
