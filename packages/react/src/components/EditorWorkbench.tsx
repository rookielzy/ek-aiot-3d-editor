import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { buildWorkbenchModel, resolveEditorShortcut, type EditorAction, type Problem, type AssetResolverBridge, type EditorRuntime, type EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";
import { useWorkbench, type ResolvedWorkbenchContext, type UseWorkbenchOptions } from "../hooks/use-workbench";
import { EditorViewport } from "./EditorViewport";
import { DataDetailCard } from "./DataDetailCard";
import { DataPreviewControls } from "./DataPreviewControls";
import { InspectorView } from "./InspectorView";
import { WorkbenchLeftPanel, type WorkbenchPanelView } from "./WorkbenchLeftPanel";
import { WorkbenchNavigation } from "./WorkbenchNavigation";
import { WorkbenchPanelResize } from "./WorkbenchPanelResize";
import { useWorkbenchPanelWidths } from "../hooks/use-workbench-panel-widths";
import { WorkbenchStatusBar } from "./WorkbenchStatusBar";
import { WorkbenchToolbar } from "./WorkbenchToolbar";
import { WorkbenchViewportTools } from "./WorkbenchViewportTools";
import { closeTopLayer } from "./ui/command-layer";
import type { PanelLocateRequest, ProblemLocateRequest } from "./problem-locate";
import { createWorkbenchRenderer } from "./workbench-renderer";
import "./workbench.css";

export type WorkbenchRenderRegion = (context: ResolvedWorkbenchContext) => ReactNode;
export type WorkbenchRegionName = "toolbar" | "leftPanel" | "sidePanel" | "viewportOverlay" | "rightPanel" | "status";

const DEFAULT_WORKBENCH_INTERACTIONS = {
  camera: true,
  pointerSelection: true,
  marqueeSelection: false,
  resize: true,
  selectionVisuals: true,
  transform: true,
  viewportHelpers: true
} satisfies EditorRuntimeOptions["interactions"];

export interface EditorWorkbenchProps extends UseWorkbenchOptions {
  resolver?: AssetResolverBridge;
  loader?: EditorRuntimeOptions["loader"];
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
  interactions?: EditorRuntimeOptions["interactions"];
  showDefaultToolbar?: boolean;
  showLocaleSwitcher?: boolean;
  localeSwitcherDisabled?: boolean;
  onRuntimeReady?(runtime: EditorRuntime | null): void;
  className?: string;
  style?: CSSProperties;
  viewportClassName?: string;
  inspectorClassName?: string;
  toolbar?: WorkbenchRenderRegion;
  leftPanel?: WorkbenchRenderRegion;
  /**
   * @deprecated Use leftPanel for the install-ready workbench's left project panel.
   */
  sidePanel?: WorkbenchRenderRegion;
  rightPanel?: WorkbenchRenderRegion;
  viewportOverlay?: WorkbenchRenderRegion;
  status?: WorkbenchRenderRegion;
}

export function EditorWorkbench({
  editor: providedEditor,
  snapshot,
  credentials,
  executor,
  locale,
  defaultLocale,
  onLocaleChange,
  translate,
  resolver,
  loader,
  rendererFactory = createWorkbenchRenderer,
  interactions = DEFAULT_WORKBENCH_INTERACTIONS,
  showDefaultToolbar = true,
  showLocaleSwitcher = true,
  localeSwitcherDisabled = false,
  onRuntimeReady,
  className,
  style,
  viewportClassName,
  inspectorClassName,
  toolbar,
  leftPanel,
  sidePanel,
  rightPanel,
  viewportOverlay,
  status
}: EditorWorkbenchProps) {
  const session = useWorkbench({
    editor: providedEditor,
    snapshot,
    credentials,
    executor,
    loader,
    locale,
    defaultLocale,
    onLocaleChange,
    translate
  });
  const [projectFeedback, setProjectFeedback] = useState<{ editor: typeof session.editor; problems: Problem[] } | null>(null);
  const projectProblems = projectFeedback?.editor === session.editor ? projectFeedback.problems.filter((problem) => {
    if (problem.assetId && (problem.code === "project-export-payload-missing" || problem.code === "project-export-asset-missing")) {
      return session.model.assets.workspace?.items.some((asset) => asset.id === problem.assetId && asset.packageBlocking);
    }
    return true;
  }) : [];
  const model = projectProblems.length ? buildWorkbenchModel(session.snapshot, {
    inspector: session.inspector,
    runtimeProblems: session.runtimeProblems,
    projectProblems,
    assetPayloads: session.assets.payloads,
    dataCredentials: session.editor.getDataCredentials?.() ?? [],
    dataState: session.dataState,
    history: session.historyState,
    snap: session.snap,
    viewportHelpers: session.viewportHelperState,
    transformMode: session.transformMode,
    runtimeReady: session.runtimeReady
  }) : session.model;
  const workbench = { ...session, model, problems: {
    ...session.problems, items: model.problems.items, totalCount: model.problems.totalCount
  } };
  const pendingDisposeRef = useRef<{ dispose(): void; timer: ReturnType<typeof setTimeout> } | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const panelId = useId();
  const [activeView, setActiveView] = useState<WorkbenchPanelView>("scene");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [dataLocate, setDataLocate] = useState<{ connectionId: string; queryId: string } | null>(null);
  const [dataDetailFocus, setDataDetailFocus] = useState<{ nodeId: string; propertyKey?: string } | null>(null);
  const [panelFocus, setPanelFocus] = useState<PanelLocateRequest | null>(null);
  const [objectOperationNotice, setObjectOperationNotice] = useState<string | null>(null);
  const panels = useWorkbenchPanelWidths(rootRef);
  const [marqueeSelectionEnabled, setMarqueeSelectionEnabled] = useState(false);
  const resolvedInteractions = useMemo(() => {
    if (interactions !== DEFAULT_WORKBENCH_INTERACTIONS) {
      return interactions;
    }
    return { ...DEFAULT_WORKBENCH_INTERACTIONS, marqueeSelection: marqueeSelectionEnabled };
  }, [interactions, marqueeSelectionEnabled]);

  useEffect(() => {
    if (pendingDisposeRef.current?.dispose === workbench.dispose) {
      clearTimeout(pendingDisposeRef.current.timer);
      pendingDisposeRef.current = null;
    }

    return () => {
      const pending = {
        dispose: workbench.dispose,
        timer: setTimeout(() => {
          if (pendingDisposeRef.current === pending) {
            pendingDisposeRef.current = null;
          }
          pending.dispose();
        }, 0)
      };
      pendingDisposeRef.current = pending;
    };
  }, [workbench.dispose]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof Element && event.target.closest(".ek-workbench__dialog[open]")) return;
      if (closeTopLayer(event)) {
        return;
      }
      const resolution = resolveEditorShortcut({
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        target: event.target
      });
      if (!resolution.handled || !resolution.action) {
        return;
      }
      if (resolution.preventDefault) {
        event.preventDefault();
      }
      runActionWithNotice(resolution.action);
    }

    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
    };
  }, [workbench]);

  const t = workbench.i18n.t;

  function runActionWithNotice(action: EditorAction): ReturnType<typeof workbench.runAction> {
    if (action !== "duplicate" && action !== "paste") {
      setObjectOperationNotice(null);
      return workbench.runAction(action);
    }
    const before = workbench.snapshot;
    const result = workbench.runAction(action);
    if (!result) {
      setObjectOperationNotice(null);
      return result;
    }
    if (!result.ok) {
      return result;
    }
    const newBindingNodeIds = Object.keys(result.snapshot.dataSources.bindings)
      .filter((nodeId) => !before.dataSources.bindings[nodeId]);
    const selectedBoundNodeIds = result.snapshot.selection.nodeIds
      .filter((nodeId) => newBindingNodeIds.includes(nodeId));
    const noticeNodeIds = selectedBoundNodeIds.length > 0 ? selectedBoundNodeIds : newBindingNodeIds;
    const devices = [...new Set(noticeNodeIds.map((nodeId) =>
      result.snapshot.dataSources.bindings[nodeId].deviceId
    ))];
    setObjectOperationNotice(devices.length > 0
      ? t("reactWorkbench.nodeOperation.copyNotice", { devices: devices.join(", ") })
      : null);
    return result;
  }
  const actionContext = { ...workbench, runAction: runActionWithNotice };
  const rootClassName = className ? `ek-workbench ${className}` : "ek-workbench";
  const hasToolbar = showDefaultToolbar || toolbar;
  const renderLeftPanel = leftPanel ?? sidePanel;

  function locateProblem(request: ProblemLocateRequest): void {
    if (request.kind === "asset") {
      setActiveView("assets");
      setLeftCollapsed(false);
      setPanelFocus({ kind: "asset", assetId: request.assetId });
      return;
    }
    if (request.kind === "node") {
      session.dispatch({
        type: "select-nodes",
        mode: "replace",
        nodeIds: [request.nodeId],
        primaryNodeId: request.nodeId
      });
      setDataDetailFocus(null);
      setActiveView("scene");
      setLeftCollapsed(false);
      setPanelFocus({ kind: "node", nodeId: request.nodeId });
      return;
    }
    if (request.kind === "data-query") {
      setActiveView("data");
      setLeftCollapsed(false);
      setDataLocate({ connectionId: request.connectionId, queryId: request.queryId });
      return;
    }
    session.dispatch({
      type: "select-nodes",
      mode: "replace",
      nodeIds: [request.nodeId],
      primaryNodeId: request.nodeId
    });
    setDataDetailFocus(request.kind === "data-field"
      ? { nodeId: request.nodeId, propertyKey: request.propertyKey }
      : { nodeId: request.nodeId });
  }

  return (
    <main ref={rootRef} className={rootClassName} style={{
      ...style,
      "--ek-workbench-left-width": leftCollapsed ? "0px" : `${panels.leftWidth}px`,
      "--ek-workbench-right-width": rightCollapsed ? "0px" : `${panels.rightWidth}px`,
      "--ek-workbench-left-handle": leftCollapsed ? "0px" : "6px",
      "--ek-workbench-right-handle": rightCollapsed ? "0px" : "6px"
    } as CSSProperties} data-desktop={panels.desktop} tabIndex={0} aria-label={t("reactWorkbench.shell.main.label")}>
      <WorkbenchNavigation
        context={workbench}
        activeView={activeView}
        collapsed={leftCollapsed}
        panelId={`${panelId}-left`}
        onSelect={(view) => {
          setActiveView(view);
          setLeftCollapsed(view === activeView ? !leftCollapsed : false);
        }}
      />
      {hasToolbar ? (
        <div className="ek-workbench__toolbar">
          {showDefaultToolbar ? (
            <WorkbenchToolbar
              context={workbench}
              onProjectProblems={(problems) => setProjectFeedback({ editor: session.editor, problems })}
              showLocaleSwitcher={showLocaleSwitcher}
              localeSwitcherDisabled={localeSwitcherDisabled}
            />
          ) : null}
          {toolbar ? <div className="ek-workbench__toolbar-region">{toolbar(actionContext)}</div> : null}
        </div>
      ) : null}
      <section className="ek-workbench__viewport-shell" aria-label={t("reactWorkbench.shell.viewport.label")}>
        <div className="ek-workbench__panel-toggles">
          <button
            type="button"
            aria-controls={`${panelId}-left`}
            aria-expanded={!leftCollapsed}
            aria-label={t(leftCollapsed ? "reactWorkbench.shell.left.expand" : "reactWorkbench.shell.left.collapse")}
            onClick={() => setLeftCollapsed(!leftCollapsed)}
          >{leftCollapsed ? "»" : "«"}</button>
          <button
            type="button"
            aria-controls={`${panelId}-right`}
            aria-expanded={!rightCollapsed}
            aria-label={t(rightCollapsed ? "reactWorkbench.shell.right.expand" : "reactWorkbench.shell.right.collapse")}
            onClick={() => setRightCollapsed(!rightCollapsed)}
          >{rightCollapsed ? "«" : "»"}</button>
        </div>
        <EditorViewport
          editor={workbench.editor}
          resolver={resolver}
          loader={loader}
          rendererFactory={rendererFactory}
          interactions={resolvedInteractions}
          onRuntimeReady={onRuntimeReady}
          className={viewportClassName ? `ek-workbench__viewport ${viewportClassName}` : "ek-workbench__viewport"}
        />
        {workbench.model.hierarchy.empty ? (
          <div className="ek-workbench__empty-viewport">
            <strong>{t("reactWorkbench.shell.empty.title")}</strong>
            <p>{t("reactWorkbench.shell.empty.description")}</p>
            {!renderLeftPanel ? <button type="button" onClick={() => {
              setActiveView("assets");
              setLeftCollapsed(false);
            }}>{t("reactWorkbench.shell.empty.action")}</button> : null}
          </div>
        ) : null}
        {viewportOverlay ? <div className="ek-workbench__overlay">{viewportOverlay(actionContext)}</div> : null}
        {showDefaultToolbar ? (
          <WorkbenchViewportTools
            context={actionContext}
            marqueeSelectionEnabled={marqueeSelectionEnabled}
            onToggleMarqueeSelection={() => setMarqueeSelectionEnabled((enabled) => !enabled)}
          />
        ) : null}
        <DataPreviewControls context={workbench} />
        {objectOperationNotice ? (
          <div className="ek-workbench__object-operation-notice" role="status">
            <span>{objectOperationNotice}</span>
            <button
              type="button"
              aria-label={t("reactWorkbench.nodeOperation.dismiss")}
              onClick={() => setObjectOperationNotice(null)}
            >{t("reactWorkbench.nodeOperation.dismiss")}</button>
          </div>
        ) : null}
        <DataDetailCard
          context={workbench}
          locate={dataDetailFocus?.nodeId === workbench.selection.nodeId
            ? dataDetailFocus
            : null}
        />
      </section>
      <aside id={`${panelId}-left`} hidden={leftCollapsed} className="ek-workbench__side-panel" aria-label={t("reactWorkbench.shell.projectPanel.label")}>
        {renderLeftPanel ? renderLeftPanel(actionContext) : (
          <WorkbenchLeftPanel
            context={workbench}
            activeView={activeView}
            dataLocate={dataLocate}
            onDataLocateHandled={() => setDataLocate(null)}
            focus={panelFocus}
            onFocusHandled={() => setPanelFocus(null)}
          />
        )}
      </aside>
      {panels.desktop && !leftCollapsed ? (
        <WorkbenchPanelResize
          side="left"
          label={t("reactWorkbench.shell.left.resize")}
          panelId={`${panelId}-left`}
          width={panels.leftWidth}
          minimum={220}
          maximum={panels.maximum}
          onResize={panels.setLeftWidth}
        />
      ) : null}
      <aside id={`${panelId}-right`} hidden={rightCollapsed} className="ek-workbench__right-panel" aria-label={t("reactWorkbench.shell.inspectorPanel.label")}>
        {rightPanel ? rightPanel(actionContext) : (
          <InspectorView
            editor={workbench.editor}
            snapshot={workbench.snapshot}
            inspector={workbench.inspector}
            setActiveLightId={workbench.setActiveLightId}
            setActiveCameraViewId={workbench.setActiveCameraViewId}
            camera={workbench.camera}
            dataContext={workbench}
            i18n={workbench.i18n}
            onReplaceAsset={(assetId, file) => {
              void workbench.replaceAsset({ assetId, source: file, label: file.name, mimeType: file.type });
            }}
            className={inspectorClassName}
          />
        )}
      </aside>
      {panels.desktop && !rightCollapsed ? (
        <WorkbenchPanelResize
          side="right"
          label={t("reactWorkbench.shell.right.resize")}
          panelId={`${panelId}-right`}
          width={panels.rightWidth}
          minimum={260}
          maximum={panels.maximum}
          onResize={panels.setRightWidth}
        />
      ) : null}
      <footer className="ek-workbench__status" aria-label={t("reactWorkbench.shell.status.label")}>
        {status ? status(workbench) : (
          <WorkbenchStatusBar context={workbench} onLocateProblem={locateProblem} />
        )}
      </footer>
    </main>
  );
}
