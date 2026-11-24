import { useEffect, useState, useSyncExternalStore } from "react";
import { getSelectedNodeForMotion, type Editor, type EditorRuntime, type InspectorModel, type NodeMotionPreviewState, type SceneSnapshot } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext, WorkbenchCameraContext } from "../hooks/use-workbench";
import { resolveDataDisplayMessage } from "../i18n/data-display-i18n";
import { CameraInspector } from "./CameraInspector";
import { DataBindingInspector } from "./DataBindingInspector";
import { DataDisplayInspector } from "./DataDisplayInspector";
import type { DataDisplayRealtimeContext } from "../hooks/use-data-display-realtime";
import { EnvironmentInspector } from "./EnvironmentInspector";
import { InspectorTabs } from "./InspectorTabs";
import { LightInspector } from "./LightInspector";
import { MaterialInspector } from "./MaterialInspector";
import { NodeMotionInspector } from "./NodeMotionInspector";
import { ProblemsPanel } from "./ProblemsPanel";
import { TransformInspector } from "./TransformInspector";
import { DEFAULT_INSPECTOR_I18N, renderSectionTitle, type InspectorI18n } from "./inspector-i18n";
import { problemToneFromSeverities } from "./workbench-model-helpers";
import "./inspector.css";

export interface InspectorViewProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  inspector: InspectorModel;
  setActiveLightId(value: string | null): void;
  setActiveCameraViewId?(value: string | null): void;
  camera?: WorkbenchCameraContext;
  dataContext?: ResolvedWorkbenchContext;
  dataDisplays?: DataDisplayRealtimeContext;
  runtime?: EditorRuntime | null;
  visible?: boolean;
  i18n?: InspectorI18n;
  onReplaceAsset?(assetId: string, file: File): void | Promise<void>;
  className?: string;
}

export function InspectorView({ editor, snapshot, inspector, setActiveLightId, setActiveCameraViewId, camera, dataContext, dataDisplays, runtime = null, visible = true, i18n = DEFAULT_INSPECTOR_I18N, onReplaceAsset, className }: InspectorViewProps) {
  const [activeGroup, setActiveGroup] = useState("object");
  const [objectTab, setObjectTab] = useState("transform");
  const selection = inspector.selection;
  const motionNode = getSelectedNodeForMotion(snapshot);
  const motionState = useSyncExternalStore<NodeMotionPreviewState>(
    (subscribe) => runtime?.subscribeNodeMotionPreview?.(subscribe) ?? (() => {}),
    () => (motionNode && runtime?.getNodeMotionPreviewState?.(motionNode.id)) || "unavailable",
    () => "unavailable"
  );
  const selectedCardId = selection.node?.kind === "data-display" ? selection.node.id : null;
  const hasDataDisplays = Boolean(dataDisplays);
  useEffect(() => {
    if (selectedCardId && hasDataDisplays) setActiveGroup("dataDisplay");
  }, [selectedCardId, hasDataDisplays]);
  const selectedLight = selection.count === 1 && !!selection.light;
  const selectedCamera = selection.count === 1 && !!selection.cameraView;
  const lightsLabel = renderSectionTitle(i18n, inspector.lights);
  const camerasLabel = renderSectionTitle(i18n, inspector.cameras);
  const lightInspector = <LightInspector editor={editor} snapshot={snapshot} section={inspector.lights} i18n={i18n} onActiveLightIdChange={setActiveLightId} />;
  const cameraInspector = (
    <CameraInspector
      editor={editor}
      snapshot={snapshot}
      section={inspector.cameras}
      camera={camera}
      i18n={i18n}
      onActiveCameraViewIdChange={setActiveCameraViewId ?? (() => {})}
    />
  );
  const objectTabs = selectedLight ? [{ id: "lights", label: lightsLabel, content: activeGroup === "object" && lightInspector }]
    : selectedCamera ? [{ id: "cameras", label: camerasLabel, content: activeGroup === "object" && cameraInspector }]
    : selection.light || selection.cameraView ? []
    : [
      {
        id: "transform",
        label: renderSectionTitle(i18n, inspector.transform),
        content: <TransformInspector key={selection.nodeId} editor={editor} snapshot={snapshot} section={inspector.transform} locked={dataContext?.dataState.preview.enabled || motionState === "playing"} i18n={i18n} />
      },
      {
        id: "material",
        label: renderSectionTitle(i18n, inspector.material),
        content: <MaterialInspector key={selection.nodeId} editor={editor} snapshot={snapshot} section={inspector.material} locked={dataContext?.dataState.preview.enabled} i18n={i18n} />
      }
    ];
  if (motionNode && (motionNode.motion || motionState !== "target-not-transformable")) {
    objectTabs.push({
      id: "motion",
      label: i18n.t("inspector.motion.tab"),
      content: visible && activeGroup === "object" && objectTab === "motion" &&
        <NodeMotionInspector key={motionNode.id} editor={editor} runtime={runtime} nodeId={motionNode.id}
          motion={motionNode.motion} state={motionState} i18n={i18n} />
    });
  }
  if (dataContext) {
    objectTabs.push({
      id: "data",
      label: i18n.t("dataBinding.section.label"),
      content: <DataBindingInspector context={dataContext} />
    });
  }
  const selectedLabel = selection.cameraView?.name ?? selection.light?.name ?? selection.node?.name ?? selection.object?.name ?? selection.nodeId;
  const problemTone = problemToneFromSeverities(inspector.problems.problems);

  const objectPanel = (
    <>
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
      <InspectorTabs secondary label={i18n.t("reactWorkbench.inspector.groups.object")} tabs={objectTabs} value={objectTab} onChange={setObjectTab} />
    </>
  );
  const scenePanel = (
    <InspectorTabs secondary label={i18n.t("reactWorkbench.inspector.groups.scene")} tabs={[
      { id: "lights", label: lightsLabel, content: (activeGroup !== "object" || !selectedLight) && lightInspector },
      { id: "cameras", label: camerasLabel, content: (activeGroup !== "object" || !selectedCamera) && cameraInspector },
      {
        id: "problems",
        label: renderSectionTitle(i18n, inspector.problems),
        content: <ProblemsPanel section={inspector.problems} i18n={i18n} onReplaceAsset={onReplaceAsset} />
      }
    ]} />
  );

  return (
    <aside className={className ? `ek-inspector ${className}` : "ek-inspector"} aria-label={i18n.t("reactWorkbench.inspector.scene.label")}>
      <InspectorTabs label={i18n.t("reactWorkbench.inspector.groups.label")} value={activeGroup} onChange={setActiveGroup} tabs={[
        { id: "object", label: i18n.t("reactWorkbench.inspector.groups.object"), content: objectPanel },
        {
          id: "environment",
          label: i18n.t("reactWorkbench.inspector.groups.environment"),
          content: <EnvironmentInspector editor={editor} snapshot={snapshot} section={inspector.environment} i18n={i18n} />
        },
        { id: "scene", label: i18n.t("reactWorkbench.inspector.groups.scene"), content: scenePanel },
        ...(dataContext && dataDisplays ? [{
          id: "dataDisplay",
          label: resolveDataDisplayMessage(i18n, "dataDisplay.section"),
          content: <DataDisplayInspector context={dataContext} data={dataDisplays} active={activeGroup === "dataDisplay"} />
        }] : [])
      ]} />
    </aside>
  );
}
