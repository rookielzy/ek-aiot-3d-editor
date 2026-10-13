import { useId } from "react";
import { useInspectorProblem } from "../hooks/use-inspector-problem";
import {
  buildSetTransformCommand,
  type Editor,
  type InspectorSection,
  type SceneSnapshot,
  type TransformFieldId
} from "@ek-aiot/3d-editor-core";
import { InspectorNumberInput } from "./InspectorNumberInput";
import type { InspectorI18n } from "./inspector-i18n";
import { DEFAULT_INSPECTOR_I18N, createInspectorDispatchProblem, renderFieldLabel, renderProblemMessage, renderSectionReason, renderSectionTitle } from "./inspector-i18n";

export interface TransformInspectorProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  section: InspectorSection;
  i18n?: InspectorI18n;
}

export function TransformInspector({ editor, snapshot, section, i18n = DEFAULT_INSPECTOR_I18N }: TransformInspectorProps) {
  const targetKey = snapshot.selection.nodeId ?? "none";
  const [problem, setProblem, clearField] = useInspectorProblem(section.fields, targetKey);
  const problemId = useId();

  function displayValue(fieldId: string, value: unknown): number {
    return fieldId.startsWith("rotation.") ? Number(value) * 180 / Math.PI : Number(value);
  }

  function commit(fieldId: TransformFieldId, value: string) {
    const number = value.trim() === "" ? NaN : Number(value);
    const field = section.fields.find((candidate) => candidate.id === fieldId);
    setProblem(null);
    // Avoid round-trip degree conversion changing an otherwise untouched rotation.
    if (field && number === displayValue(fieldId, field.value)) return true;
    const result = buildSetTransformCommand(editor.getSnapshot(), fieldId, fieldId.startsWith("rotation.") ? number * Math.PI / 180 : number);
    if (result.ok) {
      const dispatch = editor.dispatch(result.command);
      if (!dispatch.ok) setProblem(createInspectorDispatchProblem(fieldId, i18n, dispatch.error));
      return dispatch.ok;
    } else {
      setProblem(result.problem);
    }
    return result.ok;
  }

  return (
    <section className="ek-inspector-section">
      <header className="ek-inspector-section__header">
        <h2>{renderSectionTitle(i18n, section)}</h2>
      </header>
      {section.empty ? <p className="ek-inspector-empty">{renderSectionReason(i18n, section)}</p> : null}
      {!section.empty ? (["position", "rotation", "scale"] as const).map((vector) => {
        const fields = section.fields.filter((field) => field.id.startsWith(`${vector}.`));
        if (!fields.length) return null;
        return (
          <fieldset key={vector} className="ek-inspector-vector">
            <legend>{i18n.t(`reactWorkbench.inspector.transform.${vector}`)}</legend>
            <div className="ek-inspector-grid ek-inspector-grid--vectors">
              {fields.map((field) => (
                <label key={field.id} className="ek-inspector-axis" data-axis={field.id.split(".")[1]}>
                  <span aria-hidden="true">{field.id.split(".")[1]?.toUpperCase()}</span>
                  <InspectorNumberInput
                    key={`${targetKey}:${field.id}`}
                    aria-label={renderFieldLabel(i18n, field)}
                    value={displayValue(field.id, field.value)}
                    disabled={field.disabled}
                    step={vector === "rotation" ? 1 : field.step ?? 0.01}
                    aria-invalid={problem?.fieldId === field.id ? true : undefined}
                    aria-describedby={problem?.fieldId === field.id ? problemId : undefined}
                    onCommit={(value) => commit(field.id as TransformFieldId, value)}
                    onReset={() => clearField(field.id)}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        );
      }) : null}
      {problem ? <p id={problemId} className="ek-inspector-field-problem" role="alert">{renderProblemMessage(i18n, problem)}</p> : null}
    </section>
  );
}
