import { useState } from "react";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { DataSourcesPanel } from "./DataSourcesPanel";
import { WorkbenchAssets, type AssetListCounts } from "./WorkbenchAssets";
import { WorkbenchHierarchy } from "./WorkbenchHierarchy";

export interface WorkbenchLeftPanelProps {
  context: ResolvedWorkbenchContext;
  activeView: WorkbenchPanelView;
  dataLocate?: { connectionId: string; queryId: string } | null;
  onDataLocateHandled?(): void;
}

export type WorkbenchPanelView = "scene" | "assets" | "data" | "project";

export function WorkbenchLeftPanel({
  context,
  activeView,
  dataLocate,
  onDataLocateHandled
}: WorkbenchLeftPanelProps) {
  const model = context.model;
  const t = context.i18n.t;
  const [assetCounts, setAssetCounts] = useState<AssetListCounts | null>(null);

  return (
    <div className="ek-workbench__default-left-panel">
      <section
        className="ek-workbench__panel-section"
        aria-label={t("reactWorkbench.leftPanel.hierarchy.label")}
        hidden={activeView !== "scene"}
      >
        <div className="ek-workbench__section-header">
          <h2>{t("reactWorkbench.leftPanel.hierarchy.label")}</h2>
          <span>{t("reactWorkbench.leftPanel.hierarchy.count", {
            selectedCount: model.hierarchy.selectedCount,
            totalCount: model.hierarchy.totalCount
          })}</span>
        </div>
        <WorkbenchHierarchy context={context} />
      </section>

      <section
        className="ek-workbench__panel-section"
        aria-label={t("reactWorkbench.leftPanel.assets.label")}
        hidden={activeView !== "assets"}
      >
        <div className="ek-workbench__section-header">
          <h2>{t("reactWorkbench.leftPanel.assets.label")}</h2>
          {assetCounts ? <span>{`${assetCounts.visible}/${assetCounts.total}`}</span> : null}
        </div>
        <WorkbenchAssets context={context} onCountChange={setAssetCounts} />
      </section>

      <section
        className="ek-workbench__panel-section"
        aria-label={t("dataSources.panel.label")}
        hidden={activeView !== "data"}
      >
        <DataSourcesPanel context={context} locate={dataLocate} onLocateHandled={onDataLocateHandled} />
      </section>

      <section
        className="ek-workbench__panel-section"
        aria-label={t("reactWorkbench.leftPanel.project.label")}
        hidden={activeView !== "project"}
      >
        <div className="ek-workbench__section-header">
          <h2>{t("reactWorkbench.leftPanel.project.label")}</h2>
          <span>{t(model.project.statusLabelDescriptor ?? { key: "workbench.project.status.partial.label", fallback: model.project.statusLabel })}</span>
        </div>
        <dl className="ek-workbench__summary-list">
          <div>
            <dt>{t("reactWorkbench.leftPanel.project.scene")}</dt>
            <dd>{model.project.sceneName}</dd>
          </div>
          <div>
            <dt>{t("reactWorkbench.leftPanel.project.nodes")}</dt>
            <dd>{model.project.nodeCount}</dd>
          </div>
          <div>
            <dt>{t("reactWorkbench.leftPanel.project.objects")}</dt>
            <dd>{model.project.objectCount}</dd>
          </div>
          <div>
            <dt>{t("reactWorkbench.leftPanel.project.lights")}</dt>
            <dd>{model.project.lightCount}</dd>
          </div>
          <div>
            <dt>{t("reactWorkbench.leftPanel.project.assets")}</dt>
            <dd>{model.project.assetCount}</dd>
          </div>
        </dl>
        {model.problems.totalCount > 0 ? (
          <ul className="ek-workbench__problem-list" aria-label={t("reactWorkbench.leftPanel.project.problems.label")}>
            {model.problems.items.slice(0, 4).map((problem) => (
              <li key={problem.id} data-severity={problem.severity}>
                <span>{problem.titleDescriptor ? t(problem.titleDescriptor) : problem.title}</span>
                <small>
                  {problem.severity}
                  {problem.assetId ? ` · ${problem.assetId}` : ""}
                  {problem.actionLabel ? ` · ${problem.actionLabelDescriptor ? t(problem.actionLabelDescriptor) : problem.actionLabel}` : ""}
                </small>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
