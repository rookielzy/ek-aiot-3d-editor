import type { WorkbenchContext } from "../hooks/use-workbench";

export interface WorkbenchStatusBarProps {
  context: WorkbenchContext;
}

export function WorkbenchStatusBar({ context }: WorkbenchStatusBarProps) {
  const status = context.model.status;
  const project = context.model.project;

  return (
    <div className="ek-workbench__default-status">
      <span>Selection {status.selectionLabel}</span>
      <span>Undo {status.undoCount}</span>
      <span>Redo {status.redoCount}</span>
      <span>Runtime {status.runtimeReady ? "ready" : "missing"}</span>
      <span>Project {project.statusLabel}</span>
      <span>{status.dirty ? "Dirty" : "Saved"}</span>
      <span>Problems {status.problemCount}</span>
      {status.problemCount > 0 ? (
        <span>
          Authored {status.authoredProblemCount} · Runtime {status.runtimeProblemCount} · Project {status.projectProblemCount}
        </span>
      ) : null}
    </div>
  );
}
