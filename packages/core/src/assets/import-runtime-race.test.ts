import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Group } from "three";
import { createEditor } from "../editor/create-editor";
import { createGlbImportManifest } from "./import-pipeline";

describe("import race with runtime projection", () => {
  it("registers project assets before runtime projection observes them", async () => {
    const bytes = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../test/fixtures/simple-box.glb"));
    const file = new File([bytes], "box.glb", { type: "model/gltf-binary" });
    const editor = createEditor();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const order: string[] = [];

    const originalResolve = editor.projectAssets.resolve.bind(editor.projectAssets);
    editor.projectAssets.resolve = ((asset) => {
      order.push(`resolve:${editor.projectAssets.size}`);
      return originalResolve(asset);
    }) as typeof editor.projectAssets.resolve;

    const originalRegister = editor.projectAssets.register.bind(editor.projectAssets);
    editor.projectAssets.register = ((input) => {
      order.push("register");
      return originalRegister(input);
    }) as typeof editor.projectAssets.register;

    const runtime = editor.mountRuntime({
      container,
      loader: {
        analyze: async (resolved) => ({
          scene: new Group(),
          manifest: createGlbImportManifest({ scene: new Group(), resolved }),
          diagnostics: []
        }),
        load: async () => new Group()
      }
    });
    await runtime.project();
    order.length = 0;

    const [result] = await editor.importWorkbenchAssets({
      files: [{ name: file.name, mimeType: file.type, source: file }],
      loader: {
        analyze: async (resolved) => ({
          scene: new Group(),
          manifest: createGlbImportManifest({ scene: new Group(), resolved }),
          diagnostics: []
        }),
        load: async () => new Group()
      }
    });

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolveWait) => setTimeout(resolveWait, 0));

    expect(result.status).toBe("succeeded");
    expect(order.indexOf("register")).toBeGreaterThanOrEqual(0);
    expect(order.findIndex((step) => step.startsWith("resolve:"))).toBeGreaterThan(order.indexOf("register"));
    expect(runtime.getProblems().filter((problem) => problem.code === "asset-unresolved")).toEqual([]);
    expect(runtime.getObject(result.objectId!)).toBeTruthy();
  });
});
