import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createEditor } from "@ek-aiot/3d-editor-core";
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

    expect(result.current.getSnapshot().version).toBe(6);
    expect(result.current.getSnapshot().nodes["object-a"]).toMatchObject({ kind: "object", objectId: "object-a" });
    expect(result.current.getSnapshot().objects["object-a"].asset.id).toBe("asset-a");
  });
});
