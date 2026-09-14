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
import { SceneInspectorFields } from "./SceneInspectorFields";
import type { InspectorI18n } from "./inspector-i18n";
import { DEFAULT_INSPECTOR_I18N, renderProblemMessage, renderSectionTitle } from "./inspector-i18n";

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
      return false;
    }
    setFieldProblem(null);
    const result = buildSetEnvironmentCommand(editor.getSnapshot(), fieldId, value);
    if (result.ok) {
      const dispatch = editor.dispatch(result.command);
      if (!dispatch.ok) {
        setFieldProblem({ code: "inspector-environment-dispatch-failed", fieldId, ...environmentProblemMessage(i18n, "reactWorkbench.inspector.environment.editFailed.message", dispatch.error), severity: "warning" });
      }
      return dispatch.ok;
    } else {
      setFieldProblem(result.problem);
    }
    return false;
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
      {(["lighting", "background"] as const).map((group) => (
        <details key={group} className="ek-inspector-fold" open>
          <summary>{i18n.t(`reactWorkbench.inspector.sceneFields.${group}`)}</summary>
          <SceneInspectorFields fields={section.fields.filter((field) => group === "lighting" ? !field.id.startsWith("background.") : field.id.startsWith("background."))}
            problem={fieldProblem} i18n={i18n} onCommit={(fieldId, value) => commit(fieldId as EnvironmentFieldId, value)} />
        </details>
      ))}
    </section>
  );
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
