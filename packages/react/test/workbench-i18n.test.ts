import { describe, expect, it } from "vitest";
import { createMessageDescriptor } from "@ek-aiot/3d-editor-core";
import {
  DEFAULT_WORKBENCH_LOCALE,
  WORKBENCH_DICTIONARIES,
  resolveWorkbenchMessage,
  type WorkbenchTranslate
} from "../src/i18n/workbench-i18n";

describe("React Workbench i18n", () => {
  it("keeps the built-in English and Simplified Chinese dictionaries in parity", () => {
    expect(DEFAULT_WORKBENCH_LOCALE).toBe("en");

    const englishKeys = Object.keys(WORKBENCH_DICTIONARIES.en).sort();
    const chineseKeys = Object.keys(WORKBENCH_DICTIONARIES["zh-CN"]).sort();

    expect(chineseKeys).toEqual(englishKeys);
    expect(englishKeys).toContain("reactWorkbench.toolbar.project.open.label");
    expect(englishKeys).toContain("reactWorkbench.leftPanel.assets.search.placeholder");
    expect(englishKeys).toContain("reactWorkbench.status.assets");
    expect(englishKeys).toContain("reactWorkbench.inspector.scene.label");
    expect(englishKeys).toContain("reactWorkbench.inspector.problems.empty");
    expect(englishKeys).toContain("inspector.section.material.title");
    expect(englishKeys).toContain("inspector.option.light.kind.point.label");
    expect(englishKeys).toContain("problem.lighting.pointShadowCost.title");
  });

  it("resolves core and inspector descriptors in the active locale and interpolates values", () => {
    const descriptor = createMessageDescriptor({
      key: "workbench.project.status.problems.label",
      fallback: "{problemCount} problems",
      values: { problemCount: 2 }
    });

    expect(resolveWorkbenchMessage("zh-CN", descriptor)).toBe("2 个问题");
    expect(resolveWorkbenchMessage("zh-CN", createMessageDescriptor({
      key: "inspector.field.position.x.label",
      fallback: "Position X"
    }))).toBe("位置 X");
    expect(resolveWorkbenchMessage("zh-CN", createMessageDescriptor({
      key: "problem.lighting.pointShadowCost.detail",
      fallback: "{lightName} uses {formattedTexelCost} effective shadow texels because point shadows render six faces.",
      values: { lightName: "Key light", formattedTexelCost: "12K" }
    }))).toBe("Key light 使用 12K 有效阴影纹素，因为点光阴影会渲染六个面。");
    expect(resolveWorkbenchMessage("zh-CN", {
      key: "reactWorkbench.inspector.environment.presetFailedDetail.message",
      fallback: "Environment preset failed: {detail}",
      values: { detail: "Unsupported environment field." }
    })).toBe("环境预设失败：Unsupported environment field.");
  });

  it("lets host translation overrides win over built-in dictionaries", () => {
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

  it("falls back to descriptor fallback text when a dictionary entry is missing", () => {
    const descriptor = createMessageDescriptor({
      key: "workbench.custom.missing.label",
      fallback: "Missing {name}",
      values: { name: "Robot arm" }
    });

    expect(resolveWorkbenchMessage("zh-CN", descriptor)).toBe("Missing Robot arm");
  });

  it("treats authored values as interpolation values rather than lookup keys", () => {
    expect(resolveWorkbenchMessage("zh-CN", {
      key: "reactWorkbench.toolbar.status.opened.message",
      fallback: "Opened {fileName}",
      values: { fileName: "motor-control-panel.glb" }
    })).toBe("已打开 motor-control-panel.glb");
    expect(resolveWorkbenchMessage("zh-CN", {
      key: "reactWorkbench.leftPanel.assets.reimport.success",
      fallback: "Reimported {fileName}",
      values: { fileName: "Camera view 1" }
    })).toBe("已重新导入 Camera view 1");
    expect(resolveWorkbenchMessage("zh-CN", {
      key: "reactWorkbench.inspector.problems.replaceAsset.label",
      fallback: "Replace asset",
      values: { assetId: "asset-a" }
    })).toBe("替换资源");
  });
});
