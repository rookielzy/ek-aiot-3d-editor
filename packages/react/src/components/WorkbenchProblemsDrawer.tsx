import { useEffect, useMemo, useRef, useState } from "react";
import type { ProblemSeverity, WorkbenchProblemItem } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { renderProblemSource, renderSeverity } from "./inspector-i18n";
import { locateProblemRequest, type ProblemLocateRequest } from "./problem-locate";
import { replaceAssetFile, serializeAssetMaintenance } from "./asset-maintenance";
import { localizedStatusMessage, renderStatusMessage, type LocalizedStatusMessage } from "./asset-workspace-status";

/** What the user has to see first: errors outrank warnings, warnings outrank notes. */
const SEVERITY_ORDER: Record<ProblemSeverity, number> = { error: 3, warning: 2, info: 1 };

export interface WorkbenchProblemsDrawerProps {
  context: ResolvedWorkbenchContext;
  id: string;
  open: boolean;
  onClose(): void;
  onLocate?(request: ProblemLocateRequest): void;
}

/**
 * The problem region: every reported problem with the source, severity, target and detail that
 * explain it, plus the one route to acting on it that the workbench actually has.
 *
 * It is not a dialog. It sits inside the shell, above the status summaries, and closes on request
 * or on Escape — it never takes the scene away, never clears what it reports, and never leaves the
 * user somewhere else when they dismiss it.
 */
export function WorkbenchProblemsDrawer({
  context,
  id,
  open,
  onClose,
  onLocate
}: WorkbenchProblemsDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);
  const t = context.i18n.t;
  const busy = useRef(new Set<string>());
  const [busyAssets, setBusyAssets] = useState<string[]>([]);
  // Progress and outcomes are keyed by asset, like the file input itself: the problem that asked
  // for the file is usually gone once the file is there, and the result still has to stay readable.
  const [progress, setProgress] = useState<Record<string, LocalizedStatusMessage>>({});
  const [results, setResults] = useState<Record<string, LocalizedStatusMessage>>({});
  const problems = useMemo(() => sortProblems(context.model.problems.items), [context.model.problems.items]);
  const bySeverity = context.model.problems.bySeverity;
  const totalCount = context.model.problems.totalCount;

  async function recover(assetId: string, file: File) {
    if (busy.current.has(assetId)) return;
    busy.current.add(assetId);
    setBusyAssets([...busy.current]);
    setProgress((current) => ({
      ...current,
      [assetId]: localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.progress", "Replacing...")
    }));
    try {
      const outcome = await serializeAssetMaintenance(context.editor, assetId, () =>
        replaceAssetFile(context, assetId, file)
      );
      setResults((current) => ({ ...current, [assetId]: outcome.message }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [assetId]: localizedStatusMessage("reactWorkbench.problems.recoveryFailed", "Recovery failed: {detail}", {
          detail: error instanceof Error ? error.message : String(error)
        })
      }));
    } finally {
      busy.current.delete(assetId);
      setBusyAssets([...busy.current]);
      setProgress((current) => {
        const next = { ...current };
        delete next[assetId];
        return next;
      });
    }
  }

  return (
    <section id={id} className="ek-workbench__problems-drawer" hidden={!open} aria-label={t("reactWorkbench.problems.details")} onKeyDownCapture={(event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }}>
      <header>
        <h2>{t("reactWorkbench.problems.details")}</h2>
        {totalCount > 0 ? (
          <small className="ek-workbench__problems-summary">{t("reactWorkbench.status.severitySummary", {
            errorCount: bySeverity.error,
            warningCount: bySeverity.warning,
            infoCount: bySeverity.info
          })}</small>
        ) : null}
        <button ref={closeRef} type="button" onClick={onClose}>{t("reactWorkbench.problems.close")}</button>
      </header>
      {totalCount === 0 ? <p className="ek-workbench__empty">{t("reactWorkbench.problems.empty")}</p> : null}
      <ul className="ek-workbench__problem-list">
        {problems.map((problem) => {
          const titleId = `${id}-${problem.id}-title`;
          const locate = locateProblemRequest(problem, context.model);
          const targetValues = Object.entries(problem.target)
            .filter(([key]) => key !== "kind")
            .map(([, value]) => value)
            .join(" · ");
          const detail = problem.detailDescriptor ? t(problem.detailDescriptor) : problem.detail;
          const running = problem.assetId ? progress[problem.assetId] : undefined;
          return (
            <li key={`${problem.id}:${problem.assetId ?? ""}:${problem.objectId ?? ""}`} data-severity={problem.severity} data-source={problem.source}>
              <div className="ek-workbench__problem-head">
                <strong id={titleId}>{problem.titleDescriptor ? t(problem.titleDescriptor) : problem.title}</strong>
                <small>
                  {t("reactWorkbench.problems.severity")} {renderSeverity(context.i18n, problem.severity)}
                  {" · "}
                  {t("reactWorkbench.problems.source")} {renderProblemSource(context.i18n, problem.source)}
                </small>
              </div>
              <dl className="ek-workbench__problem-facts">
                <div>
                  <dt>{`${t("reactWorkbench.problems.target")} · `}</dt>
                  <dd>
                    {t(`reactWorkbench.problems.target.${problem.target.kind}`)}
                    {targetValues ? ` · ${targetValues}` : ""}
                  </dd>
                </div>
                {detail ? (
                  <div>
                    <dt>{t("reactWorkbench.problems.detail")}</dt>
                    <dd>{detail}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="ek-workbench__problem-actions">
                {locate && onLocate ? (
                  <button
                    type="button"
                    aria-describedby={titleId}
                    onClick={() => {
                      onLocate(locate);
                      onClose();
                    }}
                  >{t("reactWorkbench.problems.locate")}</button>
                ) : null}
                {problem.assetId && problem.recoverability === "user-action" ? (
                  <label className="ek-workbench__file-action">
                    <span>{problem.actionLabelDescriptor ? t(problem.actionLabelDescriptor) : problem.actionLabel ?? t("reactWorkbench.inspector.problems.replaceAsset.label")}</span>
                    <input type="file" disabled={busyAssets.includes(problem.assetId)} onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (file) void recover(problem.assetId!, file);
                    }} />
                  </label>
                ) : null}
                {running ? <small role="status">{renderStatusMessage(context.i18n, running)}</small> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {Object.keys(results).length > 0 ? (
        <div className="ek-workbench__problem-results" role="status" aria-label={t("reactWorkbench.problems.results.label")}>
          {Object.entries(results).map(([assetId, message]) => (
            <p key={assetId}>{assetId} · <span>{renderStatusMessage(context.i18n, message)}</span></p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function sortProblems(problems: readonly WorkbenchProblemItem[]): WorkbenchProblemItem[] {
  return [...problems].sort((left, right) => SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity]);
}
