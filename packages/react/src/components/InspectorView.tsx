import { useId, useState } from "react";
import type { Editor, InspectorModel, SceneSnapshot } from "@ek-aiot/3d-editor-core";
import type { WorkbenchCameraContext } from "../hooks/use-workbench";
import { CameraInspector } from "./CameraInspector";
import { EnvironmentInspector } from "./EnvironmentInspector";
import { LightInspector } from "./LightInspector";
import { MaterialInspector } from "./MaterialInspector";
import { ProblemsPanel } from "./ProblemsPanel";
import { TransformInspector } from "./TransformInspector";
import { DEFAULT_INSPECTOR_I18N, type InspectorI18n } from "./inspector-i18n";
import { problemToneFromSeverities } from "./workbench-model-helpers";
import "./inspector.css";

export interface InspectorViewProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  inspector: InspectorModel;
  setActiveLightId(value: string | null): void;
  setActiveCameraViewId?(value: string | null): void;
  camera?: WorkbenchCameraContext;
  i18n?: InspectorI18n;
  onReplaceAsset?(assetId: string, file: File): void | Promise<void>;
  className?: string;
}

export function InspectorView({ editor, snapshot, inspector, setActiveLightId, setActiveCameraViewId, camera, i18n = DEFAULT_INSPECTOR_I18N, onReplaceAsset, className }: InspectorViewProps) {
  const [activeGroup, setActiveGroup] = useState<"object" | "environment" | "scene">("object");
  const id = useId();
  const groups = ["object", "environment", "scene"] as const;
  const selection = inspector.selection;
  const showSelectedLight = activeGroup === "object" && selection.count === 1 && !!selection.light;
  const showSelectedCamera = activeGroup === "object" && selection.count === 1 && !!selection.cameraView;
  const lightInspector = <LightInspector key="light" editor={editor} snapshot={snapshot} section={inspector.lights} i18n={i18n} onActiveLightIdChange={setActiveLightId} />;
  const cameraInspector = (
    <CameraInspector
      key="camera"
      editor={editor}
      snapshot={snapshot}
      section={inspector.cameras}
      camera={camera}
      i18n={i18n}
      onActiveCameraViewIdChange={setActiveCameraViewId ?? (() => {})}
    />
  );
  const selectedLabel = selection.cameraView?.name ?? selection.light?.name ?? selection.node?.name ?? selection.object?.name ?? selection.nodeId;
  const problemTone = problemToneFromSeverities(inspector.problems.problems);

  return (
    <aside className={className ? `ek-inspector ${className}` : "ek-inspector"} aria-label={i18n.t("reactWorkbench.inspector.scene.label")}>
      <div className="ek-inspector-tabs" role="tablist" aria-label={i18n.t("reactWorkbench.inspector.groups.label")}>
        {groups.map((group, index) => (
          <button
            key={group}
            id={`${id}-tab-${group}`}
            type="button"
            role="tab"
            aria-selected={activeGroup === group}
            aria-controls={`${id}-panel-${group}`}
            tabIndex={activeGroup === group ? 0 : -1}
            onClick={() => setActiveGroup(group)}
            onKeyDown={(event) => {
              const next = event.key === "ArrowRight" ? (index + 1) % groups.length
                : event.key === "ArrowLeft" ? (index + groups.length - 1) % groups.length
                : event.key === "Home" ? 0 : event.key === "End" ? groups.length - 1 : null;
              if (next === null) return;
              event.preventDefault();
              setActiveGroup(groups[next]!);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
            }}
          >
            {i18n.t(`reactWorkbench.inspector.groups.${group}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel-object`} aria-labelledby={`${id}-tab-object`} hidden={activeGroup !== "object"}>
        <header className="ek-inspector-summary" data-problem-tone={problemTone}>
          <div className="ek-inspector-summary__copy">
            <span>{i18n.t("reactWorkbench.inspector.summary.selection.label")}</span>
            <strong>
              {selectedLabel
                ? i18n.t("reactWorkbench.inspector.summary.selection.named", { label: selectedLabel })
                : i18n.t("reactWorkbench.inspector.summary.selection.empty")}
            </strong>
          </div>
          <dl className="ek-inspector-summary__meta">
            <div>
              <dt>{i18n.t("reactWorkbench.inspector.summary.nodes.label")}</dt>
              <dd>{selection.count}</dd>
            </div>
            <div>
              <dt>{i18n.t("reactWorkbench.inspector.summary.kind.label")}</dt>
              <dd>{selection.nodeKind ?? i18n.t("reactWorkbench.inspector.summary.kind.none")}</dd>
            </div>
            <div>
              <dt>{i18n.t("reactWorkbench.inspector.summary.problems.label")}</dt>
              <dd>{inspector.problems.problems.length}</dd>
            </div>
          </dl>
        </header>
        {!selection.light && !selection.cameraView ? <TransformInspector key={`transform:${selection.nodeId}`} editor={editor} snapshot={snapshot} section={inspector.transform} i18n={i18n} /> : null}
        {!selection.light && !selection.cameraView ? <MaterialInspector key={`material:${selection.nodeId}`} editor={editor} snapshot={snapshot} section={inspector.material} i18n={i18n} /> : null}
        {showSelectedLight ? lightInspector : null}
        {showSelectedCamera ? cameraInspector : null}
      </div>
      <div role="tabpanel" id={`${id}-panel-environment`} aria-labelledby={`${id}-tab-environment`} hidden={activeGroup !== "environment"}>
        <EnvironmentInspector editor={editor} snapshot={snapshot} section={inspector.environment} i18n={i18n} />
      </div>
      <div role="tabpanel" id={`${id}-panel-scene`} aria-labelledby={`${id}-tab-scene`} hidden={activeGroup !== "scene"}>
        {!showSelectedLight ? lightInspector : null}
        {!showSelectedCamera ? cameraInspector : null}
      </div>
      <ProblemsPanel section={inspector.problems} i18n={i18n} onReplaceAsset={onReplaceAsset} />
    </aside>
  );
}
