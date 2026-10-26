import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { WorkbenchIcon, type WorkbenchIconName } from "./WorkbenchIcon";
import type { WorkbenchPanelView } from "./WorkbenchLeftPanel";

export function WorkbenchNavigation({ context, activeView, collapsed, panelId, onSelect }: {
  context: ResolvedWorkbenchContext;
  activeView: WorkbenchPanelView;
  collapsed: boolean;
  panelId: string;
  onSelect(view: WorkbenchPanelView): void;
}) {
  const { model, i18n: { t } } = context;
  const views: Array<{ id: WorkbenchPanelView; icon: WorkbenchIconName; count: number }> = [
    { id: "scene", icon: "group", count: model.hierarchy.totalCount },
    { id: "assets", icon: "floor", count: model.assets.workspace?.totalCount ?? model.assets.totalCount },
    { id: "data", icon: "data", count: model.dataSources.totalCount },
    { id: "project", icon: "open", count: model.problems.totalCount }
  ];

  return (
    <nav className="ek-workbench__navigation" aria-label={t("reactWorkbench.leftPanel.nav.label")}>
      <span className="ek-workbench__brand" aria-hidden="true">ek<span>.</span></span>
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          className="ek-workbench__nav-button"
          aria-label={`${t(`reactWorkbench.leftPanel.nav.${view.id}`)} ${view.count}`}
          aria-pressed={activeView === view.id}
          aria-expanded={activeView === view.id && !collapsed}
          aria-controls={panelId}
          onClick={() => onSelect(view.id)}
        >
          <WorkbenchIcon name={view.icon} />
          <span>{t(`reactWorkbench.leftPanel.nav.${view.id}`)}</span>
          <small>{view.count}</small>
        </button>
      ))}
    </nav>
  );
}
