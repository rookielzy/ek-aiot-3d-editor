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

export interface CameraInspectorProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  section: CameraInspectorSection;
  camera?: WorkbenchCameraContext;
  onActiveCameraViewIdChange(value: string | null): void;
}

export function CameraInspector({ editor, snapshot, section, camera, onActiveCameraViewIdChange }: CameraInspectorProps) {
  const targetKey = section.activeCameraViewId ?? "none";
  const activeView = section.activeCameraViewId ? snapshot.cameras[section.activeCameraViewId] : null;
  const [problem, setProblem] = useState<string | null>(null);

  function captureNewView() {
    const captured = camera?.capture({ name: nextCameraViewName(snapshot) });
    if (!captured) {
      setProblem("Camera capture unavailable.");
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
        setProblem(dispatch.error ?? "Camera view create failed.");
      }
    } else {
      setProblem(result.problem.message);
    }
  }

  function updateFromRuntime() {
    if (!section.activeCameraViewId) {
      return;
    }
    const captured = camera?.capture({ name: activeView?.name });
    if (!captured) {
      setProblem("Camera capture unavailable.");
      return;
    }
    const { id: _id, name: _name, metadata: _metadata, ...patch } = captured;
    const result = editor.dispatch({
      type: "update-camera-view",
      viewId: section.activeCameraViewId,
      patch
    });
    setProblem(result.ok ? null : result.error ?? "Camera view update failed.");
  }

  function applyActive() {
    if (!activeView || !camera?.apply(activeView)) {
      setProblem("Camera apply unavailable.");
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
      setProblem(result.problem.message);
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
      setProblem(result.problem.message);
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
      setProblem(result.problem.message);
    }
  }

  return (
    <section className="ek-inspector-section">
      <header className="ek-inspector-section__header">
        <h2>Camera views</h2>
        <button type="button" className="ek-inspector-compact-action" onClick={captureNewView} disabled={!section.canCapture}>
          Capture
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
              <small>{view.default ? `Default · ${view.summary}` : view.summary}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="ek-inspector-empty">{section.reason}</p>
      )}
      {problem ? <p className="ek-inspector-warning">{problem}</p> : null}
      {section.activeCameraViewId ? (
        <div className="ek-inspector-grid">
          <div className="ek-inspector-button-row">
            <button type="button" onClick={applyActive} disabled={!section.canApply}>
              Apply
            </button>
            <button type="button" onClick={updateFromRuntime} disabled={!section.canCapture}>
              Update
            </button>
            {section.defaultCameraViewId === section.activeCameraViewId ? (
              <button type="button" onClick={() => setDefault(null)}>
                Clear default
              </button>
            ) : (
              <button type="button" onClick={() => setDefault(section.activeCameraViewId)}>
                Set default
              </button>
            )}
          </div>
          {section.fields.map((field) => (
            <label key={field.id} className="ek-inspector-field">
              <span>{field.label}</span>
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
            Delete view
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
