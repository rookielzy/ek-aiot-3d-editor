import type {
  AssetKind,
  AssetWorkspacePackageStatus,
  AssetWorkspacePayloadStatus,
  AssetWorkspaceStatus,
  GlbImportDiagnostic,
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

export function diagnosticStatusMessage(diagnostic: WorkbenchAssetImportDiagnostic | undefined): LocalizedStatusMessage | undefined {
  if (!diagnostic) {
    return undefined;
  }
  return diagnostic.titleDescriptor
    ? descriptorStatusMessage(diagnostic.titleDescriptor)
    : rawStatusMessage(diagnostic.title);
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
  return problem.display?.titleDescriptor
    ? descriptorStatusMessage(problem.display.titleDescriptor)
    : rawStatusMessage(problem.display?.title ?? problem.message);
}

export function reimportSummaryStatusMessage(
  fileName: string,
  summary: { exactTargetCount: number; remappedTargetCount: number; newTargetCount: number; unresolvedTargetCount: number } | undefined
): LocalizedStatusMessage {
  if (!summary) {
    return localizedStatusMessage("reactWorkbench.leftPanel.assets.reimport.success", "Reimported {fileName}", { fileName });
  }
  return localizedStatusMessage(
    "reactWorkbench.leftPanel.assets.reimport.summary",
    "{exactTargetCount} exact · {remappedTargetCount} remapped · {newTargetCount} new · {unresolvedTargetCount} unresolved",
    summary
  );
}

export function formatImportDiagnostic(i18n: WorkbenchI18n, diagnostic: WorkbenchAssetImportDiagnostic): string {
  return diagnostic.titleDescriptor ? i18n.t(diagnostic.titleDescriptor) : diagnostic.title;
}

export function formatAssetKind(i18n: WorkbenchI18n, value: AssetKind): string {
  return i18n.t(assetKindMessageKeys[value]);
}

export function formatWorkspaceStatus(i18n: WorkbenchI18n, value: AssetWorkspaceStatus): string {
  return i18n.t(workspaceStatusMessageKeys[value]);
}

export function formatPayloadStatus(i18n: WorkbenchI18n, value: AssetWorkspacePayloadStatus): string {
  return i18n.t(payloadStatusMessageKeys[value]);
}

export function formatPackageStatus(i18n: WorkbenchI18n, value: AssetWorkspacePackageStatus): string {
  return i18n.t(packageStatusMessageKeys[value]);
}

export function formatImportStatus(i18n: WorkbenchI18n, value: GlbImportStatus): string {
  return i18n.t(importStatusMessageKeys[value]);
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
