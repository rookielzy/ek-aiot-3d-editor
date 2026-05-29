import {
  buildSetMaterialCommand,
  type Editor,
  type MaterialFieldId,
  type MaterialInspectorSection,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";

export interface MaterialInspectorProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  section: MaterialInspectorSection;
}

export function MaterialInspector({ editor, snapshot, section }: MaterialInspectorProps) {
  const targetKey = section.assignmentId ?? snapshot.selection.objectId ?? "none";

  function commit(fieldId: MaterialFieldId, value: unknown) {
    if (value === "" && !fieldId.startsWith("textures.")) {
      return;
    }
    const result = buildSetMaterialCommand(snapshot, fieldId, value);
    if (result.ok) {
      editor.dispatch(result.command);
    }
  }

  return (
    <section className="ek-inspector-section">
      <header className="ek-inspector-section__header">
        <h2>Material</h2>
      </header>
      {section.empty ? <p className="ek-inspector-empty">{section.reason}</p> : null}
      {!section.empty ? (
        <div className="ek-inspector-grid">
          {section.fields.map((field) => (
            <label key={field.id} className="ek-inspector-field">
              <span>{field.label}</span>
              {field.kind === "number" ? (
                <input
                  key={`${targetKey}:${field.id}:${String(field.value)}`}
                  defaultValue={String(field.value)}
                  disabled={field.disabled}
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 0.01}
                  onBlur={(event) => commit(field.id as MaterialFieldId, event.currentTarget.value)}
                />
              ) : field.kind === "color" ? (
                <input
                  key={`${targetKey}:${field.id}:${String(field.value)}`}
                  defaultValue={String(field.value)}
                  disabled={field.disabled}
                  type="color"
                  onChange={(event) => commit(field.id as MaterialFieldId, event.currentTarget.value)}
                />
              ) : field.kind === "checkbox" ? (
                <input
                  key={`${targetKey}:${field.id}:${String(field.value)}`}
                  defaultChecked={Boolean(field.value)}
                  disabled={field.disabled}
                  type="checkbox"
                  onChange={(event) => commit(field.id as MaterialFieldId, event.currentTarget.checked)}
                />
              ) : (
                <select
                  key={`${targetKey}:${field.id}:${String(field.value)}`}
                  defaultValue={String(field.value)}
                  disabled={field.disabled}
                  onChange={(event) => commit(field.id as MaterialFieldId, event.currentTarget.value)}
                >
                  {field.kind === "asset" ? <option value="">None</option> : null}
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ))}
        </div>
      ) : null}
    </section>
  );
}
