import type {
  AssetKind,
  AssetWorkspacePackageStatus,
  AssetWorkspacePayloadStatus,
  AssetWorkspaceStatus,
  GlbImportDiagnostic,
  GlbImportRemapSummary,
  GlbImportStatus,
  MessageDescriptor,
  ProjectProblem,
  WorkbenchAssetImportDiagnostic
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchI18n, WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";

/**
 * Status feedback for an asset operation, kept as a descriptor until render time so a locale
 * switch re-resolves text that is already on screen instead of freezing one language.
 */
export type LocalizedStatusMessage =
  | {
      kind: "message";
      key: WorkbenchMessageKey;
      fallback: string;
      values?: WorkbenchMessageValues;
    }
  | {
      kind: "descriptor";
      descriptor: MessageDescriptor;
    }
  | {
      kind: "raw";
      value: string;
    };

export type AssetRecoveryState = Record<string, LocalizedStatusMessage>;

export function localizedStatusMessage(
  key: WorkbenchMessageKey,
  fallback: string,
  values?: WorkbenchMessageValues
): LocalizedStatusMessage {
  return {
    kind: "message",
    key,
    fallback,
    ...(values ? { values } : {})
  };
}

export function descriptorStatusMessage(descriptor: MessageDescriptor): LocalizedStatusMessage {
  return {
    kind: "descriptor",
    descriptor
  };
}

export function rawStatusMessage(value: string): LocalizedStatusMessage {
  return {
    kind: "raw",
    value
  };
}

export function renderStatusMessage(i18n: WorkbenchI18n, message: LocalizedStatusMessage): string {
  if (message.kind === "raw") {
    return message.value;
  }
  if (message.kind === "descriptor") {
    return i18n.t(message.descriptor);
  }
  return i18n.t({
    key: message.key,
    fallback: message.fallback,
    ...(message.values ? { values: message.values } : {})
  });
}

/** Core text that carries a descriptor when it is translatable and a plain string when it is not. */
export function descriptorMessage(descriptor: MessageDescriptor | undefined, fallback: string): LocalizedStatusMessage {
  return descriptor ? descriptorStatusMessage(descriptor) : rawStatusMessage(fallback);
}

export function renderDescriptor(descriptor: MessageDescriptor | undefined, text: string, i18n: WorkbenchI18n): string {
  return descriptor ? i18n.t(descriptor) : text;
}

export function diagnosticStatusMessage(diagnostic: WorkbenchAssetImportDiagnostic | undefined): LocalizedStatusMessage | undefined {
  return diagnostic ? descriptorMessage(diagnostic.titleDescriptor, diagnostic.title) : undefined;
}

export function glbDiagnosticStatusMessage(diagnostic: GlbImportDiagnostic | undefined): LocalizedStatusMessage | undefined {
  if (!diagnostic) {
    return undefined;
  }
  return descriptorStatusMessage({
    key: `workbenchImport.diagnostic.${normalizeDiagnosticCodePath(diagnostic.code)}.title`,
    fallback: diagnostic.display.title,
    values: {
      diagnosticId: diagnostic.id,
      code: diagnostic.code,
      ...(diagnostic.metadata ?? {})
    }
  });
}

export function projectProblemStatusMessage(problem: ProjectProblem | undefined): LocalizedStatusMessage | undefined {
  if (!problem) {
    return undefined;
  }
  return descriptorMessage(problem.display?.titleDescriptor, problem.display?.title ?? problem.message);
}

export function reimportSummaryStatusMessage(
  fileName: string,
  summary: GlbImportRemapSummary | undefined
): LocalizedStatusMessage {
  if (!summary) {
    return localizedStatusMessage("reactWorkbench.leftPanel.assets.reimport.success", "Reimported {fileName}", { fileName });
  }
  return localizedStatusMessage(
    "reactWorkbench.leftPanel.assets.reimport.summary",
    "{exactTargetCount} exact · {remappedTargetCount} remapped · {newTargetCount} new · {unresolvedTargetCount} unresolved",
    { ...summary }
  );
}

export function formatImportDiagnostic(i18n: WorkbenchI18n, diagnostic: WorkbenchAssetImportDiagnostic): string {
  return renderDescriptor(diagnostic.titleDescriptor, diagnostic.title, i18n);
}

export function formatAssetKind(i18n: WorkbenchI18n, value: AssetKind): string {
  return formatted(i18n, assetKindMessageKeys, value);
}

export function formatWorkspaceStatus(i18n: WorkbenchI18n, value: AssetWorkspaceStatus): string {
  return formatted(i18n, workspaceStatusMessageKeys, value);
}

export function formatPayloadStatus(i18n: WorkbenchI18n, value: AssetWorkspacePayloadStatus): string {
  return formatted(i18n, payloadStatusMessageKeys, value);
}

export function formatPackageStatus(i18n: WorkbenchI18n, value: AssetWorkspacePackageStatus): string {
  return formatted(i18n, packageStatusMessageKeys, value);
}

export function formatImportStatus(i18n: WorkbenchI18n, value: GlbImportStatus): string {
  return formatted(i18n, importStatusMessageKeys, value);
}

function formatted<T extends string>(i18n: WorkbenchI18n, keys: Readonly<Record<T, WorkbenchMessageKey>>, value: T): string {
  return i18n.t(keys[value]);
}

/**
 * How an asset's file is maintained: a GLB is re-imported and its targets remapped, every other
 * payload is replaced in place. An unregistered asset has no file to re-import into.
 */
export interface AssetMaintenanceAction {
  mode: "replace" | "reimport";
  labelKey: WorkbenchMessageKey;
  hintKey: WorkbenchMessageKey;
  ariaKey: WorkbenchMessageKey;
}

export function assetMaintenanceAction(asset: { kind: AssetKind; registered: boolean }): AssetMaintenanceAction | null {
  if (!asset.registered) {
    return null;
  }
  if (asset.kind === "glb") {
    return {
      mode: "reimport",
      labelKey: "reactWorkbench.leftPanel.assets.reimport.label",
      hintKey: "reactWorkbench.leftPanel.assets.reimport.hint",
      ariaKey: "reactWorkbench.leftPanel.assets.reimport.aria"
    };
  }
  return {
    mode: "replace",
    labelKey: "reactWorkbench.leftPanel.assets.replace.label",
    hintKey: "reactWorkbench.leftPanel.assets.replace.hint",
    ariaKey: "reactWorkbench.leftPanel.assets.replace.aria"
  };
}

function normalizeDiagnosticCodePath(code: string): string {
  return code
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toLowerCase() + segment.slice(1))
    .join(".");
}

