import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEditor, type DataRequestExecutor } from "@ek-aiot/3d-editor-core";
import { createLegacyProofLoopSnapshot } from "../../core/test/fixtures/legacy-proof-loop";
import { useEditor, useEditorSnapshot } from "../src/hooks/use-editor";

describe("React editor hooks", () => {
  it("uses the core editor and external-store snapshot subscription", () => {
    const editor = createEditor();
    const { result } = renderHook(() => useEditorSnapshot(editor));

    act(() => {
      editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    });

    expect(result.current.objects["object-a"].asset.id).toBe("asset-a");
  });

  it("does not recreate a provided editor", () => {
    const editor = createEditor();
    const { result, rerender } = renderHook(() => useEditor({ editor }));

    rerender();

    expect(result.current).toBe(editor);
  });

  it("initializes legacy serialized snapshots through core migration", () => {
    const { result } = renderHook(() => useEditor({ snapshot: createLegacyProofLoopSnapshot() }));

    expect(result.current.getSnapshot().version).toBe(9);
    expect(result.current.getSnapshot().nodes["object-a"]).toMatchObject({ kind: "object", objectId: "object-a" });
    expect(result.current.getSnapshot().objects["object-a"].asset.id).toBe("asset-a");
  });

  it("preserves owned editor state when credential arrays are recreated or changed", () => {
    const hook = renderHook(({ available }) => useEditor({
      credentials: [{ ref: "credential-host", label: "Host token", available }]
    }), { initialProps: { available: true } });
    const editor = hook.result.current;
    act(() => {
      editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    });
    const snapshot = editor.getSnapshot();
    const history = editor.getHistoryState();

    hook.rerender({ available: true });
    expect(hook.result.current).toBe(editor);
    hook.rerender({ available: false });
    expect(hook.result.current).toBe(editor);
    expect(hook.result.current.getSnapshot()).toBe(snapshot);
    expect(hook.result.current.getHistoryState()).toEqual(history);
    expect(hook.result.current.getDataCredentials?.()).toEqual([
      { ref: "credential-host", label: "Host token", available: true }
    ]);
    hook.unmount();
    editor.dispose();
  });

  it("initializes the host request executor once and keeps the editor stable", () => {
    const firstExecutor: DataRequestExecutor = async () => ({ status: 200, body: "{}" });
    const secondExecutor: DataRequestExecutor = async () => ({ status: 500, body: "{}" });
    const hook = renderHook(({ executor }) => useEditor({ executor }), {
      initialProps: { executor: firstExecutor }
    });
    const editor = hook.result.current;
    const service = editor.getDataService?.();
    expect(service?.getState().executorAvailable).toBe(true);

    hook.rerender({ executor: secondExecutor });

    expect(hook.result.current).toBe(editor);
    expect(hook.result.current.getDataService?.()).toBe(service);
    expect(hook.result.current.getDataService?.().getState().executorAvailable).toBe(true);
    hook.unmount();
    editor.dispose();
  });
});
