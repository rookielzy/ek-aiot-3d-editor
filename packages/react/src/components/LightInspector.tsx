import { useState } from "react";
import {
  buildAddLightCommand,
  buildRemoveLightCommand,
  buildUpdateLightCommand,
  getNextActiveLightId,
  type Editor,
  type LightFieldId,
  type LightInspectorSection,
  type LightKind,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";

export interface LightInspectorProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  section: LightInspectorSection;
  onActiveLightIdChange(value: string | null): void;
}

export function LightInspector({ editor, snapshot, section, onActiveLightIdChange }: LightInspectorProps) {
  const targetKey = section.activeLightId ?? "none";
  const [addKind, setAddKind] = useState<LightKind | "">("");

  function addLight(kind: LightKind | "") {
    if (!kind) {
      return;
    }
    const result = buildAddLightCommand(kind);
    if (result.ok) {
      const dispatch = editor.dispatch(result.command);
      onActiveLightIdChange(Object.keys(dispatch.snapshot.lights).at(-1) ?? null);
      setAddKind("");
    }
  }

  function commit(fieldId: LightFieldId, value: string) {
    if (!section.activeLightId) {
      return;
    }
    const result = buildUpdateLightCommand(snapshot, section.activeLightId, fieldId, value);
    if (result.ok) {
      editor.dispatch(result.command);
    }
  }

  function removeActive() {
    if (!section.activeLightId) {
      return;
    }
    const nextActiveId = getNextActiveLightId(snapshot, section.activeLightId);
    const result = buildRemoveLightCommand(snapshot, section.activeLightId);
    if (result.ok) {
      editor.dispatch(result.command);
      onActiveLightIdChange(nextActiveId);
    }
  }

  return (
    <section className="ek-inspector-section">
      <header className="ek-inspector-section__header">
        <h2>Lights</h2>
        <select
          aria-label="Add light"
          className="ek-inspector-inline-select"
          value={addKind}
          onChange={(event) => {
            const nextKind = event.currentTarget.value as LightKind | "";
            setAddKind(nextKind);
            addLight(nextKind);
          }}
        >
          <option value="">Add</option>
          {section.addOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </header>
      {section.lights.length ? (
        <div className="ek-inspector-light-list" role="list">
          {section.lights.map((light) => (
            <button key={light.id} type="button" className={light.active ? "is-active" : ""} onClick={() => onActiveLightIdChange(light.id)}>
              <span>{light.label}</span>
              <small>{light.kind}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="ek-inspector-empty">{section.reason}</p>
      )}
      {section.activeLightId ? (
        <div className="ek-inspector-grid">
          {section.fields.map((field) => (
            <label key={field.id} className="ek-inspector-field">
              <span>{field.label}</span>
              {field.kind === "number" ? (
                <input
                  key={`${targetKey}:${field.id}:${String(field.value)}`}
                  defaultValue={String(field.value)}
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 0.01}
                  onBlur={(event) => commit(field.id as LightFieldId, event.currentTarget.value)}
                />
              ) : field.kind === "color" ? (
                <input key={`${targetKey}:${field.id}:${String(field.value)}`} defaultValue={String(field.value)} type="color" onChange={(event) => commit(field.id as LightFieldId, event.currentTarget.value)} />
              ) : (
                <input key={`${targetKey}:${field.id}:${String(field.value)}`} defaultValue={String(field.value)} type="text" onBlur={(event) => commit(field.id as LightFieldId, event.currentTarget.value)} />
              )}
            </label>
          ))}
          <button className="ek-inspector-danger" type="button" onClick={removeActive}>
            Remove light
          </button>
        </div>
      ) : null}
    </section>
  );
}
