import { useState } from "react";
import {
  buildCreateCameraViewCommand,
  buildCreateCameraViewInput,
  buildDeleteCameraViewCommand,
  buildSetDefaultCameraViewCommand,
  buildUpdateCameraViewCommand,
  getNextActiveCameraViewId,
  type CameraInspectorSection,
  type CameraViewFieldId,
  type Editor,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchCameraContext } from "../hooks/use-workbench";
import type { InspectorI18n } from "./inspector-i18n";
import { DEFAULT_INSPECTOR_I18N, renderFieldLabel, renderProblemMessage, renderSectionReason, renderSectionTitle } from "./inspector-i18n";

export interface CameraInspectorProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  section: CameraInspectorSection;
  camera?: WorkbenchCameraContext;
  i18n?: InspectorI18n;
  onActiveCameraViewIdChange(value: string | null): void;
}

export function CameraInspector({ editor, snapshot, section, camera, i18n = DEFAULT_INSPECTOR_I18N, onActiveCameraViewIdChange }: CameraInspectorProps) {
  const targetKey = section.activeCameraViewId ?? "none";
  const activeView = section.activeCameraViewId ? snapshot.cameras[section.activeCameraViewId] : null;
  const [problem, setProblem] = useState<string | null>(null);

  function captureNewView() {
    const captured = camera?.capture({ name: nextCameraViewName(snapshot) });
    if (!captured) {
      setProblem(i18n.t("reactWorkbench.inspector.camera.captureUnavailable.message"));
      return;
    }
    const view = buildCreateCameraViewInput(snapshot, captured);
    const result = buildCreateCameraViewCommand(view);
    if (result.ok) {
      const dispatch = editor.dispatch(result.command);
      if (dispatch.ok) {
        onActiveCameraViewIdChange(view?.id ?? null);
        setProblem(null);
      } else {
        setProblem(dispatch.error ?? i18n.t("reactWorkbench.inspector.camera.createFailed.message"));
      }
    } else {
      setProblem(renderProblemMessage(i18n, result.problem));
    }
  }

  function updateFromRuntime() {
    if (!section.activeCameraViewId) {
      return;
    }
    const captured = camera?.capture({ name: activeView?.name });
    if (!captured) {
      setProblem(i18n.t("reactWorkbench.inspector.camera.captureUnavailable.message"));
      return;
    }
    const { id: _id, name: _name, metadata: _metadata, ...patch } = captured;
    const result = editor.dispatch({
      type: "update-camera-view",
      viewId: section.activeCameraViewId,
      patch
    });
    setProblem(result.ok ? null : result.error ?? i18n.t("reactWorkbench.inspector.camera.updateFailed.message"));
  }

  function applyActive() {
    if (!activeView || !camera?.apply(activeView)) {
      setProblem(i18n.t("reactWorkbench.inspector.camera.applyUnavailable.message"));
      return;
    }
    setProblem(null);
  }

  function setDefault(viewId: string | null) {
    const result = buildSetDefaultCameraViewCommand(snapshot, viewId);
    if (result.ok) {
      editor.dispatch(result.command);
      setProblem(null);
    } else {
      setProblem(renderProblemMessage(i18n, result.problem));
    }
  }

  function commit(fieldId: CameraViewFieldId, value: string) {
    if (!section.activeCameraViewId) {
      return;
    }
    const result = buildUpdateCameraViewCommand(snapshot, section.activeCameraViewId, fieldId, value);
    if (result.ok) {
      editor.dispatch(result.command);
      setProblem(null);
    } else {
      setProblem(renderProblemMessage(i18n, result.problem));
    }
  }

  function removeActive() {
    if (!section.activeCameraViewId) {
      return;
    }
    const nextActiveViewId = getNextActiveCameraViewId(snapshot, section.activeCameraViewId);
    const result = buildDeleteCameraViewCommand(snapshot, section.activeCameraViewId);
    if (result.ok) {
      editor.dispatch(result.command);
      onActiveCameraViewIdChange(nextActiveViewId);
      setProblem(null);
    } else {
      setProblem(renderProblemMessage(i18n, result.problem));
    }
  }

  return (
    <section className="ek-inspector-section">
      <header className="ek-inspector-section__header">
        <h2>{renderSectionTitle(i18n, section)}</h2>
        <button type="button" className="ek-inspector-compact-action" onClick={captureNewView} disabled={!section.canCapture}>
          {i18n.t("reactWorkbench.inspector.camera.capture.label")}
        </button>
      </header>
      {section.cameraViews.length ? (
        <div className="ek-inspector-camera-list" role="list">
          {section.cameraViews.map((view) => (
            <button
              key={view.id}
              type="button"
              className={view.active ? "is-active" : ""}
              data-default={view.default ? "true" : "false"}
              onClick={() => onActiveCameraViewIdChange(view.id)}
            >
              <span>{view.label}</span>
              <small>{view.default ? `${i18n.t("reactWorkbench.inspector.camera.default.label")} · ${view.summary}` : view.summary}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="ek-inspector-empty">{renderSectionReason(i18n, section)}</p>
      )}
      {problem ? <p className="ek-inspector-warning">{problem}</p> : null}
      {section.activeCameraViewId ? (
        <div className="ek-inspector-grid">
          <div className="ek-inspector-button-row">
            <button type="button" onClick={applyActive} disabled={!section.canApply}>
              {i18n.t("reactWorkbench.inspector.camera.apply.label")}
            </button>
            <button type="button" onClick={updateFromRuntime} disabled={!section.canCapture}>
              {i18n.t("reactWorkbench.inspector.camera.update.label")}
            </button>
            {section.defaultCameraViewId === section.activeCameraViewId ? (
              <button type="button" onClick={() => setDefault(null)}>
                {i18n.t("reactWorkbench.inspector.camera.clearDefault.label")}
              </button>
            ) : (
              <button type="button" onClick={() => setDefault(section.activeCameraViewId)}>
                {i18n.t("reactWorkbench.inspector.camera.setDefault.label")}
              </button>
            )}
          </div>
          {section.fields.map((field) => (
            <label key={field.id} className="ek-inspector-field">
              <span>{renderFieldLabel(i18n, field)}</span>
              <input
                key={`${targetKey}:${field.id}:${String(field.value)}`}
                defaultValue={String(field.value)}
                type={field.kind === "number" ? "number" : "text"}
                min={field.min}
                max={field.max}
                step={field.step ?? 0.01}
                onBlur={(event) => commit(field.id as CameraViewFieldId, event.currentTarget.value)}
              />
            </label>
          ))}
          <button className="ek-inspector-danger" type="button" onClick={removeActive}>
            {i18n.t("reactWorkbench.inspector.camera.delete.label")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function nextCameraViewName(snapshot: SceneSnapshot): string {
  const count = Object.keys(snapshot.cameras).length + 1;
  return `Camera view ${count}`;
}
