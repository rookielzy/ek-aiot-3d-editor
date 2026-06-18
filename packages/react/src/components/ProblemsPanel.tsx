import type { InspectorProblemItem, ProblemInspectorSection } from "@ek-aiot/3d-editor-core";
import type { InspectorI18n } from "./inspector-i18n";
import { DEFAULT_INSPECTOR_I18N, renderProblemSource, renderSectionTitle, renderSeverity } from "./inspector-i18n";

export interface ProblemsPanelProps {
  section: ProblemInspectorSection;
  i18n?: InspectorI18n;
  onReplaceAsset?(assetId: string, file: File): void | Promise<void>;
}

export function ProblemsPanel({ section, i18n = DEFAULT_INSPECTOR_I18N, onReplaceAsset }: ProblemsPanelProps) {
  function renderProblemDetail(problem: InspectorProblemItem): string | null {
    if (problem.detailDescriptor) {
      return i18n.t(problem.detailDescriptor);
    }
    return problem.detail ?? null;
  }

  function renderProblemActionLabel(problem: InspectorProblemItem): string | null {
    if (problem.actionLabelDescriptor) {
      return i18n.t(problem.actionLabelDescriptor);
    }
    return problem.actionLabel ?? null;
  }

  return (
    <section className="ek-inspector-section">
      <header className="ek-inspector-section__header">
        <h2>{renderSectionTitle(i18n, section)}</h2>
        <span className="ek-inspector-count">{section.problems.length}</span>
      </header>
      {section.problems.length === 0 ? <p className="ek-inspector-empty">{i18n.t("reactWorkbench.inspector.problems.empty")}</p> : null}
      {section.problems.length ? (
        <ul className="ek-inspector-problems">
          {section.problems.map((problem) => {
            const detail = renderProblemDetail(problem);
            const actionLabel = renderProblemActionLabel(problem);
            return (
              <li key={problem.id} data-severity={problem.severity}>
                <strong>{problem.titleDescriptor ? i18n.t(problem.titleDescriptor) : problem.title}</strong>
                {detail ? <span>{detail}</span> : null}
                <small>
                  {renderSeverity(i18n, problem.severity)} · {renderProblemSource(i18n, problem.source)}
                  {problem.assetId ? ` · ${problem.assetId}` : ""}
                  {actionLabel ? ` · ${actionLabel}` : ""}
                </small>
                {problem.assetId && problem.recoverability === "user-action" && onReplaceAsset ? (
                  <label className="ek-inspector-file-action">
                    <span>{actionLabel ?? i18n.t("reactWorkbench.inspector.problems.replaceAsset.label")}</span>
                    <input
                      type="file"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) {
                          void onReplaceAsset(problem.assetId!, file);
                        }
                      }}
                    />
                  </label>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
