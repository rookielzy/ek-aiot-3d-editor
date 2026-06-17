import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";

export interface WorkbenchStatusBarProps {
  context: ResolvedWorkbenchContext;
}

export function WorkbenchStatusBar({ context }: WorkbenchStatusBarProps) {
  const status = context.model.status;
  const project = context.model.project;
  const workspace = context.model.assets.workspace;
  const t = context.i18n.t;
  const selectionLabel = context.model.selection.labelDescriptor
    ? t(context.model.selection.labelDescriptor)
    : status.selectionLabel;
  const snapFeedbackLabel = status.snapFeedbackLabelDescriptor
    ? t(status.snapFeedbackLabelDescriptor)
    : status.snapFeedbackLabel;
  const projectStatusLabel = project.statusLabelDescriptor
    ? t(project.statusLabelDescriptor)
    : project.statusLabel;

  return (
    <div className="ek-workbench__default-status">
      <span>{t("reactWorkbench.status.selection", { selection: selectionLabel })}</span>
      <span>{t("reactWorkbench.status.undo", { count: status.undoCount })}</span>
      <span>{t("reactWorkbench.status.redo", { count: status.redoCount })}</span>
      <span>{t("reactWorkbench.status.runtime", {
        state: status.runtimeReady
          ? t("reactWorkbench.status.runtime.ready")
          : t("reactWorkbench.status.runtime.missing")
      })}</span>
      <span>{snapFeedbackLabel}</span>
      <span>{t("reactWorkbench.status.project", { status: projectStatusLabel })}</span>
      {workspace ? (
        <span>
          {t("reactWorkbench.status.assets", {
            totalCount: workspace.totalCount,
            missingCount: workspace.missingPayloadCount + workspace.missingReferenceCount,
            blockedCount: workspace.readiness.blockingAssetIds.length
          })}
        </span>
      ) : null}
      <span>{status.dirty ? t("reactWorkbench.status.dirty") : t("reactWorkbench.status.saved")}</span>
      <span>{t("reactWorkbench.status.problems", { count: status.problemCount })}</span>
      {status.problemCount > 0 ? (
        <span>
          {t("reactWorkbench.status.problemBreakdown", {
            authoredCount: status.authoredProblemCount,
            runtimeCount: status.runtimeProblemCount,
            projectCount: status.projectProblemCount
          })}
        </span>
      ) : null}
    </div>
  );
}