const workspaceStatusMessageKeys = {
  ready: "reactWorkbench.leftPanel.assets.status.ready",
  "missing-payload": "reactWorkbench.leftPanel.assets.status.missingPayload",
  "missing-reference": "reactWorkbench.leftPanel.assets.status.missingReference",
  "has-problems": "reactWorkbench.leftPanel.assets.status.hasProblems",
  unreferenced: "reactWorkbench.leftPanel.assets.status.unreferenced"
} satisfies Record<AssetWorkspaceStatus, WorkbenchMessageKey>;

const payloadStatusMessageKeys = {
  available: "reactWorkbench.leftPanel.assets.payloadStatus.available",
  missing: "reactWorkbench.leftPanel.assets.payloadStatus.missing",
  "not-required": "reactWorkbench.leftPanel.assets.payloadStatus.notRequired",
  "kind-mismatch": "reactWorkbench.leftPanel.assets.payloadStatus.kindMismatch"
} satisfies Record<AssetWorkspacePayloadStatus, WorkbenchMessageKey>;

const packageStatusMessageKeys = {
  complete: "reactWorkbench.leftPanel.assets.packageStatus.complete",
  partial: "reactWorkbench.leftPanel.assets.packageStatus.partial",
  blocked: "reactWorkbench.leftPanel.assets.packageStatus.blocked",
  "not-referenced": "reactWorkbench.leftPanel.assets.packageStatus.notReferenced"
} satisfies Record<AssetWorkspacePackageStatus, WorkbenchMessageKey>;

const importStatusMessageKeys = {
  "not-applicable": "reactWorkbench.leftPanel.assets.importStatus.notApplicable",
  "not-analyzed": "reactWorkbench.leftPanel.assets.importStatus.notAnalyzed",
  analyzed: "reactWorkbench.leftPanel.assets.importStatus.analyzed",
  "has-diagnostics": "reactWorkbench.leftPanel.assets.importStatus.hasDiagnostics",
  failed: "reactWorkbench.leftPanel.assets.importStatus.failed"
} satisfies Record<GlbImportStatus, WorkbenchMessageKey>;

const assetKindMessageKeys = {
  texture: "reactWorkbench.leftPanel.assets.kind.texture",
  image: "reactWorkbench.leftPanel.assets.kind.image",
  glb: "reactWorkbench.leftPanel.assets.kind.glb",
  hdr: "reactWorkbench.leftPanel.assets.kind.hdr"
} satisfies Record<AssetKind, WorkbenchMessageKey>;
