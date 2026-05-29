import type { ProblemInspectorSection } from "@ek-aiot/3d-editor-core";

export interface ProblemsPanelProps {
  section: ProblemInspectorSection;
  onReplaceAsset?(assetId: string, file: File): void | Promise<void>;
}

export function ProblemsPanel({ section, onReplaceAsset }: ProblemsPanelProps) {
  return (
    <section className="ek-inspector-section">
      <header className="ek-inspector-section__header">
        <h2>Problems</h2>
        <span className="ek-inspector-count">{section.problems.length}</span>
      </header>
      {section.problems.length === 0 ? <p className="ek-inspector-empty">No runtime problems.</p> : null}
      {section.problems.length ? (
        <ul className="ek-inspector-problems">
          {section.problems.map((problem) => (
            <li key={problem.id} data-severity={problem.severity}>
              <strong>{problem.title}</strong>
              <span>{problem.detail}</span>
              <small>
                {problem.severity} · {problem.source}
                {problem.assetId ? ` · ${problem.assetId}` : ""}
                {problem.actionLabel ? ` · ${problem.actionLabel}` : ""}
              </small>
              {problem.assetId && problem.recoverability === "user-action" && onReplaceAsset ? (
                <label className="ek-inspector-file-action">
                  <span>{problem.actionLabel ?? "Replace asset"}</span>
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
          ))}
        </ul>
      ) : null}
    </section>
  );
}
