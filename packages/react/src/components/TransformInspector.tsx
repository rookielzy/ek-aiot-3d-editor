import {
  buildSetTransformCommand,
  type Editor,
  type InspectorSection,
  type SceneSnapshot,
  type TransformFieldId
} from "@ek-aiot/3d-editor-core";

export interface TransformInspectorProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  section: InspectorSection;
}

export function TransformInspector({ editor, snapshot, section }: TransformInspectorProps) {
  const targetKey = snapshot.selection.nodeId ?? "none";

  function commit(fieldId: TransformFieldId, value: string) {
    const result = buildSetTransformCommand(snapshot, fieldId, value);
    if (result.ok) {
      editor.dispatch(result.command);
    }
  }

  return (
    <section className="ek-inspector-section">
      <header className="ek-inspector-section__header">
        <h2>Transform</h2>
      </header>
      {section.empty ? <p className="ek-inspector-empty">{section.reason}</p> : null}
      {!section.empty ? (
        <div className="ek-inspector-grid ek-inspector-grid--vectors">
          {section.fields.map((field) => (
            <label key={field.id} className="ek-inspector-field">
              <span>{field.label}</span>
              <input
                key={`${targetKey}:${field.id}:${String(field.value)}`}
                defaultValue={String(field.value)}
                disabled={field.disabled}
                type="number"
                step={field.step ?? 0.01}
                onBlur={(event) => commit(field.id as TransformFieldId, event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commit(field.id as TransformFieldId, event.currentTarget.value);
                  }
                }}
              />
            </label>
          ))}
        </div>
      ) : null}
    </section>
  );
}
