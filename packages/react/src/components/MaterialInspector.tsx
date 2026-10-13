import {
  buildMaterialFieldsForTarget,
  buildSetMaterialCommand,
  type Editor,
  type MaterialFieldId,
  type MaterialInspectorSection,
  type MaterialInspectorTarget,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { InspectorFieldControl } from "./InspectorFieldControl";
import { useInspectorProblem } from "../hooks/use-inspector-problem";
import type { InspectorI18n } from "./inspector-i18n";
import { DEFAULT_INSPECTOR_I18N, createInspectorDispatchProblem, renderFieldLabel, renderProblemMessage, renderSectionReason, renderSectionTitle } from "./inspector-i18n";

export interface MaterialInspectorProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  section: MaterialInspectorSection;
  i18n?: InspectorI18n;
}

export function MaterialInspector({ editor, snapshot, section, i18n = DEFAULT_INSPECTOR_I18N }: MaterialInspectorProps) {
  const id = useId();
  const selectableTargets = useMemo(() => section.targets.filter((target) => target.canSelect), [section.targets]);
  const defaultTargetKey = section.activeTargetKey ?? selectableTargets[0]?.key ?? null;
  const targetsSignature = targetSignature(section);
  const selectionSignature = selectionTargetSignature(section);
  const previousSelectionSignature = useRef(selectionSignature);
  const previousDefaultTargetKey = useRef(defaultTargetKey);
  const [activeTargetKey, setActiveTargetKey] = useState<string | null>(defaultTargetKey);
  const activeTarget = section.targets.find((target) => target.key === activeTargetKey && target.canSelect) ??
    section.targets.find((target) => target.key === defaultTargetKey && target.canSelect) ??
    selectableTargets[0] ??
    null;
  const effectiveTargetKey = activeTarget?.key ?? defaultTargetKey ?? "none";
  const fields = activeTarget
    ? buildMaterialFieldsForTarget(snapshot, activeTarget, section.empty || !activeTarget.canSelect)
    : section.fields;
  const [fieldProblem, setFieldProblem, clearField] = useInspectorProblem(fields, `${selectionSignature}:${effectiveTargetKey}`);

  useEffect(() => {
    const selectionChanged = previousSelectionSignature.current !== selectionSignature;
    const previousDefault = previousDefaultTargetKey.current;
    const defaultChanged = previousDefault !== defaultTargetKey;
    previousSelectionSignature.current = selectionSignature;
    previousDefaultTargetKey.current = defaultTargetKey;
    setActiveTargetKey((current) => {
      if (selectionChanged) {
        return defaultTargetKey;
      }
      if (defaultChanged && current === previousDefault) {
        return defaultTargetKey;
      }
      if (current && section.targets.some((target) => target.key === current && target.canSelect)) {
        return current;
      }
      return defaultTargetKey;
    });
    setFieldProblem(null);
  }, [defaultTargetKey, selectionSignature, targetsSignature]);

  function commit(fieldId: MaterialFieldId, value: unknown) {
    setFieldProblem(null);
    const result = buildSetMaterialCommand(editor.getSnapshot(), fieldId, value, activeTarget);
    if (result.ok) {
      const override = activeTarget?.materialId ? editor.getSnapshot().materials.definitions[activeTarget.materialId]?.override : undefined;
      // Explicit defaults create an override; already-authored equal values do not
      // add another history entry.
      const current = override as Record<string, unknown> | undefined;
      if (current && result.command.type === "set-material" && Object.entries(result.command.material).every(([key, next]) => {
        if (key === "textures") {
          const textures = current.textures as Record<string, unknown> | undefined;
          return Object.entries(next as Record<string, unknown>).every(([slot, texture]) => JSON.stringify(textures?.[slot]) === JSON.stringify(texture));
        }
        return Object.is(current[key], next);
      })) return true;
      const dispatch = editor.dispatch(result.command);
      if (!dispatch.ok) setFieldProblem(createInspectorDispatchProblem(fieldId, i18n, dispatch.error));
      return dispatch.ok;
    } else {
      setFieldProblem(result.problem);
    }
    return result.ok;
  }

  return (
    <section className="ek-inspector-section">
      <header className="ek-inspector-section__header">
        <h2>{renderSectionTitle(i18n, section)}</h2>
      </header>
      {section.empty ? <p className="ek-inspector-empty">{renderSectionReason(i18n, section)}</p> : null}
      {!section.empty ? (
        <>
          {section.targets.length > 1 ? (
            <fieldset className="ek-material-targets" aria-label={i18n.t("reactWorkbench.inspector.material.target.label")}>
              <legend>{i18n.t("reactWorkbench.inspector.material.target.legend")}</legend>
              <div className="ek-material-target-list">
                {section.targets.map((target) => (
                  <label key={target.key} data-ek-discard-draft className="ek-material-target-option" data-unresolved={target.unresolved ? "true" : undefined}>
                    <input
                      data-ek-discard-draft
                      type="radio"
                      name={`${id}-material-target`}
                      value={target.key}
                      checked={activeTarget?.key === target.key}
                      disabled={!target.canSelect}
                      onChange={() => {
                        setActiveTargetKey(target.key);
                        setFieldProblem(null);
                      }}
                    />
                    <span className="ek-material-target-option__body">
                      <span className="ek-material-target-option__label">{target.kind === "object"
                        ? i18n.t("reactWorkbench.inspector.material.target.objectLabel")
                        : target.unresolved && !target.importedNodeId
                          ? i18n.t("reactWorkbench.inspector.material.target.staleLabel", { slot: target.slotId ?? "" })
                          : target.label}</span>
                      <span className="ek-material-target-option__meta">
                        {describeTarget(i18n, target)}
                      </span>
                      {target.disabledReason ? (
                        <span className="ek-material-target-option__reason">{target.kind === "material-slot" && target.unresolved && !target.canCreateAssignment && !target.canEditExistingAssignment
                          ? i18n.t("reactWorkbench.inspector.material.target.cannotCreate")
                          : target.disabledReason}</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {activeTarget?.unresolved ? (
            <p className="ek-inspector-warning" role="status">{i18n.t("reactWorkbench.inspector.material.target.unresolvedWarning")}</p>
          ) : null}
          <div className="ek-inspector-grid ek-material-fields">
            {fields.map((field) => (
              <label key={field.id} className={field.kind === "checkbox" ? "ek-inspector-field ek-inspector-field--checkbox" : "ek-inspector-field"}>
                <span>{renderFieldLabel(i18n, field)}</span>
                <InspectorFieldControl key={`${effectiveTargetKey}:${field.id}`} commitUnchanged field={field} invalid={fieldProblem?.fieldId === field.id} descriptionId={fieldProblem?.fieldId === field.id ? `${id}-${problemId(field.id)}` : undefined} i18n={i18n}
                  onCommit={(value) => commit(field.id as MaterialFieldId, value)} onReset={() => clearField(field.id)} />
                {fieldProblem?.fieldId === field.id ? (
                  <small id={`${id}-${problemId(field.id)}`} className="ek-inspector-field-problem" role="alert">{renderProblemMessage(i18n, fieldProblem)}</small>
                ) : null}
              </label>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function describeTarget(i18n: InspectorI18n, target: MaterialInspectorTarget): string {
  const parts = [
    target.kind === "object"
      ? i18n.t("reactWorkbench.inspector.material.target.objectOverride")
      : target.hasOverride
        ? i18n.t("reactWorkbench.inspector.material.target.slotOverride")
        : i18n.t("reactWorkbench.inspector.material.target.noOverride"),
    target.unresolved ? i18n.t("reactWorkbench.inspector.material.target.unresolved") : null
  ].filter(Boolean);
  return parts.join(" · ");
}

function problemId(fieldId: string): string {
  return `ek-material-${fieldId.replace(/[^a-z0-9_-]/gi, "-")}-problem`;
}

function targetSignature(section: MaterialInspectorSection): string {
  return section.targets
    .map((target) => `${target.key}:${target.canSelect}:${target.assignmentId}:${target.materialId}:${target.unresolved}`)
    .join("|");
}

function selectionTargetSignature(section: MaterialInspectorSection): string {
  const selected = section.targets
    .filter((target) => target.selected)
    .map((target) => `${target.ownerObjectId}:${target.importedNodeId ?? ""}:${target.slotId ?? ""}`)
    .join("|");
  const keys = section.targets.map((target) => target.key).join("|");
  return `${section.activeTargetKey ?? ""}::${selected}::${keys}`;
}
