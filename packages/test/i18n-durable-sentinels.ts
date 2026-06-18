import { expect } from "vitest";

export const AUTHORED_I18N_SENTINELS = [
  "Pump A",
  "motor-control-panel.glb",
  "Hero view",
  "Key light",
  "Body",
  "Studio HDR",
  "asset-a",
] as const;

export const DURABLE_I18N_LEAK_SENTINELS = [
  "zh-CN",
  "\"locale\"",
  "dictionary",
  "translated",
  "translator",
  "reactWorkbench.",
  "workbench.status.runtimeReady",
  "workbench.project.status.problems.label",
  "inspector.field.position.x.label",
  "problem.asset.unresolved.title",
  "Runtime ready",
  "Asset {name}",
  "项目",
  "层级",
  "无法解析资源",
  "替换资源",
  "打开",
  "简体中文",
] as const;

export const RUNTIME_ONLY_LEAK_SENTINELS = [
  "Blob",
  "File",
  "Object3D",
  "MeshStandardMaterial",
  "PerspectiveCamera",
  "OrbitControls",
  "WebGLRenderTarget",
  "PMREM",
  "resolver",
  "object URL",
  "blob:",
  "runtime",
] as const;

export function expectNoI18nDurableLeakage(payload: unknown): void {
  const serialized = stringifyPayload(payload);

  for (const sentinel of DURABLE_I18N_LEAK_SENTINELS) {
    expect(serialized, `durable payload should not contain i18n/UI sentinel ${sentinel}`).not.toContain(sentinel);
  }
}

export function expectNoRuntimeOnlyLeakage(payload: unknown): void {
  const serialized = stringifyPayload(payload);

  for (const sentinel of RUNTIME_ONLY_LEAK_SENTINELS) {
    expect(serialized, `durable payload should not contain runtime-only sentinel ${sentinel}`).not.toContain(sentinel);
  }
}

export function expectAuthoredValuesPresent(payload: unknown, values: readonly string[] = AUTHORED_I18N_SENTINELS): void {
  const serialized = stringifyPayload(payload);

  for (const value of values) {
    expect(serialized, `durable payload should preserve authored value ${value}`).toContain(value);
  }
}

function stringifyPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}
