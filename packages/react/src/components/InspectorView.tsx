import type { Editor, InspectorModel, SceneSnapshot } from "@ek-aiot/3d-editor-core";
import type { WorkbenchCameraContext } from "../hooks/use-workbench";
import { CameraInspector } from "./CameraInspector";
import { EnvironmentInspector } from "./EnvironmentInspector";
import { LightInspector } from "./LightInspector";
import { MaterialInspector } from "./MaterialInspector";
import { ProblemsPanel } from "./ProblemsPanel";
import { TransformInspector } from "./TransformInspector";
import { DEFAULT_INSPECTOR_I18N, type InspectorI18n } from "./inspector-i18n";
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
  return (
    <aside className={className ? `ek-inspector ${className}` : "ek-inspector"} aria-label={i18n.t("reactWorkbench.inspector.scene.label")}>
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
