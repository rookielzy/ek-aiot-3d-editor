import {
  buildMaterialFieldsForTarget,
  buildSetMaterialCommand,
  type Editor,
  type InspectorCommandProblem,
  type MaterialFieldId,
  type MaterialInspectorSection,
  type MaterialInspectorTarget,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { InspectorI18n } from "./inspector-i18n";
import { DEFAULT_INSPECTOR_I18N, renderFieldLabel, renderOptionLabel, renderProblemMessage, renderSectionReason, renderSectionTitle } from "./inspector-i18n";

export interface MaterialInspectorProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  section: MaterialInspectorSection;
  i18n?: InspectorI18n;
}

export function MaterialInspector({ editor, snapshot, section, i18n = DEFAULT_INSPECTOR_I18N }: MaterialInspectorProps) {
  const selectableTargets = useMemo(() => section.targets.filter((target) => target.canSelect), [section.targets]);
  const defaultTargetKey = section.activeTargetKey ?? selectableTargets[0]?.key ?? null;
  const targetsSignature = targetSignature(section);
  const selectionSignature = selectionTargetSignature(section);
  const previousSelectionSignature = useRef(selectionSignature);
  const previousDefaultTargetKey = useRef(defaultTargetKey);
  const [activeTargetKey, setActiveTargetKey] = useState<string | null>(defaultTargetKey);
  const [fieldProblem, setFieldProblem] = useState<InspectorCommandProblem | null>(null);
  const activeTarget = section.targets.find((target) => target.key === activeTargetKey && target.canSelect) ??
    section.targets.find((target) => target.key === defaultTargetKey && target.canSelect) ??
    selectableTargets[0] ??
    null;
  const effectiveTargetKey = activeTarget?.key ?? defaultTargetKey ?? "none";
  const fields = activeTarget
    ? buildMaterialFieldsForTarget(snapshot, activeTarget, section.empty || !activeTarget.canSelect)
    : section.fields;

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
    if (value === "" && !fieldId.startsWith("textures.")) {
      return;
    }
    setFieldProblem(null);
    const result = buildSetMaterialCommand(snapshot, fieldId, value, activeTarget);
    if (result.ok) {
      editor.dispatch(result.command);
    } else {
      setFieldProblem(result.problem);
    }
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
                  <label key={target.key} className="ek-material-target-option" data-unresolved={target.unresolved ? "true" : undefined}>
                    <input
                      type="radio"
                      name="ek-material-target"
                      value={target.key}
                      checked={activeTarget?.key === target.key}
                      disabled={!target.canSelect}
                      onChange={() => {
                        setActiveTargetKey(target.key);
                        setFieldProblem(null);
                      }}
                    />
                    <span className="ek-material-target-option__body">
                      <span className="ek-material-target-option__label">{target.label}</span>
                      <span className="ek-material-target-option__meta">
                        {describeTarget(i18n, target)}
                      </span>
                      {target.disabledReason ? (
                        <span className="ek-material-target-option__reason">{target.disabledReason}</span>
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
          <div className="ek-inspector-grid">
            {fields.map((field) => (
              <label key={field.id} className="ek-inspector-field">
                <span>{renderFieldLabel(i18n, field)}</span>
                {field.kind === "number" ? (
                  <input
                    key={`${effectiveTargetKey}:${field.id}:${String(field.value)}`}
                    defaultValue={String(field.value)}
                    disabled={field.disabled}
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step ?? 0.01}
                    aria-invalid={fieldProblem?.fieldId === field.id ? true : undefined}
                    aria-describedby={fieldProblem?.fieldId === field.id ? problemId(field.id) : undefined}
                    onBlur={(event) => commit(field.id as MaterialFieldId, event.currentTarget.value)}
                  />
                ) : field.kind === "color" ? (
                  <input
                    key={`${effectiveTargetKey}:${field.id}:${String(field.value)}`}
                    defaultValue={String(field.value)}
                    disabled={field.disabled}
                    type="color"
                    aria-invalid={fieldProblem?.fieldId === field.id ? true : undefined}
                    aria-describedby={fieldProblem?.fieldId === field.id ? problemId(field.id) : undefined}
                    onChange={(event) => commit(field.id as MaterialFieldId, event.currentTarget.value)}
                  />
                ) : field.kind === "checkbox" ? (
                  <input
                    key={`${effectiveTargetKey}:${field.id}:${String(field.value)}`}
                    defaultChecked={Boolean(field.value)}
                    disabled={field.disabled}
                    type="checkbox"
                    aria-invalid={fieldProblem?.fieldId === field.id ? true : undefined}
                    aria-describedby={fieldProblem?.fieldId === field.id ? problemId(field.id) : undefined}
                    onChange={(event) => commit(field.id as MaterialFieldId, event.currentTarget.checked)}
                  />
                ) : (
                  <select
                    key={`${effectiveTargetKey}:${field.id}:${String(field.value)}`}
                    defaultValue={String(field.value)}
                    disabled={field.disabled}
                    aria-invalid={fieldProblem?.fieldId === field.id ? true : undefined}
                    aria-describedby={fieldProblem?.fieldId === field.id ? problemId(field.id) : undefined}
                    onChange={(event) => commit(field.id as MaterialFieldId, event.currentTarget.value)}
                  >
                    {field.kind === "asset" ? <option value="">{i18n.t("reactWorkbench.inspector.field.asset.none")}</option> : null}
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {renderOptionLabel(i18n, option)}
                      </option>
                    ))}
                  </select>
                )}
                {fieldProblem?.fieldId === field.id ? (
                  <small id={problemId(field.id)} className="ek-inspector-field-problem" role="alert">{renderProblemMessage(i18n, fieldProblem)}</small>
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
