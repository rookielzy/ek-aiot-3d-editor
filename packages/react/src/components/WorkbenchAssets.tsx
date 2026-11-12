import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type RefObject } from "react";
import {
  filterAssetWorkspaceItems,
  sortAssetWorkspaceItems,
  type AssetKind,
  type AssetWorkspaceItem,
  type AssetReferenceLocation,
  type AssetWorkspaceSortKey,
  type AssetWorkspaceStatus,
  type WorkbenchAssetImportDiagnostic,
  type WorkbenchMissingAssetItem,
  type WorkbenchRasterImportKind
} from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import type { WorkbenchMessageKey } from "../i18n/workbench-i18n";
import {
  assetMaintenanceAction,
  diagnosticStatusMessage,
  formatAssetKind,
  formatImportStatus,
  formatImportDiagnostic,
  formatPackageStatus,
  formatPayloadStatus,
  formatWorkspaceStatus,
  glbDiagnosticStatusMessage,
  localizedStatusMessage,
  reimportSummaryStatusMessage,
  rawStatusMessage,
  renderDescriptor,
  renderStatusMessage,
  type AssetMaintenanceAction,
  type AssetRecoveryState,
  type LocalizedStatusMessage
} from "./asset-workspace-status";
import { CommandMenu, type CommandMenuCommand } from "./ui/command-menu-list";
import { useCommandMenu } from "./ui/command-menu";
import { Popover, PopoverContent, PopoverTrigger, getPortalTheme } from "./ui/Popover";
import { WorkbenchIcon } from "./WorkbenchIcon";
import { replaceAssetFile, serializeAssetMaintenance } from "./asset-maintenance";

type AssetQueueStatus = "queued" | "importing" | "succeeded" | "failed";
type AssetStatusFilter = "all" | AssetWorkspaceStatus;
type AssetKindFilter = "all" | AssetKind;
type AssetPickedFile = (assetId: string, file: File, mode: AssetMaintenanceAction["mode"]) => Promise<void>;

interface AssetQueueItem {
  id: string;
  label: string;
  kind?: AssetKind;
  status: AssetQueueStatus;
  detail?: LocalizedStatusMessage;
  diagnostics: WorkbenchAssetImportDiagnostic[];
}

const REIMPORT_ACCEPT = ".glb,.gltf,model/gltf-binary,model/gltf+json";

export interface AssetListCounts {
  visible: number;
  total: number;
}

/**
 * The asset workspace: what each asset is, what depends on it, and the one maintenance action it
 * offers — in that order, top to bottom. A row reads as a summary (name, kind, status, relation)
 * and opens into the rest of the record, so the list stays scannable while every detail the
 * inspector can act on stays one press away.
 *
 * Filter, sort, expansion, import queue and maintenance feedback are view state owned here; the
 * durable record stays the editor's scene snapshot.
 */
