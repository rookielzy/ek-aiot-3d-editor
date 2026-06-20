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
  const selection = inspector.selection;
  const selectedLabel = selection.cameraView?.name ?? selection.light?.name ?? selection.object?.name ?? selection.node?.name ?? selection.nodeId;
  const problemTone = problemToneFromSeverities(inspector.problems.problems);

  return (
    <aside className={className ? `ek-inspector ${className}` : "ek-inspector"} aria-label={i18n.t("reactWorkbench.inspector.scene.label")}>
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
      <TransformInspector editor={editor} snapshot={snapshot} section={inspector.transform} i18n={i18n} />
      <MaterialInspector editor={editor} snapshot={snapshot} section={inspector.material} i18n={i18n} />
      <EnvironmentInspector editor={editor} snapshot={snapshot} section={inspector.environment} i18n={i18n} />
      <LightInspector editor={editor} snapshot={snapshot} section={inspector.lights} i18n={i18n} onActiveLightIdChange={setActiveLightId} />
      <CameraInspector
        editor={editor}
        snapshot={snapshot}
        section={inspector.cameras}
        camera={camera}
        i18n={i18n}
        onActiveCameraViewIdChange={setActiveCameraViewId ?? (() => {})}
      />
      <ProblemsPanel section={inspector.problems} i18n={i18n} onReplaceAsset={onReplaceAsset} />
    </aside>
  );
}
