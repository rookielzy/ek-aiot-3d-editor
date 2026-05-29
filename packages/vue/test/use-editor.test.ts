import { describe, expect, it } from "vitest";
import { createLegacyProofLoopSnapshot } from "../../core/test/fixtures/legacy-proof-loop";
import { useEditor } from "../src/composables/use-editor";

describe("useEditor", () => {
  it("subscribes to core state without Vue-local command or history behavior", () => {
    const { editor, snapshot, objectCount, dispose } = useEditor();

    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [1, 0, 0] } });
    editor.undo();

    expect(objectCount.value).toBe(1);
    expect(snapshot.value.objects["object-a"].transform.position).toEqual([0, 0, 0]);
    dispose();
  });

  it("restores snapshots through core", () => {
    const first = useEditor();
    first.editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const serialized = first.editor.serialize();
    const second = useEditor();

    second.restore(serialized);

    expect(second.snapshot.value.objects["object-a"].asset.id).toBe("asset-a");
    first.dispose();
    second.dispose();
  });

  it("initializes legacy serialized snapshots through core migration", () => {
    const { snapshot, dispose } = useEditor({ snapshot: createLegacyProofLoopSnapshot() });

    expect(snapshot.value.version).toBe(2);
    expect(snapshot.value.objects["object-a"].asset.id).toBe("asset-a");
    dispose();
  });
});