export function WorkbenchAssets({ context, onCountChange, locate, onLocateHandled }: {
  context: ResolvedWorkbenchContext;
  /** Reports the visible/total counts so the section header can state them. */
  onCountChange?(counts: AssetListCounts): void;
  /** An asset another region asked this workspace to reveal; cleared by the owner once handled. */
  locate?: { assetId: string } | null;
  onLocateHandled?(): void;
}) {
  const [recoveryState, setRecoveryState] = useState<AssetRecoveryState>({});
  const [recoverySuccessState, setRecoverySuccessState] = useState<AssetRecoveryState>({});
  const maintenanceTokens = useRef<Record<string, symbol>>({});
  const summaryElements = useRef(new Map<string, HTMLButtonElement>());
  const pendingLocate = useRef<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AssetKindFilter>("all");
  const [status, setStatus] = useState<AssetStatusFilter>("all");
  const [sort, setSort] = useState<AssetWorkspaceSortKey>("status");
  const [rasterKind, setRasterKind] = useState<WorkbenchRasterImportKind>("texture");
  const nextQueueId = useRef(0);
  const [queue, setQueue] = useState<AssetQueueItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const model = context.model;
  const t = context.i18n.t;
  const workspace = model.assets.workspace;
  const workspaceAssetIdKey = (workspace?.items ?? []).map((item) => item.id).join("\u0000");
  const workspaceAssetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of workspaceAssetIdKey ? workspaceAssetIdKey.split("\u0000") : []) ids.add(id);
    return ids;
  }, [workspaceAssetIdKey]);
  const visibleAssets = useMemo(() => {
    const items = workspace?.items ?? [];
    const filtered = filterAssetWorkspaceItems(items, {
      query,
      kinds: kind === "all" ? undefined : [kind],
      statuses: status === "all" ? undefined : [status]
    });
    return sortAssetWorkspaceItems(filtered, { key: sort });
  }, [kind, query, sort, status, workspace]);
  const totalCount = workspace?.totalCount ?? model.assets.totalCount;

  // Feedback belongs to an asset, so it leaves with it.
  useEffect(() => {
    for (const assetId of Object.keys(maintenanceTokens.current)) {
      if (!workspaceAssetIds.has(assetId)) delete maintenanceTokens.current[assetId];
    }
    setRecoveryState((current) => pruneRecoveryState(current, workspaceAssetIds));
  }, [workspaceAssetIds]);

  useEffect(() => {
    setRecoverySuccessState((current) => pruneRecoveryState(current, workspaceAssetIds));
  }, [workspaceAssetIds]);

  useEffect(() => {
    onCountChange?.({ visible: visibleAssets.length, total: totalCount });
  }, [onCountChange, totalCount, visibleAssets.length]);

  // A locate request names an asset the filters may be hiding; the request is answered by dropping
  // them, then focusing that asset's row once it exists.
  useEffect(() => {
    if (!locate) return;
    onLocateHandled?.();
    if (!workspaceAssetIds.has(locate.assetId)) return;
    setQuery("");
    setKind("all");
    setStatus("all");
    pendingLocate.current = locate.assetId;
  }, [locate, onLocateHandled, workspaceAssetIds]);

  useLayoutEffect(() => {
    const target = pendingLocate.current;
    if (!target) return;
    const element = summaryElements.current.get(target);
    if (!element) return;
    pendingLocate.current = null;
    element.focus();
    element.scrollIntoView?.({ block: "nearest" });
  });

  async function importAssetFiles(files: readonly File[]) {
    if (files.length === 0) {
      return;
    }

    const queueItems = files.map((file) => ({
      id: String(nextQueueId.current++),
      label: file.name,
      status: "queued" as const,
      diagnostics: [] as WorkbenchAssetImportDiagnostic[]
    }));
    const queuedIds = new Set(queueItems.map((item) => item.id));
    setQueue((current) => [
      ...queueItems.map((item) => ({ ...item, status: "importing" as const })),
      ...current
    ]);

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
      if (!item.diagnostics.length && !result) {
        // No per-file result: report the file as failed rather than leaving it "importing".
        return queuedIds.has(item.id)
          ? { ...item, status: "failed", detail: localizedStatusMessage("reactWorkbench.leftPanel.assets.queue.failedDetail", "Import failed") }
          : item;
      }
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

  async function maintainAsset(assetId: string, file: File, mode: AssetMaintenanceAction["mode"]) {
    const recoveringMissing = model.assets.missing.some((item) => item.assetId === assetId);
    const token = Symbol(assetId);
    maintenanceTokens.current[assetId] = token;
    setRecoverySuccessState((current) => {
      const next = { ...current };
      delete next[assetId];
      return next;
    });
    setRecoveryState((current) => ({
      ...current,
      [assetId]: mode === "reimport"
        ? localizedStatusMessage("reactWorkbench.leftPanel.assets.reimport.progress", "Analyzing GLB...")
        : localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.progress", "Replacing...")
    }));

    // Core reimport commits after asynchronous analysis. Serialize per asset so an
    // older analysis cannot commit after the latest file, across all entry points.
    try {
      await serializeAssetMaintenance(context.editor, assetId, async () => {
        if (maintenanceTokens.current[assetId] !== token) return;
        let message: LocalizedStatusMessage;
        let replaced = false;
        try {
          if (mode === "reimport") {
            const result = await context.assets.reimportGlbAsset({ assetId, source: file });
            message = result.ok
              ? reimportSummaryStatusMessage(file.name, result.remap?.summary)
              : glbDiagnosticStatusMessage(result.diagnostics[0]) ??
                (result.commandResult?.error ? rawStatusMessage(result.commandResult.error) : localizedStatusMessage("reactWorkbench.leftPanel.assets.reimport.failed", "Reimport failed"));
          } else {
            const outcome = await replaceAssetFile(context, assetId, file);
            replaced = outcome.replaced;
            message = outcome.message;
          }
          context.refreshProblems();
        } catch (error) {
          message = rawStatusMessage(error instanceof Error ? error.message : String(error));
        }
        if (maintenanceTokens.current[assetId] !== token) return;
        delete maintenanceTokens.current[assetId];
        setRecoveryState((current) => ({ ...current, [assetId]: message }));
        if (replaced && recoveringMissing) {
          setRecoverySuccessState((current) => ({ ...current, [assetId]: message }));
        }
      });
    } finally {
      if (maintenanceTokens.current[assetId] === token) delete maintenanceTokens.current[assetId];
    }
  }

  // Core reports every missing payload in `assets.missing`, whatever the filters show. A missing
  // asset that is still listed carries its recovery action inside its row; the ones the filters
  // hide keep their action below the list instead of losing it with their row.
  const visibleIds = new Set(visibleAssets.map((asset) => asset.id));
  const recoveryByAsset = new Map<string, WorkbenchMissingAssetItem[]>();
  for (const item of model.assets.missing) {
    const entries = recoveryByAsset.get(item.assetId) ?? [];
    entries.push(item);
    recoveryByAsset.set(item.assetId, entries);
  }
  const hiddenRecovery = model.assets.missing.filter((item) => !visibleIds.has(item.assetId));

  return (
    <div className="ek-workbench__assets">
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
          <select aria-label={t("reactWorkbench.leftPanel.assets.rasterIntent.label")} value={rasterKind} onChange={(event) => setRasterKind(event.target.value as WorkbenchRasterImportKind)}>
            <option value="texture">{t("reactWorkbench.leftPanel.assets.rasterIntent.texture")}</option>
            <option value="image">{t("reactWorkbench.leftPanel.assets.rasterIntent.image")}</option>
          </select>
        </label>
      </div>
      <div className="ek-workbench__asset-controls" aria-label={t("reactWorkbench.leftPanel.assets.controls.label")}>
        <label className="ek-workbench__field ek-workbench__field--search">
          <span>{t("reactWorkbench.leftPanel.assets.search.label")}</span>
          <input
            type="search"
            aria-label={t("reactWorkbench.leftPanel.assets.search.label")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("reactWorkbench.leftPanel.assets.search.placeholder")}
          />
        </label>
        <label className="ek-workbench__field">
          <span>{t("reactWorkbench.leftPanel.assets.kind.label")}</span>
          <select aria-label={t("reactWorkbench.leftPanel.assets.kind.label")} value={kind} onChange={(event) => setKind(event.target.value as AssetKindFilter)}>
            <option value="all">{t("reactWorkbench.leftPanel.assets.kind.all")}</option>
            <option value="glb">{t("reactWorkbench.leftPanel.assets.kind.glb")}</option>
            <option value="hdr">{t("reactWorkbench.leftPanel.assets.kind.hdr")}</option>
            <option value="texture">{t("reactWorkbench.leftPanel.assets.kind.texture")}</option>
            <option value="image">{t("reactWorkbench.leftPanel.assets.kind.image")}</option>
          </select>
        </label>
        <label className="ek-workbench__field">
          <span>{t("reactWorkbench.leftPanel.assets.status.label")}</span>
          <select aria-label={t("reactWorkbench.leftPanel.assets.status.label")} value={status} onChange={(event) => setStatus(event.target.value as AssetStatusFilter)}>
            <option value="all">{t("reactWorkbench.leftPanel.assets.status.all")}</option>
            <option value="ready">{t("reactWorkbench.leftPanel.assets.status.ready")}</option>
            <option value="missing-payload">{t("reactWorkbench.leftPanel.assets.status.missingPayload")}</option>
            <option value="missing-reference">{t("reactWorkbench.leftPanel.assets.status.missingReference")}</option>
            <option value="has-problems">{t("reactWorkbench.leftPanel.assets.status.hasProblems")}</option>
            <option value="unreferenced">{t("reactWorkbench.leftPanel.assets.status.unreferenced")}</option>
          </select>
        </label>
        <label className="ek-workbench__field ek-workbench__field--sort">
          <span>{t("reactWorkbench.leftPanel.assets.sort.label")}</span>
          <select aria-label={t("reactWorkbench.leftPanel.assets.sort.label")} value={sort} onChange={(event) => setSort(event.target.value as AssetWorkspaceSortKey)}>
            <option value="status">{t("reactWorkbench.leftPanel.assets.sort.status")}</option>
            <option value="label">{t("reactWorkbench.leftPanel.assets.sort.byLabel")}</option>
            <option value="kind">{t("reactWorkbench.leftPanel.assets.sort.kind")}</option>
            <option value="referenced">{t("reactWorkbench.leftPanel.assets.sort.referenced")}</option>
            <option value="payload">{t("reactWorkbench.leftPanel.assets.sort.payload")}</option>
            <option value="severity">{t("reactWorkbench.leftPanel.assets.sort.severity")}</option>
          </select>
        </label>
      </div>
      {queue.length > 0 ? <AssetImportQueue context={context} queue={queue} onClear={() => setQueue([])} /> : null}
      {!workspace || workspace.totalCount === 0 ? (
        <p className="ek-workbench__empty">{t("reactWorkbench.leftPanel.assets.empty")}</p>
      ) : visibleAssets.length === 0 ? (
        <p className="ek-workbench__empty" role="status">{t("reactWorkbench.leftPanel.assets.noMatches")}</p>
      ) : (
        <ul className="ek-workbench__asset-list" aria-label={t("reactWorkbench.leftPanel.assets.rows.label")}>
          {visibleAssets.map((asset) => (
            <AssetRow
              key={asset.id}
              context={context}
              asset={asset}
              recoveryState={recoveryState}
              recovery={recoveryByAsset.get(asset.id) ?? []}
              onPicked={maintainAsset}
              registerSummary={(element) => {
                if (element) {
                  summaryElements.current.set(asset.id, element);
                  return;
                }
                summaryElements.current.delete(asset.id);
              }}
            />
          ))}
        </ul>
      )}
      {hiddenRecovery.length > 0 ? (
        <div className="ek-workbench__recovery-list" aria-label={t("reactWorkbench.leftPanel.assets.recovery.label")}>
          <small className="ek-workbench__recovery-note">{t("reactWorkbench.leftPanel.assets.recovery.orphan")}</small>
          {hiddenRecovery.map((item) => (
            <RecoveryAction
              key={item.problemId}
              context={context}
              item={item}
              message={recoveryState[item.assetId]}
              onPicked={maintainAsset}
            />
          ))}
        </div>
      ) : null}
      {Object.keys(recoverySuccessState).length > 0 ? (
        <div className="ek-workbench__recovery-list" aria-label={t("reactWorkbench.leftPanel.assets.recovery.status.label")}>
          {Object.entries(recoverySuccessState).map(([assetId, message]) => (
            <div key={assetId} className="ek-workbench__file-action" data-severity="success">
              <span>{t("reactWorkbench.leftPanel.assets.recovery.success.label")}</span>
              <strong>{assetId}</strong>
              <small>{renderStatusMessage(context.i18n, message)}</small>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The missing-payload action, rendered where its problem is reported. */
function RecoveryAction({ context, item, message, onPicked }: {
  context: ResolvedWorkbenchContext;
  item: WorkbenchMissingAssetItem;
  message: LocalizedStatusMessage | undefined;
  onPicked: AssetPickedFile;
}) {
  const t = context.i18n.t;
  return (
    <label className="ek-workbench__file-action" data-severity={item.severity}>
      <span>{item.actionLabelDescriptor ? t(item.actionLabelDescriptor) : item.actionLabel ?? t("reactWorkbench.leftPanel.assets.replace.label")}</span>
      <strong>{item.label}</strong>
      <small role="status">{message ? renderStatusMessage(context.i18n, message) : renderDescriptor(item.titleDescriptor, item.title, context.i18n)}</small>
      <input
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void onPicked(item.assetId, file, "replace");
        }}
      />
    </label>
  );
}

/**
 * One asset: a summary a reader can scan, a details panel they can open, and a menu that holds
 * this asset's file actions so the controls are reachable without the details being open.
 */
function AssetRow({ context, asset, recoveryState, recovery, onPicked, registerSummary }: {
  context: ResolvedWorkbenchContext;
  asset: AssetWorkspaceItem;
  recoveryState: AssetRecoveryState;
  recovery: readonly WorkbenchMissingAssetItem[];
  onPicked: AssetPickedFile;
  /** Publishes this row's summary control so an external locate request can land focus on it. */
  registerSummary?(element: HTMLButtonElement | null): void;
}) {
  const t = context.i18n.t;
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const menu = useCommandMenu();
  const panel = useRef<HTMLDivElement | null>(null);
  const maintenanceInput = useRef<HTMLInputElement | null>(null);
  const focusMaintenance = useRef(false);
  const moreId = `${id}-more`;
  const menuLabel = t("reactWorkbench.leftPanel.assets.maintenance.menu", { assetLabel: asset.label });
  const status = recoveryState[asset.id];
  const maintenance = assetMaintenanceAction(asset);
  const open = menu.open === asset.id;
  const detailId = `${id}-details`;

  useLayoutEffect(() => {
    if (open || !expanded || !focusMaintenance.current) return;
    focusMaintenance.current = false;
    maintenanceInput.current?.focus();
  }, [open, expanded]);

  function closeMenu(restore = true) {
    menu.closeMenu({ restore });
  }

  const commands: CommandMenuCommand[] = [
    {
      key: "details",
      label: expanded
        ? t("reactWorkbench.leftPanel.assets.details.hide", { assetLabel: asset.label })
        : t("reactWorkbench.leftPanel.assets.details.show", { assetLabel: asset.label }),
      icon: <WorkbenchIcon name="data" />,
      kind: "action",
      onClick: () => {
        closeMenu();
        setExpanded((current) => !current);
      }
    },
    ...(maintenance
      ? [{
          key: "file",
          label: maintenance.mode === "reimport"
            ? t("reactWorkbench.leftPanel.assets.maintenance.reimport")
            : t("reactWorkbench.leftPanel.assets.maintenance.replace"),
          title: t(maintenance.labelKey),
          icon: <WorkbenchIcon name="open" />,
          kind: "action" as const,
          // The details region owns the single file input for this row; the menu only opens it,
          // so every route into the action lands on the same control.
          onClick: () => {
            focusMaintenance.current = true;
            closeMenu(false);
            setExpanded(true);
          }
        }]
      : [{
          key: "none",
          label: t("reactWorkbench.leftPanel.assets.maintenance.empty"),
          icon: <WorkbenchIcon name="data" />,
          kind: "action" as const,
          disabled: true,
          onClick: () => undefined
        }])
  ];

  return (
    <li
      className="ek-workbench__asset-row"
      data-missing={asset.missing ? "true" : undefined}
      data-severity={asset.highestProblemSeverity ?? undefined}
      data-status={asset.status}
      data-expanded={expanded ? "true" : undefined}
    >
      <div className="ek-workbench__asset-summary-row">
        <button
          type="button"
          ref={registerSummary}
          className="ek-workbench__asset-summary"
          aria-expanded={expanded}
          aria-controls={detailId}
          aria-label={t(expanded
            ? "reactWorkbench.leftPanel.assets.details.hide"
            : "reactWorkbench.leftPanel.assets.details.show", { assetLabel: asset.label })}
          title={t("reactWorkbench.leftPanel.assets.details.label", { assetLabel: asset.label })}
          onClick={() => setExpanded((current) => !current)}
        >
          <WorkbenchIcon name="data" />
        </button>
        <div className="ek-workbench__asset-row-main">
          <span className="ek-workbench__asset-label">{asset.label}</span>
          <small>{asset.id}</small>
        </div>
        <Popover
          open={open}
          onOpenChange={(next) => {
            if (!next) closeMenu(false);
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              id={moreId}
              ref={menu.triggerRef(asset.id)}
              className="ek-workbench__asset-more"
              aria-label={menuLabel}
              title={menuLabel}
              aria-haspopup="menu"
              aria-expanded={open}
              data-state={open ? "open" : "closed"}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                if (open) return closeMenu();
                menu.openMenu(asset.id);
              }}
            >
              <WorkbenchIcon name="more" />
            </button>
          </PopoverTrigger>
          {open ? (
            <PopoverContent
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => event.preventDefault()}
              onPointerDownOutside={(event) => event.preventDefault()}
              onFocusOutside={(event) => event.preventDefault()}
              onEscapeKeyDown={(event) => event.preventDefault()}
              ref={(node) => {
                panel.current = node;
                menu.panelRef(asset.id)(node);
              }}
              className="ek-workbench__menu ek-workbench__tree-menu ek-workbench__asset-menu"
              data-state="open"
              style={getPortalTheme(document.getElementById(moreId))}
              onKeyDown={(event) => {
                if (event.defaultPrevented) return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeMenu();
                  return;
                }
                if (event.key === "Tab") {
                  closeMenu(false);
                }
              }}
            >
              <CommandMenu
                group={{ key: asset.id, label: menuLabel, kind: "action", commands }}
                idPrefix={`${id}-asset-menu`}
                onMoveFocus={menu.moveFocus}
                onActivate={(commandKey) => menu.focusItem(panel.current, commandKey)}
                roving={menu.roving}
                onEscape={() => closeMenu()}
                onTab={() => closeMenu(false)}
                claimEntry
              />
            </PopoverContent>
          ) : null}
        </Popover>
      </div>
      <div className="ek-workbench__asset-meta-row">
        <div className="ek-workbench__asset-badges" aria-label={t("reactWorkbench.leftPanel.assets.state.label", { assetLabel: asset.label })}>
          <span>{formatAssetKind(context.i18n, asset.kind)}</span>
          <span>{formatWorkspaceStatus(context.i18n, asset.status)}</span>
          <span>{formatPayloadStatus(context.i18n, asset.payloadStatus)}</span>
          <span>{formatPackageStatus(context.i18n, asset.packageStatus)}</span>
          {asset.importStatus ? <span>{formatImportStatus(context.i18n, asset.importStatus)}</span> : null}
          {asset.referenced ? null : <span>{t("reactWorkbench.leftPanel.assets.unreferenced")}</span>}
        </div>
        <p className="ek-workbench__asset-meta">
          {t("reactWorkbench.leftPanel.assets.details.summary", {
            referenceCount: asset.referenceCount,
            problemCount: asset.problemCount,
            payloadStatus: formatPayloadStatus(context.i18n, asset.payloadStatus),
          })}
          {asset.references.length > 0 ? ` · ${asset.references.map((reference) => labelReference(context, reference)).join(", ")}` : ""}
        </p>
      </div>
      {asset.missing && recovery.length > 0 ? (
        <div className="ek-workbench__recovery-list" aria-label={t("reactWorkbench.leftPanel.assets.recovery.label")}>
          {recovery.map((item) => (
            <RecoveryAction
              key={item.problemId}
              context={context}
              item={item}
              message={recoveryState[item.assetId]}
              onPicked={onPicked}
            />
          ))}
        </div>
      ) : null}
      <AssetDetails
        context={context}
        asset={asset}
        maintenance={maintenance}
        id={detailId}
        expanded={expanded}
        inputRef={maintenanceInput}
        onPicked={(file) => onPicked(asset.id, file, maintenance?.mode ?? "replace")}
      />
      {status ? <small className="ek-workbench__asset-status" role="status">{renderStatusMessage(context.i18n, status)}</small> : null}
    </li>
  );
}

function AssetDetails({ context, asset, maintenance, id, expanded, inputRef, onPicked }: {
  context: ResolvedWorkbenchContext;
  asset: AssetWorkspaceItem;
  maintenance: AssetMaintenanceAction | null;
  id: string;
  expanded: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onPicked(file: File): void;
}) {
  const t = context.i18n.t;
  return (
    <div className="ek-workbench__asset-details" id={id} hidden={!expanded}>
      <dl className="ek-workbench__asset-facts">
        <div>
          <dt>{t("reactWorkbench.leftPanel.assets.sort.payload")}</dt>
          <dd>{formatPayloadStatus(context.i18n, asset.payloadStatus)}</dd>
        </div>
        {asset.payload?.byteSize !== undefined ? (
          <div>
            <dt>{t("reactWorkbench.leftPanel.assets.details.byteSize")}</dt>
            <dd>{asset.payload.byteSize}</dd>
          </div>
        ) : null}
        {asset.payload?.mimeType ? (
          <div>
            <dt>{t("reactWorkbench.leftPanel.assets.details.mimeType")}</dt>
            <dd>{asset.payload.mimeType}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t("reactWorkbench.leftPanel.assets.sort.status")}</dt>
          <dd>{asset.importStatus ? formatImportStatus(context.i18n, asset.importStatus) : t("reactWorkbench.leftPanel.assets.importStatus.notApplicable")}</dd>
        </div>
      </dl>
      <div className="ek-workbench__asset-refs">
        <h3>{t("reactWorkbench.leftPanel.assets.details.references")}</h3>
        {asset.references.length > 0 ? (
          <ul>
            {asset.references.map((reference, index) => (
              <li key={`${reference.kind}-${index}`}>
                {labelReference(context, reference)}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t("reactWorkbench.leftPanel.assets.details.noReferences")}</p>
        )}
      </div>
      {asset.problems.length > 0 ? (
        <h3>{t("reactWorkbench.leftPanel.assets.details.problems")}</h3>
      ) : null}
      {asset.problems.length > 0 ? (
        <ul className="ek-workbench__asset-diagnostics" aria-label={t("reactWorkbench.leftPanel.assets.diagnostics.label", { assetLabel: asset.label })}>
          {asset.problems.map((problem) => (
            <li key={problem.id} data-severity={problem.severity}>
              <strong>{renderDescriptor(problem.titleDescriptor, problem.title, context.i18n)}</strong>
              {problem.detailDescriptor || problem.detail ? (
                <small>{renderDescriptor(problem.detailDescriptor, problem.detail ?? "", context.i18n)}</small>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {asset.missing ? (
        <p className="ek-workbench__asset-note" data-severity={asset.highestProblemSeverity ?? "warning"}>
          {t("reactWorkbench.leftPanel.assets.details.missing")}
        </p>
      ) : null}
      {maintenance ? (
        <label className="ek-workbench__asset-replace">
          <span>{maintenance.mode === "replace" && asset.actionLabelDescriptor ? t(asset.actionLabelDescriptor) : t(maintenance.labelKey)}</span>
          <small>{t(maintenance.hintKey)}</small>
          <input
            ref={inputRef}
            data-maintenance={maintenance.mode}
            type="file"
            accept={maintenance.mode === "reimport" ? REIMPORT_ACCEPT : undefined}
            aria-label={t(maintenance.ariaKey, { assetLabel: asset.label })}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) onPicked(file);
            }}
          />
        </label>
      ) : null}
    </div>
  );
}

function labelReference(context: ResolvedWorkbenchContext, reference: AssetReferenceLocation): string {
  return renderDescriptor(reference.labelDescriptor, reference.label, context.i18n);
}

/** Every file in the batch keeps its own line: a batch that half-succeeds never reads as success. */
function AssetImportQueue({ context, queue, onClear }: {
  context: ResolvedWorkbenchContext;
  queue: readonly AssetQueueItem[];
  onClear(): void;
}) {
  const t = context.i18n.t;
  const succeeded = queue.filter((item) => item.status === "succeeded").length;
  const failed = queue.filter((item) => item.status === "failed").length;
  const pending = queue.length - succeeded - failed;
  return (
    <div className="ek-workbench__asset-queue-group">
      <div className="ek-workbench__asset-queue-header">
        <span>
          {pending > 0
            ? t("reactWorkbench.leftPanel.assets.queue.importing.label")
            : t("reactWorkbench.leftPanel.assets.queue.summary", { succeededCount: succeeded, failedCount: failed })}
        </span>
        <button type="button" className="ek-workbench__asset-queue-clear" onClick={onClear}>
          {t("reactWorkbench.leftPanel.assets.queue.clear")}
        </button>
      </div>
      <ul className="ek-workbench__asset-queue" tabIndex={0} aria-live="polite" aria-label={t("reactWorkbench.leftPanel.assets.queue.label")}>
        {queue.map((item) => (
          <li key={item.id} data-status={item.status}>
            <span>{item.label}</span>
            <small>
              {t(queueStatusMessageKeys[item.status])}
              {item.kind ? ` · ${formatAssetKind(context.i18n, item.kind)}` : ""}
              {item.detail ? ` · ${renderStatusMessage(context.i18n, item.detail)}` : ""}
            </small>
            {item.diagnostics.length > 0 ? (
              <em>{item.diagnostics.map((diagnostic) => formatImportDiagnostic(context.i18n, diagnostic)).join("; ")}</em>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

const queueStatusMessageKeys = {
  queued: "reactWorkbench.leftPanel.assets.queue.queued",
  importing: "reactWorkbench.leftPanel.assets.queue.importing",
  succeeded: "reactWorkbench.leftPanel.assets.queue.succeeded",
  failed: "reactWorkbench.leftPanel.assets.queue.failed"
} satisfies Record<AssetQueueStatus, WorkbenchMessageKey>;

function pruneRecoveryState(current: AssetRecoveryState, assetIds: ReadonlySet<string>): AssetRecoveryState {
  let changed = false;
  const next: AssetRecoveryState = {};
  for (const [assetId, status] of Object.entries(current)) {
    if (assetIds.has(assetId)) {
      next[assetId] = status;
    } else {
      changed = true;
    }
  }
  return changed ? next : current;
}
