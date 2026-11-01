import { describe, expect, it } from "vitest";
import { createEditor } from "@ek-aiot/3d-editor-core";
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

    expect(snapshot.value.version).toBe(9);
    expect(snapshot.value.dataSources).toEqual({ connections: {}, queries: {}, bindings: {} });
    expect(snapshot.value.nodes["object-a"]).toMatchObject({ kind: "object", objectId: "object-a" });
    expect(snapshot.value.objects["object-a"].asset.id).toBe("asset-a");
    dispose();
  });

  it("forwards host executor and response limits to the core data service", async () => {
    const source = createEditor();
    source.dispatch({
      type: "create-data-connection",
      connection: {
        id: "connection-a",
        name: "Plant API",
        baseUrl: "https://api.example.test/v1",
        auth: { kind: "none" },
        headers: {},
        timeoutMs: 10_000
      }
    });
    const serialized = source.serialize();
    source.dispose();

    const { editor, dispose } = useEditor({
      snapshot: serialized,
      executor: async () => ({
        status: 200,
        contentType: "application/json",
        body: "{\"value\":\"0123456789\"}"
      }),
      maxResponseBytes: 10
    });

    const result = await editor.getDataService().executeQueryDraft({
      connectionId: "connection-a",
      path: "/devices",
      parameters: []
    }).result;
    expect(result.status).toBe("error");
    expect(result.problems.map((problem) => problem.code)).toEqual(["response-too-large"]);
    dispose();
  });

  it("loads a v9 connection-only data domain without Vue-specific data UI", () => {
    const source = createEditor();
    source.dispatch({
      type: "create-data-connection",
      connection: {
        id: "connection-a",
        name: "Plant API",
        baseUrl: "https://api.example.test/v1",
        auth: { kind: "none" },
        headers: {},
        timeoutMs: 10_000
      }
    });
    const serialized = source.serialize();
    source.dispose();

    const { editor, snapshot, dispose } = useEditor({ snapshot: serialized });

    expect(snapshot.value.version).toBe(9);
    expect(snapshot.value.dataSources.queries).toEqual({});
    expect(snapshot.value.dataSources.bindings).toEqual({});
    expect(snapshot.value.dataSources.connections["connection-a"]).toMatchObject({
      name: "Plant API",
      baseUrl: "https://api.example.test/v1"
    });
    expect(editor.getSnapshot()).toEqual(snapshot.value);
    dispose();
  });
});
