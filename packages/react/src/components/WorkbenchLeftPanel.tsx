import { useMemo, useState, type ChangeEvent, type CSSProperties, type Dispatch, type DragEvent, type SetStateAction } from "react";
import {
  filterAssetWorkspaceItems,
  sortAssetWorkspaceItems,
  type AssetKind,
  type AssetWorkspaceItem,
  type AssetWorkspaceSortKey,
  type AssetWorkspaceStatus,
  type WorkbenchAssetImportDiagnostic,
  type WorkbenchHierarchyRow,
  type WorkbenchMissingAssetItem,
  type WorkbenchRasterImportKind
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchContext } from "../hooks/use-workbench";

export interface WorkbenchLeftPanelProps {
  context: WorkbenchContext;
}

type AssetRecoveryState = Record<string, string>;
type AssetQueueStatus = "queued" | "importing" | "succeeded" | "failed";
type AssetStatusFilter = "all" | AssetWorkspaceStatus;
type AssetKindFilter = "all" | AssetKind;

interface AssetQueueItem {
  id: string;
  label: string;
  kind?: AssetKind;
  status: AssetQueueStatus;
  detail?: string;
  diagnostics: WorkbenchAssetImportDiagnostic[];
}

export function WorkbenchLeftPanel({ context }: WorkbenchLeftPanelProps) {
  const [recoveryState, setRecoveryState] = useState<AssetRecoveryState>({});
  const [assetQuery, setAssetQuery] = useState("");
  const [assetKind, setAssetKind] = useState<AssetKindFilter>("all");
  const [assetStatus, setAssetStatus] = useState<AssetStatusFilter>("all");
  const [assetSort, setAssetSort] = useState<AssetWorkspaceSortKey>("status");
  const [rasterKind, setRasterKind] = useState<WorkbenchRasterImportKind>("texture");
  const [queue, setQueue] = useState<AssetQueueItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const model = context.model;
  const workspace = model.assets.workspace;
  const visibleAssets = useMemo(() => {
    const items = workspace?.items ?? [];
    const filtered = filterAssetWorkspaceItems(items, {
      query: assetQuery,
      kinds: assetKind === "all" ? undefined : [assetKind],
      statuses: assetStatus === "all" ? undefined : [assetStatus]
    });
    return sortAssetWorkspaceItems(filtered, { key: assetSort });
  }, [assetKind, assetQuery, assetSort, assetStatus, workspace]);

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
    setQueue((current) => [...queueItems, ...current].slice(0, 8));
    setQueue((current) => current.map((item) =>
      queueItems.some((queued) => queued.id === item.id) ? { ...item, status: "importing" } : item
    ));

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
        queueItems.some((queued) => queued.id === item.id)
          ? {
              ...item,
              status: "failed",
              detail: error instanceof Error ? error.message : String(error),
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
          ? result.assetId ? `Imported ${result.assetId}` : "Imported"
          : result.diagnostics[0]?.title ?? "Import failed",
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

    setRecoveryState((current) => ({ ...current, [item.problemId]: "Replacing..." }));
    const result = await context.replaceAsset({
      assetId: item.assetId,
      source: file,
      label: file.name,
      mimeType: file.type
    });
    if (result.ok) {
      await context.runtime?.project();
      context.refreshProblems();
      setRecoveryState((current) => ({ ...current, [item.problemId]: `Replaced with ${file.name}` }));
      return;
    }

    setRecoveryState((current) => ({
      ...current,
      [item.problemId]: result.problems[0]?.message ?? "Replacement failed"
    }));
  }

  return (
    <div className="ek-workbench__default-left-panel">
      <section className="ek-workbench__panel-section" aria-label="Hierarchy">
        <div className="ek-workbench__section-header">
          <h2>Hierarchy</h2>
          <span>{model.hierarchy.totalCount}</span>
        </div>
        {model.hierarchy.empty ? (
          <p className="ek-workbench__empty">No scene nodes.</p>
        ) : (
          <ul className="ek-workbench__tree">
            {model.hierarchy.roots.map((row) => (
              <WorkbenchNodeRow key={row.id} context={context} row={row} />
            ))}
          </ul>
        )}
      </section>

      <section className="ek-workbench__panel-section" aria-label="Assets">
        <div className="ek-workbench__section-header">
          <h2>Assets</h2>
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
            <span>Import assets</span>
            <small>GLB, HDR, image, texture</small>
            <input aria-label="Import assets" type="file" multiple onChange={onImportChange} />
          </label>
          <label className="ek-workbench__field">
            <span>Raster intent</span>
            <select value={rasterKind} onChange={(event) => setRasterKind(event.target.value as WorkbenchRasterImportKind)}>
              <option value="texture">Texture</option>
              <option value="image">Image</option>
            </select>
          </label>
        </div>
        <div className="ek-workbench__asset-controls" aria-label="Asset workspace controls">
          <label className="ek-workbench__field ek-workbench__field--search">
            <span>Search assets</span>
            <input
              aria-label="Search assets"
              value={assetQuery}
              onChange={(event) => setAssetQuery(event.target.value)}
              placeholder="Label, id, status, diagnostic"
            />
          </label>
          <label className="ek-workbench__field">
            <span>Kind</span>
            <select aria-label="Asset kind filter" value={assetKind} onChange={(event) => setAssetKind(event.target.value as AssetKindFilter)}>
              <option value="all">All kinds</option>
              <option value="glb">GLB</option>
              <option value="hdr">HDR</option>
              <option value="texture">Texture</option>
              <option value="image">Image</option>
            </select>
          </label>
          <label className="ek-workbench__field">
            <span>Status</span>
            <select aria-label="Asset status filter" value={assetStatus} onChange={(event) => setAssetStatus(event.target.value as AssetStatusFilter)}>
              <option value="all">All status</option>
              <option value="ready">Ready</option>
              <option value="missing-payload">Missing payload</option>
              <option value="missing-reference">Missing reference</option>
              <option value="has-problems">Has problems</option>
              <option value="unreferenced">Unreferenced</option>
            </select>
          </label>
          <label className="ek-workbench__field">
            <span>Sort</span>
            <select aria-label="Asset sort" value={assetSort} onChange={(event) => setAssetSort(event.target.value as AssetWorkspaceSortKey)}>
              <option value="status">Status</option>
              <option value="label">Label</option>
              <option value="kind">Kind</option>
              <option value="referenced">Referenced</option>
              <option value="payload">Payload</option>
              <option value="severity">Severity</option>
            </select>
          </label>
        </div>
        {queue.length > 0 ? (
          <ul className="ek-workbench__asset-queue" aria-label="Asset import queue">
            {queue.map((item) => (
              <li key={item.id} data-status={item.status}>
                <span>{item.label}</span>
                <small>
                  {item.status}
                  {item.kind ? ` · ${item.kind}` : ""}
                  {item.detail ? ` · ${item.detail}` : ""}
                </small>
                {item.diagnostics.length > 0 ? (
                  <em>{item.diagnostics.map((diagnostic) => diagnostic.title).join("; ")}</em>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {!workspace || workspace.totalCount === 0 ? (
          <p className="ek-workbench__empty">No registered assets.</p>
        ) : (
          <ul className="ek-workbench__asset-list" aria-label="Asset workspace rows">
            {visibleAssets.map((asset) => (
              <AssetWorkspaceRow key={asset.id} context={context} asset={asset} recoveryState={recoveryState} setRecoveryState={setRecoveryState} />
            ))}
          </ul>
        )}
        {model.assets.missing.length > 0 ? (
          <div className="ek-workbench__recovery-list" aria-label="Missing asset recovery">
            {model.assets.missing.map((item) => (
              <label key={item.problemId} className="ek-workbench__file-action" data-severity={item.severity}>
                <span>{item.actionLabel ?? "Replace asset"}</span>
                <strong>{item.label}</strong>
                <small>{recoveryState[item.problemId] ?? item.title}</small>
                <input type="file" onChange={(event) => void replaceMissingAsset(item, event)} />
              </label>
            ))}
          </div>
        ) : null}
      </section>

      <section className="ek-workbench__panel-section" aria-label="Project">
        <div className="ek-workbench__section-header">
          <h2>Project</h2>
          <span>{model.project.statusLabel}</span>
        </div>
        <dl className="ek-workbench__summary-list">
          <div>
            <dt>Scene</dt>
            <dd>{model.project.sceneName}</dd>
          </div>
          <div>
            <dt>Nodes</dt>
            <dd>{model.project.nodeCount}</dd>
          </div>
          <div>
            <dt>Objects</dt>
            <dd>{model.project.objectCount}</dd>
          </div>
          <div>
            <dt>Lights</dt>
            <dd>{model.project.lightCount}</dd>
          </div>
          <div>
            <dt>Assets</dt>
            <dd>{model.project.assetCount}</dd>
          </div>
        </dl>
        {model.problems.totalCount > 0 ? (
          <ul className="ek-workbench__problem-list" aria-label="Project problems">
            {model.problems.items.slice(0, 4).map((problem) => (
              <li key={problem.id} data-severity={problem.severity}>
                <span>{problem.title}</span>
                <small>
                  {problem.severity}
                  {problem.assetId ? ` · ${problem.assetId}` : ""}
                  {problem.actionLabel ? ` · ${problem.actionLabel}` : ""}
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
  setRecoveryState
}: {
  context: WorkbenchContext;
  asset: AssetWorkspaceItem;
  recoveryState: AssetRecoveryState;
  setRecoveryState: Dispatch<SetStateAction<AssetRecoveryState>>;
}) {
  const recoveryId = asset.problems.find((problem) => problem.actionLabel || problem.recoverability === "user-action")?.id ?? asset.id;

  async function replaceAsset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    setRecoveryState((current) => ({ ...current, [recoveryId]: "Replacing..." }));
    const result = await context.assets.replaceAsset({
      assetId: asset.id,
      source: file,
      label: file.name,
      mimeType: file.type
    });
    if (result.ok) {
      await context.runtime?.project();
      context.refreshProblems();
      setRecoveryState((current) => ({ ...current, [recoveryId]: `Replaced with ${file.name}` }));
      return;
    }
    setRecoveryState((current) => ({
      ...current,
      [recoveryId]: result.problems[0]?.message ?? "Replacement failed"
    }));
  }

  async function reimportGlbAsset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    setRecoveryState((current) => ({ ...current, [recoveryId]: "Analyzing GLB..." }));
    const result = await context.assets.reimportGlbAsset({
      assetId: asset.id,
      source: file
    });
    if (result.ok) {
      context.refreshProblems();
      setRecoveryState((current) => ({
        ...current,
        [recoveryId]: formatReimportSummary(file.name, result.remap?.summary)
      }));
      return;
    }
    setRecoveryState((current) => ({
      ...current,
      [recoveryId]: result.diagnostics[0]?.display.title ?? result.commandResult?.error ?? "Reimport failed"
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
      <div className="ek-workbench__asset-badges" aria-label={`${asset.label} asset state`}>
        <span>{asset.kind}</span>
        <span>{formatStatus(asset.status)}</span>
        <span>{formatStatus(asset.payloadStatus)}</span>
        <span>{formatStatus(asset.packageStatus)}</span>
        {asset.importStatus ? <span>{formatStatus(asset.importStatus)}</span> : null}
      </div>
      <p className="ek-workbench__asset-meta">
        {asset.referenced ? `${asset.referenceCount} refs` : "unreferenced"}
        {asset.references.length > 0 ? ` · ${asset.references.slice(0, 2).map((reference) => reference.label).join(", ")}` : ""}
        {asset.problemCount ? ` · ${asset.problemCount} problems` : ""}
      </p>
      {asset.problems.length > 0 ? (
        <ul className="ek-workbench__asset-diagnostics" aria-label={`${asset.label} diagnostics`}>
          {asset.problems.slice(0, 3).map((problem) => (
            <li key={problem.id} data-severity={problem.severity}>
              <strong>{problem.title}</strong>
              {problem.detail ? <small>{problem.detail}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {asset.kind === "glb" && asset.registered ? (
        <label className="ek-workbench__asset-replace">
          <span>Reimport GLB</span>
          <small>{recoveryState[recoveryId] ?? "Remap imported targets"}</small>
          <input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" aria-label={`Reimport ${asset.label}`} onChange={(event) => void reimportGlbAsset(event)} />
        </label>
      ) : asset.recoverable && asset.registered ? (
        <label className="ek-workbench__asset-replace">
          <span>{asset.actionLabel ?? "Replace asset"}</span>
          <small>{recoveryState[recoveryId] ?? "Preserves asset ID"}</small>
          <input type="file" aria-label={`Replace ${asset.label}`} onChange={(event) => void replaceAsset(event)} />
        </label>
      ) : null}
    </li>
  );
}

function WorkbenchNodeRow({ context, row }: { context: WorkbenchContext; row: WorkbenchHierarchyRow }) {
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

function formatStatus(value: string): string {
  return value.replace(/-/g, " ");
}

function formatReimportSummary(
  fileName: string,
  summary: { exactTargetCount: number; remappedTargetCount: number; newTargetCount: number; unresolvedTargetCount: number } | undefined
): string {
  if (!summary) {
    return `Reimported ${fileName}`;
  }
  return [
    `${summary.exactTargetCount} exact`,
    `${summary.remappedTargetCount} remapped`,
    `${summary.newTargetCount} new`,
    `${summary.unresolvedTargetCount} unresolved`
  ].join(" · ");
}
