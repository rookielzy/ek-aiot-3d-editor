import { describe, expect, it, vi } from "vitest";
import { createEditor } from "./create-editor";
import type { RendererLike } from "../runtime/editor-runtime";

describe("editor lifecycle", () => {
  it("mounts runtime and disposes runtime plus store subscriptions idempotently", () => {
    const editor = createEditor();
    const rendererDispose = vi.fn();
    const runtime = editor.mountRuntime({
      container: document.createElement("div"),
      rendererFactory: (container): RendererLike => {
        const canvas = container.ownerDocument.createElement("canvas");
        return {
          domElement: canvas,
          setSize() {},
          render() {},
          dispose: rendererDispose
        };
      }
    });

    editor.dispose();
    editor.dispose();

    expect(runtime.disposed).toBe(true);
    expect(rendererDispose).toHaveBeenCalledTimes(1);
    expect(editor.disposed).toBe(true);
  });

  it("notifies runtime subscribers when runtime mounts and editor disposes", () => {
    const editor = createEditor();
    const runtimes: Array<ReturnType<typeof editor.getRuntime>> = [];
    const unsubscribe = editor.subscribeRuntime((runtime) => {
      runtimes.push(runtime);
    });
    const runtime = editor.mountRuntime({
      container: document.createElement("div"),
      rendererFactory: (container): RendererLike => ({
        domElement: container.ownerDocument.createElement("canvas"),
        setSize() {},
        render() {},
        dispose() {}
      })
    });

    unsubscribe();
    editor.dispose();

    expect(runtimes).toEqual([null, runtime]);
  });

  it("exposes disposed runtimes as null when remounting", () => {
    const editor = createEditor();
    const runtimes: Array<ReturnType<typeof editor.getRuntime>> = [];
    editor.subscribeRuntime((runtime) => {
      runtimes.push(runtime);
    });
    const first = editor.mountRuntime({
      container: document.createElement("div"),
      rendererFactory: createFakeRenderer
    });
    const second = editor.mountRuntime({
      container: document.createElement("div"),
      rendererFactory: createFakeRenderer
    });

    expect(first.disposed).toBe(true);
    expect(editor.getRuntime()).toBe(second);
    expect(runtimes).toEqual([null, first, null, second]);
  });

  it("clears project payloads when restoring a plain snapshot", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", source: new Uint8Array([1]) } });
    expect(editor.exportProject().ok).toBe(true);

    editor.restore(editor.serialize());

    expect(editor.exportProject().ok).toBe(false);
    expect(editor.exportProject().problems).toMatchObject([{ code: "project-export-payload-missing" }]);
  });

  it("notifies asset workspace subscribers for snapshot and payload-only changes", async () => {
    const editor = createEditor();
    const versions: number[] = [];
    editor.subscribeAssetWorkspace((version) => {
      versions.push(version);
    });

    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const missingVersion = editor.getAssetWorkspaceVersion();
    const replaced = await editor.replaceAsset({ assetId: "asset-a", source: new Uint8Array([1, 2, 3]) });
    const payloadVersion = editor.getAssetWorkspaceVersion();

    expect(replaced.ok).toBe(true);
    expect(payloadVersion).toBeGreaterThan(missingVersion);
    expect(versions).toEqual([0, 1, 2]);
    expect(editor.getAssetWorkspacePayloads()).toEqual([expect.objectContaining({
      assetId: "asset-a",
      available: true,
      exportable: true,
      byteSize: 3
    })]);
    expect(JSON.stringify(editor.getAssetWorkspacePayloads())).not.toContain("bytes");
    expect(JSON.stringify(editor.getAssetWorkspacePayloads())).not.toContain("blob:");
  });

  it("notifies asset workspace subscribers when project import or restore replaces payloads", () => {
    const source = createEditor();
    source.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", source: new Uint8Array([1]) } });
    const exported = source.exportProject();
    const editor = createEditor();
    const versions: number[] = [];
    editor.subscribeAssetWorkspace((version) => {
      versions.push(version);
    });

    const imported = editor.importProject(exported.packageBytes as Uint8Array);
    editor.restore(editor.serialize());

    expect(imported.ok).toBe(true);
    expect(versions).toEqual([0, 1, 2]);
    expect(editor.getAssetWorkspacePayloads()).toEqual([]);
  });

  it("keeps durable command results when transient payload registration fails", () => {
    const editor = createEditor();
    const result = editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: {
        id: "asset-a",
        source: { metadata: { bad: Number.NaN }, bytes: new Uint8Array([1]) }
      }
    });

    expect(result.ok).toBe(true);
    expect(editor.getSnapshot().objects["object-a"].asset.id).toBe("asset-a");
    expect(editor.exportProject().ok).toBe(false);
  });
});

function createFakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
