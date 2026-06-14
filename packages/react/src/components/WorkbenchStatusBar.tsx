import type { WorkbenchContext } from "../hooks/use-workbench";

export interface WorkbenchStatusBarProps {
  context: WorkbenchContext;
}

export function WorkbenchStatusBar({ context }: WorkbenchStatusBarProps) {
  const status = context.model.status;
  const project = context.model.project;
  const workspace = context.model.assets.workspace;

  return (
    <div className="ek-workbench__default-status">
      <span>Selection {status.selectionLabel}</span>
      <span>Undo {status.undoCount}</span>
      <span>Redo {status.redoCount}</span>
      <span>Runtime {status.runtimeReady ? "ready" : "missing"}</span>
      <span>{status.snapFeedbackLabel}</span>
      <span>Project {project.statusLabel}</span>
      {workspace ? (
        <span>
          Assets {workspace.totalCount} · missing {workspace.missingPayloadCount + workspace.missingReferenceCount} · blocked {workspace.readiness.blockingAssetIds.length}
        </span>
      ) : null}
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
