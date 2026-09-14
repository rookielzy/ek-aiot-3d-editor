import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type Dispatch, type DragEvent, type MutableRefObject, type SetStateAction } from "react";
import {
  filterAssetWorkspaceItems,
  sortAssetWorkspaceItems,
  type AssetKind,
  type AssetWorkspaceItem,
  type AssetWorkspacePackageStatus,
  type AssetWorkspacePayloadStatus,
  type AssetWorkspaceSortKey,
  type AssetWorkspaceStatus,
  type GlbImportDiagnostic,
  type GlbImportStatus,
  type MessageDescriptor,
  type ProjectProblem,
  type WorkbenchAssetImportDiagnostic,
  type WorkbenchHierarchyRow,
  type WorkbenchMissingAssetItem,
  type WorkbenchRasterImportKind
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchI18n, WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { problemToneFromCounts } from "./workbench-model-helpers";

export interface WorkbenchLeftPanelProps {
  context: ResolvedWorkbenchContext;
  activeView: WorkbenchPanelView;
}

type LocalizedStatusMessage =
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

type AssetRecoveryState = Record<string, LocalizedStatusMessage>;
type AssetQueueStatus = "queued" | "importing" | "succeeded" | "failed";
type AssetStatusFilter = "all" | AssetWorkspaceStatus;
type AssetKindFilter = "all" | AssetKind;
export type WorkbenchPanelView = "scene" | "assets" | "project";

interface AssetQueueItem {
  id: string;
  label: string;
  kind?: AssetKind;
  status: AssetQueueStatus;
  detail?: LocalizedStatusMessage;
  diagnostics: WorkbenchAssetImportDiagnostic[];
}

export function WorkbenchLeftPanel({ context, activeView }: WorkbenchLeftPanelProps) {
  const [recoveryState, setRecoveryState] = useState<AssetRecoveryState>({});
  const [recoverySuccessState, setRecoverySuccessState] = useState<AssetRecoveryState>({});
  const missingReplacementTokens = useRef<Record<string, symbol>>({});
  const [assetQuery, setAssetQuery] = useState("");
  const [assetKind, setAssetKind] = useState<AssetKindFilter>("all");
  const [assetStatus, setAssetStatus] = useState<AssetStatusFilter>("all");
  const [assetSort, setAssetSort] = useState<AssetWorkspaceSortKey>("status");
  const [rasterKind, setRasterKind] = useState<WorkbenchRasterImportKind>("texture");
  const [queue, setQueue] = useState<AssetQueueItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const model = context.model;
  const workspace = model.assets.workspace;
  const t = context.i18n.t;
  const missingProblemIdKey = model.assets.missing.map((item) => item.problemId).join("\n");
  const missingProblemIds = useMemo(() => new Set(
    missingProblemIdKey ? missingProblemIdKey.split("\n") : []
  ), [missingProblemIdKey]);
  const workspaceAssetIdKey = (workspace?.items ?? []).map((item) => item.id).join("\n");
  const workspaceAssetIds = useMemo(() => new Set(
    workspaceAssetIdKey ? workspaceAssetIdKey.split("\n") : []
  ), [workspaceAssetIdKey]);
  const visibleAssets = useMemo(() => {
    const items = workspace?.items ?? [];
    const filtered = filterAssetWorkspaceItems(items, {
      query: assetQuery,
      kinds: assetKind === "all" ? undefined : [assetKind],
      statuses: assetStatus === "all" ? undefined : [assetStatus]
    });
    return sortAssetWorkspaceItems(filtered, { key: assetSort });
  }, [assetKind, assetQuery, assetSort, assetStatus, workspace]);
  const problemTone = problemToneFromCounts(model.problems.bySeverity, model.problems.totalCount);

  useEffect(() => {
    setRecoveryState((current) => {
      let changed = false;
      const next: AssetRecoveryState = {};
      for (const [problemId, status] of Object.entries(current)) {
        if (missingProblemIds.has(problemId)) {
          next[problemId] = status;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [missingProblemIds]);

  useEffect(() => {
    setRecoverySuccessState((current) => {
      let changed = false;
      const next: AssetRecoveryState = {};
      for (const [assetId, status] of Object.entries(current)) {
        if (workspaceAssetIds.has(assetId)) {
          next[assetId] = status;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [workspaceAssetIds]);

  async function importAssetFiles(files: readonly File[]) {
    if (files.length === 0) {
      return;
    }

    const queueItems = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      label: file.name,
      status: "queued" as const,
      diagnostics: []
    }));
    const queuedIds = new Set(queueItems.map((item) => item.id));
    setQueue((current) => [
      ...queueItems.map((item) => ({ ...item, status: "importing" as const })),
      ...current
    ].slice(0, 8));

    let results;
    try {
      results = await context.assets.importFiles({
        rasterKind,
        files: files.map((file) => ({
          name: file.name,
          mimeType: file.type,
          source: file
        }))
      });
    } catch (error) {
      setQueue((current) => current.map((item) =>
        queuedIds.has(item.id)
          ? {
              ...item,
              status: "failed",
              detail: rawStatusMessage(error instanceof Error ? error.message : String(error)),
              diagnostics: []
            }
          : item
      ));
      return;
    }
    const resultsByQueueId = new Map(queueItems.map((item, index) => [item.id, results[index]]));
    setQueue((current) => current.map((item) => {
      const result = resultsByQueueId.get(item.id);
      if (!result) {
        return item;
      }
      return {
        ...item,
        kind: result.kind,
        status: result.status,
        detail: result.status === "succeeded"
          ? result.assetId
            ? localizedStatusMessage("reactWorkbench.leftPanel.assets.queue.importedAsset", "Imported {assetId}", { assetId: result.assetId })
            : localizedStatusMessage("reactWorkbench.leftPanel.assets.queue.imported", "Imported")
          : diagnosticStatusMessage(result.diagnostics[0]) ?? localizedStatusMessage("reactWorkbench.leftPanel.assets.queue.failedDetail", "Import failed"),
        diagnostics: result.diagnostics
      };
    }));
  }

  function onImportChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    void importAssetFiles(files);
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragActive(false);
    void importAssetFiles(Array.from(event.dataTransfer.files ?? []));
  }

  async function replaceMissingAsset(item: WorkbenchMissingAssetItem, event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    const operationToken = Symbol(item.problemId);
    missingReplacementTokens.current[item.assetId] = operationToken;
    setRecoverySuccessState((current) => {
      if (!current[item.assetId]) {
        return current;
      }
      const next = { ...current };
      delete next[item.assetId];
      return next;
    });
    setRecoveryState((current) => ({
      ...current,
      [item.problemId]: localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.progress", "Replacing...")
    }));
    const result = await context.replaceAsset({
      assetId: item.assetId,
      source: file,
      label: file.name,
      mimeType: file.type
    });
    if (result.ok) {
      await context.runtime?.project();
      context.refreshProblems();
      if (missingReplacementTokens.current[item.assetId] !== operationToken) {
        return;
      }
      delete missingReplacementTokens.current[item.assetId];
      setRecoverySuccessState((current) => ({
        ...current,
        [item.assetId]: localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.success", "Replaced with {fileName}", { fileName: file.name })
      }));
      setRecoveryState((current) => {
        const next = { ...current };
        delete next[item.problemId];
        return next;
      });
      return;
    }

    if (missingReplacementTokens.current[item.assetId] !== operationToken) {
      return;
    }
    delete missingReplacementTokens.current[item.assetId];
    setRecoveryState((current) => ({
      ...current,
      [item.problemId]: projectProblemStatusMessage(result.problems[0]) ?? localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.failed", "Replacement failed")
    }));
  }

  return (
    <div className="ek-workbench__default-left-panel">
      <section
        className="ek-workbench__panel-section"
        aria-label={t("reactWorkbench.leftPanel.hierarchy.label")}
        hidden={activeView !== "scene"}
      >
        <div className="ek-workbench__section-header">
          <h2>{t("reactWorkbench.leftPanel.hierarchy.label")}</h2>
          <span>{t("reactWorkbench.leftPanel.hierarchy.count", {
            selectedCount: model.hierarchy.selectedCount,
            totalCount: model.hierarchy.totalCount
          })}</span>
        </div>
        {model.hierarchy.empty ? (
          <p className="ek-workbench__empty">{t("reactWorkbench.leftPanel.hierarchy.empty")}</p>
        ) : (
          <ul className="ek-workbench__tree">
            {model.hierarchy.roots.map((row) => (
              <WorkbenchNodeRow key={row.id} context={context} row={row} />
            ))}
          </ul>
        )}
      </section>

      <section
        className="ek-workbench__panel-section"
        aria-label={t("reactWorkbench.leftPanel.assets.label")}
        hidden={activeView !== "assets"}
      >
        <div className="ek-workbench__section-header">
          <h2>{t("reactWorkbench.leftPanel.assets.label")}</h2>
          <span>{visibleAssets.length}/{workspace?.totalCount ?? model.assets.totalCount}</span>
        </div>
        <div
          className="ek-workbench__asset-import"
          data-drag-active={dragActive ? "true" : undefined}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
        >
          <label className="ek-workbench__asset-import-button">
            <span>{t("reactWorkbench.leftPanel.assets.import.label")}</span>
            <small>{t("reactWorkbench.leftPanel.assets.import.hint")}</small>
            <input aria-label={t("reactWorkbench.leftPanel.assets.import.label")} type="file" multiple onChange={onImportChange} />
          </label>
          <label className="ek-workbench__field">
            <span>{t("reactWorkbench.leftPanel.assets.rasterIntent.label")}</span>
            <select value={rasterKind} onChange={(event) => setRasterKind(event.target.value as WorkbenchRasterImportKind)}>
              <option value="texture">{t("reactWorkbench.leftPanel.assets.rasterIntent.texture")}</option>
              <option value="image">{t("reactWorkbench.leftPanel.assets.rasterIntent.image")}</option>
            </select>
          </label>
        </div>
        <div className="ek-workbench__asset-controls" aria-label={t("reactWorkbench.leftPanel.assets.controls.label")}>
          <label className="ek-workbench__field ek-workbench__field--search">
            <span>{t("reactWorkbench.leftPanel.assets.search.label")}</span>
            <input
              aria-label={t("reactWorkbench.leftPanel.assets.search.label")}
              value={assetQuery}
              onChange={(event) => setAssetQuery(event.target.value)}
              placeholder={t("reactWorkbench.leftPanel.assets.search.placeholder")}
            />
          </label>
          <label className="ek-workbench__field">
            <span>{t("reactWorkbench.leftPanel.assets.kind.label")}</span>
            <select aria-label={t("reactWorkbench.leftPanel.assets.kind.label")} value={assetKind} onChange={(event) => setAssetKind(event.target.value as AssetKindFilter)}>
              <option value="all">{t("reactWorkbench.leftPanel.assets.kind.all")}</option>
              <option value="glb">{t("reactWorkbench.leftPanel.assets.kind.glb")}</option>
              <option value="hdr">{t("reactWorkbench.leftPanel.assets.kind.hdr")}</option>
              <option value="texture">{t("reactWorkbench.leftPanel.assets.kind.texture")}</option>
              <option value="image">{t("reactWorkbench.leftPanel.assets.kind.image")}</option>
            </select>
          </label>
          <label className="ek-workbench__field">
            <span>{t("reactWorkbench.leftPanel.assets.status.label")}</span>
            <select aria-label={t("reactWorkbench.leftPanel.assets.status.label")} value={assetStatus} onChange={(event) => setAssetStatus(event.target.value as AssetStatusFilter)}>
              <option value="all">{t("reactWorkbench.leftPanel.assets.status.all")}</option>
              <option value="ready">{t("reactWorkbench.leftPanel.assets.status.ready")}</option>
              <option value="missing-payload">{t("reactWorkbench.leftPanel.assets.status.missingPayload")}</option>
              <option value="missing-reference">{t("reactWorkbench.leftPanel.assets.status.missingReference")}</option>
              <option value="has-problems">{t("reactWorkbench.leftPanel.assets.status.hasProblems")}</option>
              <option value="unreferenced">{t("reactWorkbench.leftPanel.assets.status.unreferenced")}</option>
            </select>
          </label>
          <label className="ek-workbench__field">
            <span>{t("reactWorkbench.leftPanel.assets.sort.label")}</span>
            <select aria-label={t("reactWorkbench.leftPanel.assets.sort.label")} value={assetSort} onChange={(event) => setAssetSort(event.target.value as AssetWorkspaceSortKey)}>
              <option value="status">{t("reactWorkbench.leftPanel.assets.sort.status")}</option>
              <option value="label">{t("reactWorkbench.leftPanel.assets.sort.byLabel")}</option>
              <option value="kind">{t("reactWorkbench.leftPanel.assets.sort.kind")}</option>
              <option value="referenced">{t("reactWorkbench.leftPanel.assets.sort.referenced")}</option>
              <option value="payload">{t("reactWorkbench.leftPanel.assets.sort.payload")}</option>
              <option value="severity">{t("reactWorkbench.leftPanel.assets.sort.severity")}</option>
            </select>
          </label>
        </div>
        {queue.length > 0 ? (
          <ul className="ek-workbench__asset-queue" aria-label={t("reactWorkbench.leftPanel.assets.queue.label")}>
            {queue.map((item) => (
              <li key={item.id} data-status={item.status}>
                <span>{item.label}</span>
                <small>
                  {t(`reactWorkbench.leftPanel.assets.queue.${item.status}`)}
                  {item.kind ? ` · ${item.kind}` : ""}
                  {item.detail ? ` · ${renderStatusMessage(context.i18n, item.detail)}` : ""}
                </small>
                {item.diagnostics.length > 0 ? (
                  <em>{item.diagnostics.map((diagnostic) => formatImportDiagnostic(context.i18n, diagnostic)).join("; ")}</em>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {!workspace || workspace.totalCount === 0 ? (
          <p className="ek-workbench__empty">{t("reactWorkbench.leftPanel.assets.empty")}</p>
        ) : (
          <ul className="ek-workbench__asset-list" aria-label={t("reactWorkbench.leftPanel.assets.rows.label")}>
            {visibleAssets.map((asset) => (
              <AssetWorkspaceRow
                key={asset.id}
                context={context}
                asset={asset}
                recoveryState={recoveryState}
                setRecoveryState={setRecoveryState}
                setRecoverySuccessState={setRecoverySuccessState}
                replacementTokens={missingReplacementTokens}
              />
            ))}
          </ul>
        )}
        {model.assets.missing.length > 0 ? (
          <div className="ek-workbench__recovery-list" aria-label={t("reactWorkbench.leftPanel.assets.recovery.label")}>
            {model.assets.missing.map((item) => (
              <label key={item.problemId} className="ek-workbench__file-action" data-severity={item.severity}>
                <span>{item.actionLabelDescriptor ? t(item.actionLabelDescriptor) : item.actionLabel ?? t("reactWorkbench.leftPanel.assets.replace.label")}</span>
                <strong>{item.label}</strong>
                <small>{recoveryState[item.problemId] ? renderStatusMessage(context.i18n, recoveryState[item.problemId]) : (item.titleDescriptor ? t(item.titleDescriptor) : item.title)}</small>
                <input type="file" onChange={(event) => void replaceMissingAsset(item, event)} />
              </label>
            ))}
          </div>
        ) : null}
        {Object.keys(recoverySuccessState).length > 0 ? (
          <div className="ek-workbench__recovery-list" aria-label={t("reactWorkbench.leftPanel.assets.recovery.status.label")}>
            {Object.entries(recoverySuccessState).map(([assetId, status]) => (
              <div key={assetId} className="ek-workbench__file-action" data-severity="success">
                <span>{t("reactWorkbench.leftPanel.assets.recovery.success.label")}</span>
                <strong>{assetId}</strong>
                <small>{renderStatusMessage(context.i18n, status)}</small>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section
        className="ek-workbench__panel-section"
        aria-label={t("reactWorkbench.leftPanel.project.label")}
        hidden={activeView !== "project"}
      >
        <div className="ek-workbench__section-header">
          <h2>{t("reactWorkbench.leftPanel.project.label")}</h2>
          <span>{t(model.project.statusLabelDescriptor ?? { key: "workbench.project.status.partial.label", fallback: model.project.statusLabel })}</span>
        </div>
        <dl className="ek-workbench__summary-list">
          <div>
            <dt>{t("reactWorkbench.leftPanel.project.scene")}</dt>
            <dd>{model.project.sceneName}</dd>
          </div>
          <div>
            <dt>{t("reactWorkbench.leftPanel.project.nodes")}</dt>
            <dd>{model.project.nodeCount}</dd>
          </div>
          <div>
            <dt>{t("reactWorkbench.leftPanel.project.objects")}</dt>
            <dd>{model.project.objectCount}</dd>
          </div>
          <div>
            <dt>{t("reactWorkbench.leftPanel.project.lights")}</dt>
            <dd>{model.project.lightCount}</dd>
          </div>
          <div>
            <dt>{t("reactWorkbench.leftPanel.project.assets")}</dt>
            <dd>{model.project.assetCount}</dd>
          </div>
        </dl>
        {model.problems.totalCount > 0 ? (
          <ul className="ek-workbench__problem-list" aria-label={t("reactWorkbench.leftPanel.project.problems.label")}>
            {model.problems.items.slice(0, 4).map((problem) => (
              <li key={problem.id} data-severity={problem.severity}>
                <span>{problem.titleDescriptor ? t(problem.titleDescriptor) : problem.title}</span>
                <small>
                  {problem.severity}
                  {problem.assetId ? ` · ${problem.assetId}` : ""}
                  {problem.actionLabel ? ` · ${problem.actionLabelDescriptor ? t(problem.actionLabelDescriptor) : problem.actionLabel}` : ""}
                </small>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function AssetWorkspaceRow({
  context,
  asset,
  recoveryState,
  setRecoveryState,
  setRecoverySuccessState,
  replacementTokens
}: {
  context: ResolvedWorkbenchContext;
  asset: AssetWorkspaceItem;
  recoveryState: AssetRecoveryState;
  setRecoveryState: Dispatch<SetStateAction<AssetRecoveryState>>;
  setRecoverySuccessState: Dispatch<SetStateAction<AssetRecoveryState>>;
  replacementTokens: MutableRefObject<Record<string, symbol>>;
}) {
  const t = context.i18n.t;
  const recoveryId = asset.problems.find((problem) => problem.actionLabel || problem.recoverability === "user-action")?.id ?? asset.id;

  async function replaceAsset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    const operationToken = Symbol(asset.id);
    replacementTokens.current[asset.id] = operationToken;
    setRecoverySuccessState((current) => {
      if (!current[asset.id]) {
        return current;
      }
      const next = { ...current };
      delete next[asset.id];
      return next;
    });
    setRecoveryState((current) => ({
      ...current,
      [recoveryId]: localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.progress", "Replacing...")
    }));
    const result = await context.assets.replaceAsset({
      assetId: asset.id,
      source: file,
      label: file.name,
      mimeType: file.type
    });
    if (result.ok) {
      await context.runtime?.project();
      context.refreshProblems();
      if (replacementTokens.current[asset.id] !== operationToken) {
        return;
      }
      delete replacementTokens.current[asset.id];
      setRecoveryState((current) => ({
        ...current,
        [recoveryId]: localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.success", "Replaced with {fileName}", { fileName: file.name })
      }));
      return;
    }
    if (replacementTokens.current[asset.id] !== operationToken) {
      return;
    }
    delete replacementTokens.current[asset.id];
    setRecoveryState((current) => ({
      ...current,
      [recoveryId]: projectProblemStatusMessage(result.problems[0]) ?? localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.failed", "Replacement failed")
    }));
  }

  async function reimportGlbAsset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    setRecoveryState((current) => ({
      ...current,
      [recoveryId]: localizedStatusMessage("reactWorkbench.leftPanel.assets.reimport.progress", "Analyzing GLB...")
    }));
    const result = await context.assets.reimportGlbAsset({
      assetId: asset.id,
      source: file
    });
    if (result.ok) {
      context.refreshProblems();
      setRecoveryState((current) => ({
        ...current,
        [recoveryId]: reimportSummaryStatusMessage(file.name, result.remap?.summary)
      }));
      return;
    }
    setRecoveryState((current) => ({
      ...current,
      [recoveryId]: glbDiagnosticStatusMessage(result.diagnostics[0]) ??
        (result.commandResult?.error ? rawStatusMessage(result.commandResult.error) : localizedStatusMessage("reactWorkbench.leftPanel.assets.reimport.failed", "Reimport failed"))
    }));
  }

  return (
    <li
      className="ek-workbench__asset-row"
      data-missing={asset.missing ? "true" : undefined}
      data-severity={asset.highestProblemSeverity ?? undefined}
      data-status={asset.status}
    >
      <div className="ek-workbench__asset-row-main">
        <span>{asset.label}</span>
        <small>{asset.id}</small>
      </div>
      <div className="ek-workbench__asset-badges" aria-label={t("reactWorkbench.leftPanel.assets.state.label", { assetLabel: asset.label })}>
        <span>{formatAssetKind(context.i18n, asset.kind)}</span>
        <span>{formatWorkspaceStatus(context.i18n, asset.status)}</span>
        <span>{formatPayloadStatus(context.i18n, asset.payloadStatus)}</span>
        <span>{formatPackageStatus(context.i18n, asset.packageStatus)}</span>
        {asset.importStatus ? <span>{formatImportStatus(context.i18n, asset.importStatus)}</span> : null}
      </div>
      <p className="ek-workbench__asset-meta">
        {asset.referenced
          ? t("reactWorkbench.leftPanel.assets.refs", { count: asset.referenceCount })
          : t("reactWorkbench.leftPanel.assets.unreferenced")}
        {asset.references.length > 0 ? ` · ${asset.references.slice(0, 2).map((reference) => reference.label).join(", ")}` : ""}
        {asset.problemCount ? ` · ${t("reactWorkbench.leftPanel.assets.problemCount", { count: asset.problemCount })}` : ""}
      </p>
      {asset.problems.length > 0 ? (
        <ul className="ek-workbench__asset-diagnostics" aria-label={t("reactWorkbench.leftPanel.assets.diagnostics.label", { assetLabel: asset.label })}>
          {asset.problems.slice(0, 3).map((problem) => (
            <li key={problem.id} data-severity={problem.severity}>
              <strong>{problem.titleDescriptor ? t(problem.titleDescriptor) : problem.title}</strong>
              {problem.detail ? <small>{problem.detailDescriptor ? t(problem.detailDescriptor) : problem.detail}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {asset.kind === "glb" && asset.registered ? (
        <label className="ek-workbench__asset-replace">
          <span>{t("reactWorkbench.leftPanel.assets.reimport.label")}</span>
          <small>{recoveryState[recoveryId] ? renderStatusMessage(context.i18n, recoveryState[recoveryId]) : t("reactWorkbench.leftPanel.assets.reimport.hint")}</small>
          <input
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            aria-label={t("reactWorkbench.leftPanel.assets.reimport.aria", { assetLabel: asset.label })}
            onChange={(event) => void reimportGlbAsset(event)}
          />
        </label>
      ) : asset.recoverable && asset.registered ? (
        <label className="ek-workbench__asset-replace">
          <span>{asset.actionLabelDescriptor ? t(asset.actionLabelDescriptor) : asset.actionLabel ?? t("reactWorkbench.leftPanel.assets.replace.label")}</span>
          <small>{recoveryState[recoveryId] ? renderStatusMessage(context.i18n, recoveryState[recoveryId]) : t("reactWorkbench.leftPanel.assets.replace.hint")}</small>
          <input type="file" aria-label={t("reactWorkbench.leftPanel.assets.replace.aria", { assetLabel: asset.label })} onChange={(event) => void replaceAsset(event)} />
        </label>
      ) : null}
    </li>
  );
}

function WorkbenchNodeRow({ context, row }: { context: ResolvedWorkbenchContext; row: WorkbenchHierarchyRow }) {
  const children = row.childIds
    .map((childId) => context.model.hierarchy.rows.find((candidate) => candidate.id === childId))
    .filter((child): child is WorkbenchHierarchyRow => Boolean(child));

  return (
    <li>
      <button
        type="button"
        className="ek-workbench__tree-row"
        data-selected={row.selected ? "true" : undefined}
        data-severity={row.highestProblemSeverity ?? undefined}
        onClick={() => context.dispatch({ type: "select-node", nodeId: row.id })}
        style={{ "--ek-workbench-tree-depth": row.depth } as CSSProperties}
      >
        <span>{row.label}</span>
        <small>
          {row.kind}
          {row.problemCount ? ` · ${row.problemCount}` : ""}
        </small>
      </button>
      {children.length > 0 ? (
        <ul>
          {children.map((child) => (
            <WorkbenchNodeRow key={child.id} context={context} row={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function localizedStatusMessage(
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

function descriptorStatusMessage(descriptor: MessageDescriptor): LocalizedStatusMessage {
  return {
    kind: "descriptor",
    descriptor
  };
}

function rawStatusMessage(value: string): LocalizedStatusMessage {
  return {
    kind: "raw",
    value
  };
}

function renderStatusMessage(i18n: WorkbenchI18n, message: LocalizedStatusMessage): string {
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

function diagnosticStatusMessage(diagnostic: WorkbenchAssetImportDiagnostic | undefined): LocalizedStatusMessage | undefined {
  if (!diagnostic) {
    return undefined;
  }
  return diagnostic.titleDescriptor
    ? descriptorStatusMessage(diagnostic.titleDescriptor)
    : rawStatusMessage(diagnostic.title);
}

function glbDiagnosticStatusMessage(diagnostic: GlbImportDiagnostic | undefined): LocalizedStatusMessage | undefined {
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

function projectProblemStatusMessage(problem: ProjectProblem | undefined): LocalizedStatusMessage | undefined {
  if (!problem) {
    return undefined;
  }
  return problem.display?.titleDescriptor
    ? descriptorStatusMessage(problem.display.titleDescriptor)
    : rawStatusMessage(problem.display?.title ?? problem.message);
}

function formatImportDiagnostic(i18n: WorkbenchI18n, diagnostic: WorkbenchAssetImportDiagnostic): string {
  return diagnostic.titleDescriptor ? i18n.t(diagnostic.titleDescriptor) : diagnostic.title;
}

function reimportSummaryStatusMessage(
  fileName: string,
  summary: { exactTargetCount: number; remappedTargetCount: number; newTargetCount: number; unresolvedTargetCount: number } | undefined
): LocalizedStatusMessage {
  if (!summary) {
    return localizedStatusMessage("reactWorkbench.leftPanel.assets.reimport.success", "Reimported {fileName}", { fileName });
  }
  return localizedStatusMessage("reactWorkbench.leftPanel.assets.reimport.summary", "{exactTargetCount} exact · {remappedTargetCount} remapped · {newTargetCount} new · {unresolvedTargetCount} unresolved", summary);
}

function formatAssetKind(i18n: WorkbenchI18n, value: AssetKind): string {
  return i18n.t(assetKindMessageKeys[value]);
}

function formatWorkspaceStatus(i18n: WorkbenchI18n, value: AssetWorkspaceStatus): string {
  return i18n.t(workspaceStatusMessageKeys[value]);
}

function formatPayloadStatus(i18n: WorkbenchI18n, value: AssetWorkspacePayloadStatus): string {
  return i18n.t(payloadStatusMessageKeys[value]);
}

function formatPackageStatus(i18n: WorkbenchI18n, value: AssetWorkspacePackageStatus): string {
  return i18n.t(packageStatusMessageKeys[value]);
}

function formatImportStatus(i18n: WorkbenchI18n, value: GlbImportStatus): string {
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
