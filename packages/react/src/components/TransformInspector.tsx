import {
  buildSetTransformCommand,
  type Editor,
  type InspectorSection,
  type SceneSnapshot,
  type TransformFieldId
} from "@ek-aiot/3d-editor-core";
import type { InspectorI18n } from "./inspector-i18n";
import { DEFAULT_INSPECTOR_I18N, renderFieldLabel, renderSectionReason, renderSectionTitle } from "./inspector-i18n";

export interface TransformInspectorProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  section: InspectorSection;
  i18n?: InspectorI18n;
}

export function TransformInspector({ editor, snapshot, section, i18n = DEFAULT_INSPECTOR_I18N }: TransformInspectorProps) {
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
        <h2>{renderSectionTitle(i18n, section)}</h2>
      </header>
      {section.empty ? <p className="ek-inspector-empty">{renderSectionReason(i18n, section)}</p> : null}
      {!section.empty ? (
        <div className="ek-inspector-grid ek-inspector-grid--vectors">
          {section.fields.map((field) => (
            <label key={field.id} className="ek-inspector-field">
              <span>{renderFieldLabel(i18n, field)}</span>
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
