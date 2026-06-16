import {
  buildSetEnvironmentCommand,
  type Editor,
  type EnvironmentFieldId,
  type InspectorCommandProblem,
  type InspectorSection,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import { useState } from "react";

export interface EnvironmentInspectorProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  section: InspectorSection;
}

export function EnvironmentInspector({ editor, snapshot, section }: EnvironmentInspectorProps) {
  const [fieldProblem, setFieldProblem] = useState<InspectorCommandProblem | null>(null);

  function commit(fieldId: EnvironmentFieldId, value: string) {
    if (value === "" && fieldId.endsWith("assetId")) {
      return;
    }
    setFieldProblem(null);
    const result = buildSetEnvironmentCommand(snapshot, fieldId, value);
    if (result.ok) {
      const dispatch = editor.dispatch(result.command);
      if (!dispatch.ok) {
        setFieldProblem({ code: "inspector-environment-dispatch-failed", fieldId, message: dispatch.error ?? "Environment edit failed.", severity: "warning" });
      }
    } else {
      setFieldProblem(result.problem);
    }
  }

  function runAction(actionId: string) {
    const action = section.actions?.find((candidate) => candidate.id === actionId);
    setFieldProblem(null);
    if (!action || action.disabled || !action.command) {
      setFieldProblem(action?.problem ?? { code: "inspector-environment-action-unavailable", message: "Environment preset is unavailable.", severity: "info" });
      return;
    }
    const dispatch = editor.dispatch(action.command);
    if (!dispatch.ok) {
      setFieldProblem({ code: "inspector-environment-dispatch-failed", message: dispatch.error ?? "Environment preset failed.", severity: "warning" });
    }
  }

  return (
    <section className="ek-inspector-section">
      <header className="ek-inspector-section__header">
        <h2>Environment</h2>
      </header>
      {section.actions?.length ? (
        <div className="ek-inspector-button-row" aria-label="Environment presets">
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
      <div className="ek-inspector-grid">
        {section.fields.map((field) => {
          const activeProblem = fieldProblem?.fieldId === field.id ? fieldProblem : field.problem;
          const descriptionId = activeProblem ? problemId(field.id) : undefined;
          return (
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
                  aria-invalid={fieldProblem?.fieldId === field.id ? true : undefined}
                  aria-describedby={descriptionId}
                  onBlur={(event) => commit(field.id as EnvironmentFieldId, event.currentTarget.value)}
                />
              ) : field.kind === "color" ? (
                <input
                  key={`${field.id}:${String(field.value)}`}
                  defaultValue={String(field.value)}
                  disabled={field.disabled}
                  type="color"
                  aria-invalid={fieldProblem?.fieldId === field.id ? true : undefined}
                  aria-describedby={descriptionId}
                  onChange={(event) => commit(field.id as EnvironmentFieldId, event.currentTarget.value)}
                />
              ) : (
                <select
                  key={`${field.id}:${String(field.value)}`}
                  defaultValue={String(field.value)}
                  disabled={field.disabled}
                  aria-invalid={fieldProblem?.fieldId === field.id ? true : undefined}
                  aria-describedby={descriptionId}
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
              {activeProblem ? <small id={descriptionId} className="ek-inspector-field-problem" role={fieldProblem?.fieldId === field.id ? "alert" : undefined}>{activeProblem.message}</small> : null}
            </label>
          );
        })}
      </div>
    </section>
  );
}

function problemId(fieldId: string): string {
  return `ek-environment-${fieldId.replace(/[^a-z0-9_-]/gi, "-")}-problem`;
}
