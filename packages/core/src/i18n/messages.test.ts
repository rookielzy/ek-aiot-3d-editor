import { describe, expect, it } from "vitest";
import { Object3D } from "three";
import {
  BUILTIN_LOCALES,
  createMessageDescriptor,
  isMessageDescriptorValues,
  isMessageKey,
  type MessageDescriptor,
  type MessageDescriptorValues,
  type SupportedLocale
} from "./messages";

describe("message descriptors", () => {
  it("exposes the initial built-in locale identifiers without storing locale on descriptors", () => {
    expect(BUILTIN_LOCALES).toEqual(["en", "zh-CN"]);

    const locale: SupportedLocale = BUILTIN_LOCALES[1];
    const descriptor = createMessageDescriptor({
      key: "workbench.status.runtimeReady",
      fallback: "Runtime ready"
    });

    expect(locale).toBe("zh-CN");
    expect(descriptor).toEqual({
      key: "workbench.status.runtimeReady",
      fallback: "Runtime ready"
    });
    expect(descriptor).not.toHaveProperty("locale");
    expect(descriptor).not.toHaveProperty("text");
    expect(isMessageDescriptorValues(undefined)).toBe(false);
    expect(isMessageKey("workbench.status.runtimeReady")).toBe(true);
  });

  it("keeps names, counts, modes, severities, statuses, and asset identifiers as JSON-safe values", () => {
    const values: MessageDescriptorValues = {
      count: 2,
      mode: "translate",
      severity: "warning",
      status: "missing-payload",
      assetId: "asset-a",
      problemCode: "asset-unresolved",
      name: "Pump A",
      flags: {
        available: true,
        empty: "",
        disabled: false,
        optional: null
      },
      orderedIds: ["asset-a", "asset-b"]
    };

    const descriptor = createMessageDescriptor({
      key: "workbench.problem.assetMissing",
      fallback: "Asset {name} is missing",
      values
    });

    expect(descriptor).toEqual({
      key: "workbench.problem.assetMissing",
      fallback: "Asset {name} is missing",
      values
    });
    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
  });

  it("rejects runtime-only interpolation values", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const values = [
      () => undefined,
      new Object3D(),
      new (class RuntimeValue {})(),
      new URL("blob:https://example.test/runtime"),
      "blob:https://example.test/runtime",
      Number.NaN,
      Number.POSITIVE_INFINITY,
      circular,
      typeof Blob === "undefined" ? undefined : new Blob(["runtime"]),
      typeof File === "undefined" ? undefined : new File(["runtime"], "runtime.txt")
    ].filter((value): value is unknown => value !== undefined);

    for (const value of values) {
      expect(isMessageDescriptorValues({ value })).toBe(false);
      expect(() => createMessageDescriptor({
        key: "workbench.problem.runtimeValue",
        fallback: "Runtime value",
        values: { value } as never
      })).toThrow("Message descriptor values must be JSON-compatible and must not include runtime-only values.");
    }
  });

  it("rejects missing, blank, and non-namespaced keys or fallbacks from unsafe hosts", () => {
    const inputs = [
      { fallback: "Missing key" },
      { key: "", fallback: "Blank key" },
      { key: "Pump A", fallback: "User label key" },
      { key: "motor-control-panel.glb", fallback: "Filename key" },
      { key: "workbench", fallback: "Not namespaced" },
      { key: "workbench.status.runtimeReady" },
      { key: "workbench.status.runtimeReady", fallback: "" },
      { key: "workbench.status.runtimeReady", fallback: "   " }
    ];

    for (const input of inputs) {
      expect(() => createMessageDescriptor(input)).toThrow(/Message descriptor (key|fallback)/);
    }
  });

  it("preserves falsy JSON-safe values without truthiness filtering", () => {
    const descriptor = createMessageDescriptor({
      key: "workbench.status.emptySelection",
      fallback: "No selection",
      values: {
        count: 0,
        label: "",
        enabled: false,
        reason: null,
        ids: [],
        metadata: {}
      }
    });

    expect(descriptor.values).toEqual({
      count: 0,
      label: "",
      enabled: false,
      reason: null,
      ids: [],
      metadata: {}
    });
  });

  it("clones and freezes descriptor values after validation", () => {
    const values: MessageDescriptorValues = {
      name: "Pump A",
      nested: {
        status: "ready"
      }
    };

    const descriptor = createMessageDescriptor({
      key: "workbench.asset.item",
      fallback: "Asset {name}",
      values
    });
    values.name = "Mutated";
    values.nested = { status: "mutated" };

    expect(descriptor.values).toEqual({
      name: "Pump A",
      nested: {
        status: "ready"
      }
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor.values)).toBe(true);
    expect(Object.isFrozen(descriptor.values?.nested)).toBe(true);
  });

  it("keeps fallback rendering readable when no dictionary entry is available", () => {
    const descriptor = createMessageDescriptor({
      key: "inspector.material.assignment",
      fallback: "Material assigned to {name}",
      values: { name: "motor-control-panel.glb" }
    });

    expect(descriptor.fallback).toBe("Material assigned to {name}");
    expect(descriptor.values).toEqual({ name: "motor-control-panel.glb" });
  });

  it("keeps user-authored labels as interpolation values instead of message keys", () => {
    const descriptor = createMessageDescriptor({
      key: "workbench.asset.item",
      fallback: "Asset {name}",
      values: {
        name: "Pump A",
        fileName: "motor-control-panel.glb"
      }
    });

    expect(descriptor.key).toBe("workbench.asset.item");
    expect(Object.values(descriptor.values ?? {})).toEqual(["Pump A", "motor-control-panel.glb"]);
    expect(Object.values(descriptor.values ?? {})).not.toContain(descriptor.key);
  });

  it("accepts plain descriptor data from adapter or host bridges", () => {
    const descriptor: MessageDescriptor = {
      key: "host.bridge.status",
      fallback: "Host translated status",
      values: { status: "ready" }
    };

    expect(isMessageDescriptorValues(descriptor.values)).toBe(true);
    expect(descriptor.fallback).toBe("Host translated status");
  });
});
