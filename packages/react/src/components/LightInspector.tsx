import { useState } from "react";
import {
  buildAddLightCommand,
  buildRemoveLightCommand,
  buildUpdateLightCommand,
  type Editor,
  type InspectorCommandProblem,
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
  const [fieldProblem, setFieldProblem] = useState<InspectorCommandProblem | null>(null);

  function addLight(kind: LightKind | "") {
    if (!kind) {
      return;
    }
    const result = buildAddLightCommand(kind);
    if (result.ok) {
      const dispatch = editor.dispatch(result.command);
      const nextLightId = Object.keys(dispatch.snapshot.lights).at(-1) ?? null;
      onActiveLightIdChange(nextLightId);
      setAddKind("");
    }
  }

  function runAction(actionId: string) {
    const action = section.actions?.find((candidate) => candidate.id === actionId);
    setFieldProblem(null);
    if (!action || action.disabled || !action.command) {
      setFieldProblem(action?.problem ?? { code: "inspector-light-action-unavailable", message: "Lighting preset is unavailable.", severity: "info" });
      return;
    }
    const dispatch = editor.dispatch(action.command);
    if (!dispatch.ok) {
      setFieldProblem({ code: "inspector-light-dispatch-failed", message: dispatch.error ?? "Lighting preset failed.", severity: "warning" });
    }
  }

  function commit(fieldId: LightFieldId, value: string) {
    if (!section.activeLightId) {
      return;
    }
    const result = buildUpdateLightCommand(snapshot, section.activeLightId, fieldId, value);
    if (result.ok) {
      setFieldProblem(null);
      editor.dispatch(result.command);
    } else {
      setFieldProblem(result.problem);
    }
  }

  function removeActive() {
    if (!section.activeLightId) {
      return;
    }
    const result = buildRemoveLightCommand(snapshot, section.activeLightId);
    if (result.ok) {
      editor.dispatch(result.command);
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
            <button
              key={light.id}
              type="button"
              className={light.active ? "is-active" : ""}
              data-node-id={light.nodeId ?? undefined}
              data-selected={light.selected ? "true" : "false"}
              onClick={() => onActiveLightIdChange(light.id)}
            >
              <span>{light.label}</span>
              <small>{light.kind}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="ek-inspector-empty">{section.reason}</p>
      )}
      {section.empty && section.reason && section.lights.length > 0 ? <p className="ek-inspector-empty">{section.reason}</p> : null}
      {section.actions?.length ? (
        <div className="ek-inspector-button-row" aria-label="Lighting presets">
          {section.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              title={action.problem?.message}
              onClick={() => runAction(action.id)}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      {fieldProblem && !fieldProblem.fieldId ? (
        <p className="ek-inspector-warning" role="alert">{fieldProblem.message}</p>
      ) : null}
      {section.diagnostics.length ? (
        <div className="ek-inspector-diagnostics" aria-label="Lighting diagnostics">
          {section.diagnostics.map((diagnostic) => (
            <p key={diagnostic.id} data-severity={diagnostic.severity}>
              <strong>{diagnostic.title}</strong>
              {diagnostic.detail ? <span>{diagnostic.detail}</span> : null}
            </p>
          ))}
        </div>
      ) : null}
      {section.activeLightId ? (
        <div className="ek-inspector-grid">
          {section.fields.map((field) => (
            <label key={field.id} className={field.kind === "checkbox" ? "ek-inspector-field ek-inspector-field--checkbox" : "ek-inspector-field"}>
              <span>{field.label}</span>
              {field.kind === "number" ? (
                <input
                  key={`${targetKey}:${field.id}:${String(field.value)}`}
                  defaultValue={String(field.value)}
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 0.01}
                  aria-invalid={fieldProblem?.fieldId === field.id ? true : undefined}
                  aria-describedby={fieldProblem?.fieldId === field.id ? problemId(field.id) : undefined}
                  onBlur={(event) => commit(field.id as LightFieldId, event.currentTarget.value)}
                />
              ) : field.kind === "color" ? (
                <input key={`${targetKey}:${field.id}:${String(field.value)}`} defaultValue={String(field.value)} type="color" onChange={(event) => commit(field.id as LightFieldId, event.currentTarget.value)} />
              ) : field.kind === "checkbox" ? (
                <input
                  key={`${targetKey}:${field.id}:${String(field.value)}`}
                  defaultChecked={Boolean(field.value)}
                  type="checkbox"
                  onChange={(event) => commit(field.id as LightFieldId, String(event.currentTarget.checked))}
                />
              ) : (
                <input
                  key={`${targetKey}:${field.id}:${String(field.value)}`}
                  defaultValue={String(field.value)}
                  type="text"
                  aria-invalid={fieldProblem?.fieldId === field.id ? true : undefined}
                  aria-describedby={fieldProblem?.fieldId === field.id ? problemId(field.id) : undefined}
                  onBlur={(event) => commit(field.id as LightFieldId, event.currentTarget.value)}
                />
              )}
              {fieldProblem?.fieldId === field.id ? <small id={problemId(field.id)} className="ek-inspector-field-problem" role="alert">{fieldProblem.message}</small> : null}
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

function problemId(fieldId: string): string {
  return `ek-light-${fieldId.replace(/[^a-z0-9_-]/gi, "-")}-problem`;
}
