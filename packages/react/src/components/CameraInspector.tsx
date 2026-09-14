import { useEffect, useState } from "react";
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
  type InspectorCommandProblem,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchCameraContext } from "../hooks/use-workbench";
import { SceneInspectorFields } from "./SceneInspectorFields";
import type { InspectorI18n } from "./inspector-i18n";
import { DEFAULT_INSPECTOR_I18N, renderProblemMessage, renderSectionReason, renderSectionTitle } from "./inspector-i18n";

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

  const [fieldProblem, setFieldProblem] = useState<InspectorCommandProblem | null>(null);
  useEffect(() => { setProblem(null); setFieldProblem(null); }, [targetKey]);

  function selectCameraView(viewId: string | null) {
    onActiveCameraViewIdChange(viewId);
    const target = Object.values(editor.getSnapshot().nodes).find((node) => node.kind === "camera" && node.cameraId === viewId);
    if (target) editor.dispatch({ type: "select-node", nodeId: target.id });
  }

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
        selectCameraView(view?.id ?? null);
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
      const dispatch = editor.dispatch(result.command);
      setProblem(dispatch.ok ? null : dispatch.error ?? i18n.t("reactWorkbench.inspector.camera.updateFailed.message"));
    } else {
      setProblem(renderProblemMessage(i18n, result.problem));
    }
  }

  function commit(fieldId: CameraViewFieldId, value: string) {
    if (!section.activeCameraViewId) return false;
    const result = buildUpdateCameraViewCommand(editor.getSnapshot(), section.activeCameraViewId, fieldId, value);
    if (!result.ok) {
      setFieldProblem(result.problem);
      return false;
    }
    const dispatch = editor.dispatch(result.command);
    setFieldProblem(dispatch.ok ? null : { code: "inspector-camera-dispatch-failed", fieldId, message: dispatch.error ?? i18n.t("reactWorkbench.inspector.camera.updateFailed.message"), severity: "warning" });
    setProblem(null);
    return dispatch.ok;
  }

  function removeActive() {
    if (!section.activeCameraViewId) {
      return;
    }
    const nextActiveViewId = getNextActiveCameraViewId(snapshot, section.activeCameraViewId);
    const result = buildDeleteCameraViewCommand(snapshot, section.activeCameraViewId);
    if (result.ok) {
      const dispatch = editor.dispatch(result.command);
      if (dispatch.ok) {
        selectCameraView(nextActiveViewId);
        setProblem(null);
      } else {
        setProblem(dispatch.error ?? i18n.t("reactWorkbench.inspector.camera.updateFailed.message"));
      }
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
              aria-pressed={view.active}
              className={view.active ? "is-active" : ""}
              data-default={view.default ? "true" : "false"}
              onClick={() => selectCameraView(view.id)}
            >
              <span>{view.label}</span>
              <small>{view.default ? `${i18n.t("reactWorkbench.inspector.camera.default.label")} · ${view.summary}` : view.summary}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="ek-inspector-empty">{renderSectionReason(i18n, section)}</p>
      )}
      {problem ? <p className="ek-inspector-warning" role="alert">{problem}</p> : null}
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
          <SceneInspectorFields fields={section.fields} targetKey={targetKey} problem={fieldProblem} i18n={i18n}
            onCommit={(fieldId, value) => commit(fieldId as CameraViewFieldId, value)} />
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
