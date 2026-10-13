import { describe, expect, it } from "vitest";
import { createMessageDescriptor } from "@ek-aiot/3d-editor-core";
import {
  WORKBENCH_DICTIONARIES as REACT_WORKBENCH_DICTIONARIES,
  resolveWorkbenchMessage as resolveReactWorkbenchMessage,
  type WorkbenchTranslate as ReactWorkbenchTranslate,
} from "../src/i18n/workbench-i18n";
import {
  WORKBENCH_DICTIONARIES as VUE_WORKBENCH_DICTIONARIES,
  resolveWorkbenchMessage as resolveVueWorkbenchMessage,
  type WorkbenchTranslate as VueWorkbenchTranslate,
} from "../../vue/src/i18n/workbench-i18n";

describe("React and Vue Workbench i18n parity", () => {
  it("keeps shared dictionary key sets aligned across adapters", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const sharedReactKeys = Object.keys(REACT_WORKBENCH_DICTIONARIES[locale]);
      expect(Object.keys(VUE_WORKBENCH_DICTIONARIES[locale]).sort()).toEqual(sharedReactKeys.sort());
    }
  });

  it("resolves representative shared Workbench concepts to equivalent built-in copy", () => {
    const representativeKeys = [
      "reactWorkbench.toolbar.project.open.label",
      "reactWorkbench.toolbar.project.exportPartial.label",
      "reactWorkbench.leftPanel.hierarchy.label",
      "reactWorkbench.leftPanel.assets.search.placeholder",
      "reactWorkbench.status.selection",
      "reactWorkbench.inspector.scene.label",
      "reactWorkbench.inspector.form.search",
      "reactWorkbench.inspector.form.invalidColor",
      "reactWorkbench.inspector.form.apply",
      "reactWorkbench.inspector.problems.empty",
      "reactWorkbench.inspector.problems.replaceAsset.label",
      "inspector.section.material.title",
      "inspector.field.position.x.label",
      "problem.asset.unresolved.title",
      "problem.asset.unresolved.detail",
      "problem.lighting.pointShadowCost.detail",
    ] as const;

    for (const locale of ["en", "zh-CN"] as const) {
      for (const key of representativeKeys) {
        const values = {
          selection: "Robot arm",
          assetId: "asset-a",
          objectId: null,
          lightName: "Key light",
          formattedTexelCost: "12K",
        };
        expect(resolveVueWorkbenchMessage(locale, key, values), `${locale} ${key}`).toBe(resolveReactWorkbenchMessage(locale, key, values));
      }
    }
  });

  it("keeps descriptor fallback, raw technical detail, and host override behavior aligned", () => {
    const missingDescriptor = createMessageDescriptor({
      key: "host.custom.missing.message",
      fallback: "Missing {name}",
      values: { name: "Robot arm" },
    });
    const rawDetailDescriptor = createMessageDescriptor({
      key: "problem.asset.unresolved.detail",
      fallback: "Asset {assetId} is missing or unavailable.",
      values: { assetId: "asset-a", objectId: "draco decoder failed" },
    });
    const reactTranslate: ReactWorkbenchTranslate = (descriptor, locale) =>
      descriptor.key === "reactWorkbench.toolbar.project.open.label" && locale === "zh-CN"
        ? "Host open"
        : undefined;
    const vueTranslate: VueWorkbenchTranslate = (descriptor, locale) =>
      descriptor.key === "reactWorkbench.toolbar.project.open.label" && locale === "zh-CN"
        ? "Host open"
        : undefined;
    const throwingReactTranslate: ReactWorkbenchTranslate = () => {
      throw new Error("host translator failed");
    };
    const throwingVueTranslate: VueWorkbenchTranslate = () => {
      throw new Error("host translator failed");
    };

    expect(resolveReactWorkbenchMessage("zh-CN", missingDescriptor)).toBe(resolveVueWorkbenchMessage("zh-CN", missingDescriptor));
    expect(resolveReactWorkbenchMessage("zh-CN", rawDetailDescriptor)).toBe(resolveVueWorkbenchMessage("zh-CN", rawDetailDescriptor));
    expect(resolveReactWorkbenchMessage("zh-CN", "reactWorkbench.toolbar.project.open.label", undefined, reactTranslate)).toBe(
      resolveVueWorkbenchMessage("zh-CN", "reactWorkbench.toolbar.project.open.label", undefined, vueTranslate)
    );
    expect(resolveReactWorkbenchMessage("zh-CN", "reactWorkbench.toolbar.project.open.label", undefined, throwingReactTranslate)).toBe(
      resolveVueWorkbenchMessage("zh-CN", "reactWorkbench.toolbar.project.open.label", undefined, throwingVueTranslate)
    );
  });
});
