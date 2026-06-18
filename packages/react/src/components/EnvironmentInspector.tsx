import {
  buildSetEnvironmentCommand,
  createMessageDescriptor,
  type Editor,
  type EnvironmentFieldId,
  type InspectorCommandProblem,
  type InspectorSection,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import { useState } from "react";
import type { InspectorI18n } from "./inspector-i18n";
import { DEFAULT_INSPECTOR_I18N, renderFieldLabel, renderOptionLabel, renderProblemMessage, renderSectionTitle } from "./inspector-i18n";

export interface EnvironmentInspectorProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  section: InspectorSection;
  i18n?: InspectorI18n;
}

export function EnvironmentInspector({ editor, snapshot, section, i18n = DEFAULT_INSPECTOR_I18N }: EnvironmentInspectorProps) {
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
        setFieldProblem({ code: "inspector-environment-dispatch-failed", fieldId, ...environmentProblemMessage(i18n, "reactWorkbench.inspector.environment.editFailed.message", dispatch.error), severity: "warning" });
      }
    } else {
      setFieldProblem(result.problem);
    }
  }

  function runAction(actionId: string) {
    const action = section.actions?.find((candidate) => candidate.id === actionId);
    setFieldProblem(null);
    if (!action || action.disabled || !action.command) {
      setFieldProblem(action?.problem ?? { code: "inspector-environment-action-unavailable", ...environmentProblemMessage(i18n, "reactWorkbench.inspector.environment.presetUnavailable.message"), severity: "info" });
      return;
    }
    const dispatch = editor.dispatch(action.command);
    if (!dispatch.ok) {
      setFieldProblem({ code: "inspector-environment-dispatch-failed", ...environmentProblemMessage(i18n, "reactWorkbench.inspector.environment.presetFailed.message", dispatch.error), severity: "warning" });
    }
  }

  return (
    <section className="ek-inspector-section">
      <header className="ek-inspector-section__header">
        <h2>{renderSectionTitle(i18n, section)}</h2>
      </header>
      {section.actions?.length ? (
        <div className="ek-inspector-button-row" aria-label={i18n.t("reactWorkbench.inspector.environment.presets.label")}>
          {section.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              title={action.problem ? renderProblemMessage(i18n, action.problem) : undefined}
              onClick={() => runAction(action.id)}
            >
              {action.labelDescriptor ? i18n.t(action.labelDescriptor) : action.label}
            </button>
          ))}
        </div>
      ) : null}
      {fieldProblem && !fieldProblem.fieldId ? (
        <p className="ek-inspector-warning" role="alert">{renderProblemMessage(i18n, fieldProblem)}</p>
      ) : null}
      <div className="ek-inspector-grid">
        {section.fields.map((field) => {
          const activeProblem = fieldProblem?.fieldId === field.id ? fieldProblem : field.problem;
          const descriptionId = activeProblem ? problemId(field.id) : undefined;
          return (
            <label key={field.id} className="ek-inspector-field">
              <span>{renderFieldLabel(i18n, field)}</span>
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
                  {field.kind === "asset" ? <option value="">{i18n.t("reactWorkbench.inspector.field.asset.none")}</option> : null}
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {renderOptionLabel(i18n, option)}
                    </option>
                  ))}
                </select>
              )}
              {activeProblem ? <small id={descriptionId} className="ek-inspector-field-problem" role={fieldProblem?.fieldId === field.id ? "alert" : undefined}>{renderProblemMessage(i18n, activeProblem)}</small> : null}
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

type EnvironmentProblemMessageKey =
  | "reactWorkbench.inspector.environment.editFailed.message"
  | "reactWorkbench.inspector.environment.editFailedDetail.message"
  | "reactWorkbench.inspector.environment.presetUnavailable.message"
  | "reactWorkbench.inspector.environment.presetUnavailableDetail.message"
  | "reactWorkbench.inspector.environment.presetFailed.message"
  | "reactWorkbench.inspector.environment.presetFailedDetail.message";

function environmentProblemMessage(i18n: InspectorI18n, key: EnvironmentProblemMessageKey, detail?: string) {
  const messageKey = detail ? detailKey(key) : key;
  const message = detail ? i18n.t(messageKey, { detail }) : i18n.t(messageKey);
  return {
    message,
    messageDescriptor: createMessageDescriptor({
      key: messageKey,
      fallback: detail ? `${i18n.t(key)}: {detail}` : message,
      ...(detail ? { values: { detail } } : {})
    })
  };
}

function detailKey(key: EnvironmentProblemMessageKey): EnvironmentProblemMessageKey {
  if (key === "reactWorkbench.inspector.environment.editFailed.message") {
    return "reactWorkbench.inspector.environment.editFailedDetail.message";
  }
  if (key === "reactWorkbench.inspector.environment.presetUnavailable.message") {
    return "reactWorkbench.inspector.environment.presetUnavailableDetail.message";
  }
  if (key === "reactWorkbench.inspector.environment.presetFailed.message") {
    return "reactWorkbench.inspector.environment.presetFailedDetail.message";
  }
  return key;
}
