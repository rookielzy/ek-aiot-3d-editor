import { useEffect, useRef, useState } from "react";
import type { MessageDescriptor } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { renderProblemSource, renderSeverity } from "./inspector-i18n";

interface WorkbenchProblemsDrawerProps {
  context: ResolvedWorkbenchContext;
  id: string;
  open: boolean;
  onClose(): void;
}

export function WorkbenchProblemsDrawer({ context, id, open, onClose }: WorkbenchProblemsDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);
  const t = context.i18n.t;
  const pending = useRef(new Set<string>());
  const [feedback, setFeedback] = useState<Record<string, MessageDescriptor>>({});
  const [busy, setBusy] = useState<string[]>([]);

  async function recover(assetId: string, file: File) {
    if (pending.current.has(assetId)) return;
    pending.current.add(assetId);
    setBusy([...pending.current]);
    setFeedback((current) => ({ ...current, [assetId]: {
      key: "reactWorkbench.leftPanel.assets.replace.progress", fallback: "Replacing..."
    } }));
    try {
      const result = await context.replaceAsset({ assetId, source: file, label: file.name, mimeType: file.type });
      if (result.ok) await context.runtime?.project();
      context.refreshProblems();
      const problem = result.problems[0];
      setFeedback((current) => ({ ...current, [assetId]: result.ok
        ? { key: "reactWorkbench.leftPanel.assets.replace.success", fallback: "Replaced with {fileName}", values: { fileName: file.name } }
        : problem?.display?.titleDescriptor ?? {
          key: "reactWorkbench.problems.recoveryFailed", fallback: "Recovery failed: {detail}",
          values: { detail: problem?.display?.title ?? problem?.message ?? "" }
        }
      }));
    } catch (error) {
      setFeedback((current) => ({ ...current, [assetId]: {
        key: "reactWorkbench.problems.recoveryFailed", fallback: "Recovery failed: {detail}",
        values: { detail: error instanceof Error ? error.message : String(error) }
      } }));
    } finally {
      pending.current.delete(assetId);
      setBusy([...pending.current]);
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
        <button ref={closeRef} type="button" onClick={onClose}>{t("reactWorkbench.problems.close")}</button>
      </header>
      {context.model.problems.totalCount === 0 ? <p>{t("reactWorkbench.problems.empty")}</p> : null}
      <ul className="ek-workbench__problem-list">
        {context.model.problems.items.map((problem) => (
          <li key={`${problem.id}:${problem.assetId ?? ""}:${problem.objectId ?? ""}`} data-severity={problem.severity}>
            <strong>{problem.titleDescriptor ? t(problem.titleDescriptor) : problem.title}</strong>
            <small>{renderSeverity(context.i18n, problem.severity)} · {renderProblemSource(context.i18n, problem.source)}</small>
            <span>{t("reactWorkbench.problems.target")} · {t(`reactWorkbench.problems.target.${problem.target.kind}`)} · {Object.entries(problem.target).filter(([key]) => key !== "kind").map(([, value]) => value).join(" · ")}</span>
            {problem.detail || problem.detailDescriptor ? <span>{problem.detailDescriptor ? t(problem.detailDescriptor) : problem.detail}</span> : null}
            {problem.assetId && problem.recoverability === "user-action" ? (
              <label className="ek-workbench__file-action">
                <span>{problem.actionLabelDescriptor ? t(problem.actionLabelDescriptor) : problem.actionLabel ?? t("reactWorkbench.inspector.problems.replaceAsset.label")}</span>
                <input type="file" disabled={busy.includes(problem.assetId)} onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void recover(problem.assetId!, file);
                }} />
              </label>
            ) : null}
          </li>
        ))}
      </ul>
      <div role="status">{Object.entries(feedback).map(([assetId, message]) => <p key={assetId}>{assetId} · <span>{t(message)}</span></p>)}</div>
    </section>
  );
}
