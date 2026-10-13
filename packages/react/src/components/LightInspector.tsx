import { useEffect, useState } from "react";
import {
  buildAddLightCommand,
  buildRemoveLightCommand,
  buildUpdateLightCommand,
  createMessageDescriptor,
  type Editor,
  type LightFieldId,
  type LightInspectorSection,
  type LightKind,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import { InspectorSelect } from "./InspectorSelect";
import { SceneInspectorFields } from "./SceneInspectorFields";
import { useInspectorProblem } from "../hooks/use-inspector-problem";
import type { InspectorI18n } from "./inspector-i18n";
import { DEFAULT_INSPECTOR_I18N, renderOptionLabel, renderProblemMessage, renderSectionReason, renderSectionTitle } from "./inspector-i18n";

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
  const [fieldProblem, setFieldProblem, clearField] = useInspectorProblem(section.fields, targetKey);

  useEffect(() => { setFieldProblem(null); }, [targetKey]);

  function addLight(kind: LightKind | "") {
    if (!kind) {
      return;
    }
    const result = buildAddLightCommand(kind);
    if (result.ok) {
      const dispatch = editor.dispatch(result.command);
      if (!dispatch.ok) {
        setFieldProblem({ code: "inspector-light-dispatch-failed", ...lightProblemMessage(i18n, "reactWorkbench.inspector.lights.editFailed.message", dispatch.error), severity: "warning" });
        return;
      }
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
    if (!section.activeLightId) return false;
    const result = buildUpdateLightCommand(editor.getSnapshot(), section.activeLightId, fieldId, value);
    if (!result.ok) {
      setFieldProblem(result.problem);
      return false;
    }
    const dispatch = editor.dispatch(result.command);
    setFieldProblem(dispatch.ok ? null : { code: "inspector-light-dispatch-failed", fieldId, ...lightProblemMessage(i18n, "reactWorkbench.inspector.lights.editFailed.message", dispatch.error), severity: "warning" });
    return dispatch.ok;
  }

  function removeActive() {
    if (!section.activeLightId) {
      return;
    }
    const result = buildRemoveLightCommand(snapshot, section.activeLightId);
    if (result.ok) {
      const dispatch = editor.dispatch(result.command);
      setFieldProblem(dispatch.ok ? null : { code: "inspector-light-dispatch-failed", ...lightProblemMessage(i18n, "reactWorkbench.inspector.lights.editFailed.message", dispatch.error), severity: "warning" });
    }
  }

  return (
    <section className="ek-inspector-section">
      <header className="ek-inspector-section__header">
        <h2>{renderSectionTitle(i18n, section)}</h2>
        <InspectorSelect aria-label={i18n.t("reactWorkbench.inspector.lights.add.label")} className="ek-inspector-inline-select" value={addKind} i18n={i18n}
          options={[{ value: "", label: i18n.t("reactWorkbench.inspector.lights.add.option") }, ...section.addOptions.map((option) => ({ value: option.value, label: renderOptionLabel(i18n, option) }))]}
          onCommit={(value) => { const nextKind = value as LightKind | ""; setAddKind(nextKind); addLight(nextKind); return true; }} />
      </header>
      {section.lights.length ? (
        <div className="ek-inspector-light-list" role="list">
          {section.lights.map((light) => (
            <button
              key={light.id}
              type="button"
              data-ek-discard-draft
              aria-pressed={light.active}
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
          <SceneInspectorFields fields={section.fields.filter((field) => !field.id.startsWith("shadow."))}
            targetKey={targetKey} problem={fieldProblem} i18n={i18n} onReset={clearField} onCommit={(fieldId, value) => commit(fieldId as LightFieldId, value)} />
          {section.fields.some((field) => field.id.startsWith("shadow.")) ? (
            <details className="ek-inspector-fold" open>
              <summary>{i18n.t("reactWorkbench.inspector.sceneFields.shadows")}</summary>
              <SceneInspectorFields fields={section.fields.filter((field) => field.id.startsWith("shadow."))}
                targetKey={targetKey} problem={fieldProblem} i18n={i18n} onReset={clearField} onCommit={(fieldId, value) => commit(fieldId as LightFieldId, value)} />
            </details>
          ) : null}
          <button className="ek-inspector-danger" type="button" onClick={removeActive}>
            {i18n.t("reactWorkbench.inspector.lights.remove.label")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

type LightProblemMessageKey =
  | "reactWorkbench.inspector.lights.editFailed.message"
  | "reactWorkbench.inspector.lights.editFailedDetail.message"
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
  if (key === "reactWorkbench.inspector.lights.editFailed.message") {
    return "reactWorkbench.inspector.lights.editFailedDetail.message";
  }
  if (key === "reactWorkbench.inspector.lights.presetUnavailable.message") {
    return "reactWorkbench.inspector.lights.presetUnavailableDetail.message";
  }
  if (key === "reactWorkbench.inspector.lights.presetFailed.message") {
    return "reactWorkbench.inspector.lights.presetFailedDetail.message";
  }
  return key;
}
