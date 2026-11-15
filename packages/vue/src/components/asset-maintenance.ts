import type { ReplaceAssetInput, ReplaceAssetResult } from "@ek-aiot/3d-editor-core";
import { localizedStatusMessage, projectProblemStatusMessage, type LocalizedStatusMessage } from "./asset-workspace-status";

const pendingByEditor = new WeakMap<object, Map<string, Promise<void>>>();

export function serializeAssetMaintenance<T>(editor: object, assetId: string, task: () => Promise<T>): Promise<T> {
  let queues = pendingByEditor.get(editor);
  if (!queues) {
    queues = new Map();
    pendingByEditor.set(editor, queues);
  }
  const previous = queues.get(assetId);
  const run = (async () => {
    if (previous) await previous;
    return task();
  })();
  const settled = run.then(() => undefined, () => undefined);
  queues.set(assetId, settled);
  void settled.then(() => { if (queues?.get(assetId) === settled) queues.delete(assetId); });
  return run;
}

interface ReplaceHost {
  assets: { replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult> };
  runtime?: { project(): unknown } | null;
  refreshProblems(): void;
}

export async function replaceAssetFile(host: ReplaceHost, assetId: string, file: File): Promise<{ replaced: boolean; message: LocalizedStatusMessage }> {
  const result = await host.assets.replaceAsset({ assetId, source: file, label: file.name, mimeType: file.type });
  if (result.ok) await host.runtime?.project();
  host.refreshProblems();
  return {
    replaced: result.ok,
    message: result.ok
      ? localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.success", "Replaced with {fileName}", { fileName: file.name })
      : projectProblemStatusMessage(result.problems[0]) ?? localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.failed", "Replacement failed")
  };
}
