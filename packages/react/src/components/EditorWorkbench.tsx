import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { resolveEditorShortcut, type AssetResolverBridge, type EditorRuntime, type EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";
import { useWorkbench, type ResolvedWorkbenchContext, type UseWorkbenchOptions } from "../hooks/use-workbench";
import { EditorViewport } from "./EditorViewport";
import { InspectorView } from "./InspectorView";
import { WorkbenchLeftPanel, type WorkbenchPanelView } from "./WorkbenchLeftPanel";
import { WorkbenchNavigation } from "./WorkbenchNavigation";
import { WorkbenchPanelResize } from "./WorkbenchPanelResize";
import { useWorkbenchPanelWidths } from "../hooks/use-workbench-panel-widths";
import { WorkbenchStatusBar } from "./WorkbenchStatusBar";
import { WorkbenchToolbar } from "./WorkbenchToolbar";
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
  const workbench = useWorkbench({
    editor: providedEditor,
    snapshot,
    loader,
    locale,
    defaultLocale,
    onLocaleChange,
    translate
  });
  const pendingDisposeRef = useRef<{ dispose(): void; timer: ReturnType<typeof setTimeout> } | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const panelId = useId();
  const [activeView, setActiveView] = useState<WorkbenchPanelView>("scene");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
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
      workbench.runAction(resolution.action);
    }

    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
    };
  }, [workbench.editor]);

  const t = workbench.i18n.t;
  const rootClassName = className ? `ek-workbench ${className}` : "ek-workbench";
  const hasToolbar = showDefaultToolbar || toolbar;
  const renderLeftPanel = leftPanel ?? sidePanel;

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
              marqueeSelectionEnabled={marqueeSelectionEnabled}
              onToggleMarqueeSelection={() => setMarqueeSelectionEnabled((enabled) => !enabled)}
              showLocaleSwitcher={showLocaleSwitcher}
              localeSwitcherDisabled={localeSwitcherDisabled}
            />
          ) : null}
          {toolbar ? <div className="ek-workbench__toolbar-region">{toolbar(workbench)}</div> : null}
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
        {viewportOverlay ? <div className="ek-workbench__overlay">{viewportOverlay(workbench)}</div> : null}
      </section>
      <aside id={`${panelId}-left`} hidden={leftCollapsed} className="ek-workbench__side-panel" aria-label={t("reactWorkbench.shell.projectPanel.label")}>
        {renderLeftPanel ? renderLeftPanel(workbench) : <WorkbenchLeftPanel context={workbench} activeView={activeView} />}
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
        {rightPanel ? rightPanel(workbench) : (
          <InspectorView
            editor={workbench.editor}
            snapshot={workbench.snapshot}
            inspector={workbench.inspector}
            setActiveLightId={workbench.setActiveLightId}
            setActiveCameraViewId={workbench.setActiveCameraViewId}
            camera={workbench.camera}
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
        {status ? status(workbench) : <WorkbenchStatusBar context={workbench} />}
      </footer>
    </main>
  );
}
