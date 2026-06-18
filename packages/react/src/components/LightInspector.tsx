import { useState } from "react";
import {
  buildAddLightCommand,
  buildRemoveLightCommand,
  buildUpdateLightCommand,
  createMessageDescriptor,
  type Editor,
  type InspectorCommandProblem,
  type LightFieldId,
  type LightInspectorSection,
  type LightKind,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import type { InspectorI18n } from "./inspector-i18n";
import { DEFAULT_INSPECTOR_I18N, renderFieldLabel, renderOptionLabel, renderProblemMessage, renderSectionReason, renderSectionTitle } from "./inspector-i18n";

export interface LightInspectorProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  section: LightInspectorSection;
  i18n?: InspectorI18n;
  onActiveLightIdChange(value: string | null): void;
}

export function LightInspector({ editor, snapshot, section, i18n = DEFAULT_INSPECTOR_I18N, onActiveLightIdChange }: LightInspectorProps) {
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
      setFieldProblem(action?.problem ?? { code: "inspector-light-action-unavailable", ...lightProblemMessage(i18n, "reactWorkbench.inspector.lights.presetUnavailable.message"), severity: "info" });
      return;
    }
    const dispatch = editor.dispatch(action.command);
    if (!dispatch.ok) {
      setFieldProblem({ code: "inspector-light-dispatch-failed", ...lightProblemMessage(i18n, "reactWorkbench.inspector.lights.presetFailed.message", dispatch.error), severity: "warning" });
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
        <h2>{renderSectionTitle(i18n, section)}</h2>
        <select
          aria-label={i18n.t("reactWorkbench.inspector.lights.add.label")}
          className="ek-inspector-inline-select"
          value={addKind}
          onChange={(event) => {
            const nextKind = event.currentTarget.value as LightKind | "";
            setAddKind(nextKind);
            addLight(nextKind);
          }}
        >
          <option value="">{i18n.t("reactWorkbench.inspector.lights.add.option")}</option>
          {section.addOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {renderOptionLabel(i18n, option)}
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
        <p className="ek-inspector-empty">{renderSectionReason(i18n, section)}</p>
      )}
      {section.empty && section.reason && section.lights.length > 0 ? <p className="ek-inspector-empty">{renderSectionReason(i18n, section)}</p> : null}
      {section.actions?.length ? (
        <div className="ek-inspector-button-row" aria-label={i18n.t("reactWorkbench.inspector.lights.presets.label")}>
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
      {section.diagnostics.length ? (
        <div className="ek-inspector-diagnostics" aria-label={i18n.t("reactWorkbench.inspector.lights.diagnostics.label")}>
          {section.diagnostics.map((diagnostic) => (
            <p key={diagnostic.id} data-severity={diagnostic.severity}>
              <strong>{diagnostic.titleDescriptor ? i18n.t(diagnostic.titleDescriptor) : diagnostic.title}</strong>
              {diagnostic.detail ? <span>{diagnostic.detailDescriptor ? i18n.t(diagnostic.detailDescriptor) : diagnostic.detail}</span> : null}
            </p>
          ))}
        </div>
      ) : null}
      {section.activeLightId ? (
        <div className="ek-inspector-grid">
          {section.fields.map((field) => (
            <label key={field.id} className={field.kind === "checkbox" ? "ek-inspector-field ek-inspector-field--checkbox" : "ek-inspector-field"}>
              <span>{renderFieldLabel(i18n, field)}</span>
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
              {fieldProblem?.fieldId === field.id ? <small id={problemId(field.id)} className="ek-inspector-field-problem" role="alert">{renderProblemMessage(i18n, fieldProblem)}</small> : null}
            </label>
          ))}
          <button className="ek-inspector-danger" type="button" onClick={removeActive}>
            {i18n.t("reactWorkbench.inspector.lights.remove.label")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function problemId(fieldId: string): string {
  return `ek-light-${fieldId.replace(/[^a-z0-9_-]/gi, "-")}-problem`;
}

type LightProblemMessageKey =
  | "reactWorkbench.inspector.lights.presetUnavailable.message"
  | "reactWorkbench.inspector.lights.presetUnavailableDetail.message"
  | "reactWorkbench.inspector.lights.presetFailed.message"
  | "reactWorkbench.inspector.lights.presetFailedDetail.message";

function lightProblemMessage(i18n: InspectorI18n, key: LightProblemMessageKey, detail?: string) {
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

function detailKey(key: LightProblemMessageKey): LightProblemMessageKey {
  if (key === "reactWorkbench.inspector.lights.presetUnavailable.message") {
    return "reactWorkbench.inspector.lights.presetUnavailableDetail.message";
  }
  if (key === "reactWorkbench.inspector.lights.presetFailed.message") {
    return "reactWorkbench.inspector.lights.presetFailedDetail.message";
  }
  return key;
}
