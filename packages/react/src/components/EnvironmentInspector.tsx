import {
  buildSetEnvironmentCommand,
  type Editor,
  type EnvironmentFieldId,
  type InspectorSection,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";

export interface EnvironmentInspectorProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  section: InspectorSection;
}

export function EnvironmentInspector({ editor, snapshot, section }: EnvironmentInspectorProps) {
  function commit(fieldId: EnvironmentFieldId, value: string) {
    if (value === "" && fieldId.endsWith("assetId")) {
      return;
    }
    const result = buildSetEnvironmentCommand(snapshot, fieldId, value);
    if (result.ok) {
      editor.dispatch(result.command);
    }
  }

  return (
    <section className="ek-inspector-section">
      <header className="ek-inspector-section__header">
        <h2>Environment</h2>
      </header>
      <div className="ek-inspector-grid">
        {section.fields.map((field) => (
          <label key={field.id} className="ek-inspector-field">
            <span>{field.label}</span>
            {field.kind === "number" ? (
              <input
                key={`${field.id}:${String(field.value)}`}
                defaultValue={String(field.value)}
                disabled={field.disabled}
                type="number"
                min={field.min}
                max={field.max}
                step={field.step ?? 0.01}
                onBlur={(event) => commit(field.id as EnvironmentFieldId, event.currentTarget.value)}
              />
            ) : field.kind === "color" ? (
              <input
                key={`${field.id}:${String(field.value)}`}
                defaultValue={String(field.value)}
                disabled={field.disabled}
                type="color"
                onChange={(event) => commit(field.id as EnvironmentFieldId, event.currentTarget.value)}
              />
            ) : (
              <select
                key={`${field.id}:${String(field.value)}`}
                defaultValue={String(field.value)}
                disabled={field.disabled}
                onChange={(event) => commit(field.id as EnvironmentFieldId, event.currentTarget.value)}
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
    </section>
  );
}
