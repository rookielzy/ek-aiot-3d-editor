import { buildSaveDataQueryCommand, type createEditor } from "@ek-aiot/3d-editor-core";

export function seedSavedQuery(editor: ReturnType<typeof createEditor>) {
  const snapshot = editor.getSnapshot();
  const connection = Object.values(snapshot.dataSources.connections)[0];
  const built = buildSaveDataQueryCommand(snapshot, {
    connectionId: connection.id,
    name: "Saved query",
    path: "/devices",
    parameters: [],
    mapping: {
      mode: "array",
      root: [],
      identity: { kind: "path", path: [{ kind: "key", key: "id" }], valueType: "string" },
      displayName: null,
      properties: [{
        key: "temperature",
        label: "Temperature",
        type: "number",
        nullable: false,
        unit: null,
        source: [{ kind: "key", key: "temperature" }],
        transform: { kind: "raw" },
        range: null,
        allowed: null
      }],
      observedAt: null,
      sourceQuality: null
    }
  });
  if (!built.ok) throw new Error(built.problems.map((problem) => problem.message).join("\n"));
  const saved = editor.dispatch(built.command);
  if (!saved.ok) throw new Error(saved.error);
}
