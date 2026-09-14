import { useId, useRef, useState } from "react";
import { WorkbenchProblemsDrawer } from "./WorkbenchProblemsDrawer";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { problemToneFromCounts } from "./workbench-model-helpers";

export interface WorkbenchStatusBarProps {
  context: ResolvedWorkbenchContext;
}

export function WorkbenchStatusBar({ context }: WorkbenchStatusBarProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
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
  const problemTone = problemToneFromCounts(context.model.problems.bySeverity, status.problemCount);

  return (
    <>
      <WorkbenchProblemsDrawer context={context} id={id} open={open} onClose={() => { setOpen(false); trigger.current?.focus(); }} />
      <div className="ek-workbench__default-status">
        <span className="ek-workbench__status-chip" data-tone={status.selectionCount > 0 ? "active" : "neutral"}>
          <strong>{t("reactWorkbench.status.group.selection")}</strong>
          <span>{t("reactWorkbench.status.selection", { selection: selectionLabel })}</span>
        </span>
        <span className="ek-workbench__status-chip">
          <strong>{t("reactWorkbench.status.group.history")}</strong>
          <span>{t("reactWorkbench.status.undo", { count: status.undoCount })}</span>
          <span>{t("reactWorkbench.status.redo", { count: status.redoCount })}</span>
        </span>
        <span className="ek-workbench__status-chip" data-tone={status.runtimeReady ? "success" : "warning"}>
          <strong>{t("reactWorkbench.status.group.runtime")}</strong>
          <span>
            {t("reactWorkbench.status.runtime", {
              state: status.runtimeReady
                ? t("reactWorkbench.status.runtime.ready")
                : t("reactWorkbench.status.runtime.missing")
            })}
          </span>
        </span>
        <span className="ek-workbench__status-chip">
          <strong>{t("reactWorkbench.status.group.snap")}</strong>
          <span>{snapFeedbackLabel}</span>
        </span>
        <span className="ek-workbench__status-chip" data-tone={project.ready ? "success" : "warning"}>
          <strong>{t("reactWorkbench.status.group.project")}</strong>
          <span>{t("reactWorkbench.status.project", { status: projectStatusLabel })}</span>
        </span>
        {workspace ? (
          <span className="ek-workbench__status-chip" data-tone={workspace.readiness.blockingAssetIds.length > 0 ? "warning" : "neutral"}>
            <strong>{t("reactWorkbench.status.group.assets")}</strong>
            <span>
              {t("reactWorkbench.status.assets", {
                totalCount: workspace.totalCount,
                missingCount: workspace.missingPayloadCount + workspace.missingReferenceCount,
                blockedCount: workspace.readiness.blockingAssetIds.length
              })}
            </span>
          </span>
        ) : null}
        <span className="ek-workbench__status-chip" data-tone={status.dirty ? "warning" : "success"}>
          <strong>{t("reactWorkbench.status.group.save")}</strong>
          <span>{status.dirty ? t("reactWorkbench.status.dirty") : t("reactWorkbench.status.saved")}</span>
        </span>
        <button ref={trigger} type="button" className="ek-workbench__status-chip" data-tone={problemTone} aria-label={t("reactWorkbench.problems.details")} aria-expanded={open} aria-controls={id} aria-describedby={`${id}-count`} onClick={() => setOpen(!open)}>
          <strong>{t("reactWorkbench.status.group.problems")}</strong>
          <span id={`${id}-count`}>{t("reactWorkbench.status.problems", { count: status.problemCount })}</span>
        </button>
        {status.problemCount > 0 ? (
          <span className="ek-workbench__status-chip" data-tone={problemTone}>
            <span>
              {t("reactWorkbench.status.problemBreakdown", {
                authoredCount: status.authoredProblemCount,
                runtimeCount: status.runtimeProblemCount,
                projectCount: status.projectProblemCount
              })}
            </span>
          </span>
        ) : null}
      </div>
    </>
  );
}
