/**
 * Asset maintenance reaches the document from more than one place in the workbench — the problem
 * drawer and the asset workspace — and both can be pointed at the same asset. A replacement or a
 * reimport commits whenever its file finishes, so the work has to be serialized per asset *across
 * entry points*: otherwise an older file can commit after a newer one and silently win.
 *
 * The queue belongs to the editor, not to a component: it has to outlive whichever panel started
 * the earlier file, including a drawer that unmounted in between.
 */
import type { ReplaceAssetInput, ReplaceAssetResult } from "@ek-aiot/3d-editor-core";
import { localizedStatusMessage, projectProblemStatusMessage, type LocalizedStatusMessage } from "./asset-workspace-status";

const pendingByEditor = new WeakMap<object, Map<string, Promise<void>>>();

export function serializeAssetMaintenance<T>(
  editor: object,
  assetId: string,
  task: () => Promise<T>
): Promise<T> {
  let queues = pendingByEditor.get(editor);
  if (!queues) {
    queues = new Map();
    pendingByEditor.set(editor, queues);
  }
  const pending = queues;
  const previous = pending.get(assetId);
  const run = (async () => {
    if (previous) await previous;
    return task();
  })();
  const settled = run.then(() => undefined, () => undefined);
  pending.set(assetId, settled);
  void settled.then(() => {
    if (pending.get(assetId) === settled) pending.delete(assetId);
  });
  return run;
}

/** The document operations a replacement needs, as either entry point can supply them. */
interface ReplaceHost {
  assets: { replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult> };
  runtime?: { project(): unknown } | null;
  refreshProblems(): void;
}

/**
 * Supplying a file is one operation with one outcome, whichever panel asked for it: the payload is
 * replaced, the runtime is reprojected, the problems are re-read, and the file's name is what the
 * user is told about. A throw belongs to the caller, whose region words that failure its own way.
 */
export async function replaceAssetFile(
  host: ReplaceHost,
  assetId: string,
  file: File
): Promise<{ replaced: boolean; message: LocalizedStatusMessage }> {
  const result = await host.assets.replaceAsset({ assetId, source: file, label: file.name, mimeType: file.type });
  let replaced = false;
  if (result.ok) {
    await host.runtime?.project();
    replaced = true;
  }
  host.refreshProblems();
  return {
    replaced,
    message: result.ok
      ? localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.success", "Replaced with {fileName}", { fileName: file.name })
      : projectProblemStatusMessage(result.problems[0]) ??
        localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.failed", "Replacement failed")
  };
}
