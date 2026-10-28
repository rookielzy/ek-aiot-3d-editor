import type {
  DataObjectContextState,
  DataObjectDataState,
  DataObjectRuntimeState
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchMessageKey } from "../i18n/workbench-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";

type PreviewStatusKey =
  | "dataBinding.preview.off"
  | "dataBinding.preview.refreshing"
  | "dataBinding.preview.noBindings"
  | "dataBinding.preview.needsRefresh"
  | "dataBinding.preview.error"
  | "dataBinding.preview.partial"
  | "dataBinding.preview.empty"
  | "dataBinding.preview.expired"
  | "dataBinding.preview.paused"
  | "dataBinding.preview.ready";

export function DataPreviewControls({ context }: { context: ResolvedWorkbenchContext }) {
  const service = context.editor.getDataService?.() ?? null;
  const dataState = context.dataState;
  const t = context.i18n.t;
  const bindings = Object.values(context.snapshot.dataSources.bindings);
  if (bindings.length === 0 && !dataState.preview.enabled) {
    return null;
  }

  const enabledBindings = bindings.filter((binding) => binding.enabled).length;
  const status = previewStatusKey(dataState, bindings);
  const contexts = Object.values(dataState.contexts);
  const lastRefresh = dataState.preview.lastRefreshAt === null
    ? null
    : new Date(dataState.preview.lastRefreshAt).toLocaleTimeString(context.i18n.locale);

  return (
    <div className="ek-workbench__data-preview" role="group" aria-label={t("dataBinding.preview.label")}>
      <button
        type="button"
        aria-pressed={dataState.preview.enabled}
        disabled={enabledBindings === 0 && !dataState.preview.enabled}
        onClick={() => {
          if (!service) {
            return;
          }
          if (dataState.preview.enabled) {
            service.stopPreview();
          } else {
            void service.startPreview();
          }
        }}
      >{t(dataState.preview.enabled ? "dataBinding.preview.stop" : "dataBinding.preview.start")}</button>
      <button
        type="button"
        disabled={!dataState.preview.enabled || dataState.preview.refreshing}
        onClick={() => { void service?.refreshPreview(); }}
      >{t("dataBinding.preview.refresh")}</button>
      <span role="status" aria-live="polite" data-state={dataState.preview.enabled ? status : "off"}>
        {t(status)}
      </span>
      <small>{t("dataBinding.preview.summary", {
        count: enabledBindings,
        contextCount: dataState.preview.contextCount
      })}</small>
      {lastRefresh ? (
        <small>{t("dataBinding.preview.lastRefresh", { time: lastRefresh })}</small>
      ) : null}
      {contexts.length > 0 ? (
        <details className="ek-workbench__data-preview-contexts">
          <summary>{t("dataBinding.preview.contexts", { count: contexts.length })}</summary>
          <ul>
            {contexts.map((item) => (
              <li key={item.key} data-phase={item.phase}>
                <strong>{item.queryName}</strong>
                <span>{formatParameters(item, t("dataBinding.preview.noParameters"))}</span>
                <small>{t("dataBinding.preview.contextSummary", {
                  count: item.objectNodeIds.length
                })}</small>
                <small>{phaseLabel(item, context)}</small>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function previewStatusKey(
  dataState: DataObjectDataState,
  bindings: readonly { objectNodeId: string; enabled: boolean }[]
): PreviewStatusKey {
  if (!dataState.preview.enabled) {
    return "dataBinding.preview.off";
  }
  const enabledBindings = bindings.filter((binding) => binding.enabled);
  if (enabledBindings.length === 0) {
    return "dataBinding.preview.noBindings";
  }
  if (dataState.preview.pausedCount > 0) {
    return "dataBinding.preview.paused";
  }
  if (dataState.preview.refreshing) {
    return "dataBinding.preview.refreshing";
  }
  if (enabledBindings.some((binding) => !dataState.objects[binding.objectNodeId])) {
    return "dataBinding.preview.needsRefresh";
  }
  const states = enabledBindings.map((binding) => dataState.objects[binding.objectNodeId]!);
  if (states.some((state) => state.status === "error" || state.status === "missing-device")) {
    return "dataBinding.preview.error";
  }
  if (states.some(isExpired)) {
    return "dataBinding.preview.expired";
  }
  if (states.some((state) => state.status === "partial")) {
    return "dataBinding.preview.partial";
  }
  if (states.some((state) => state.status === "empty")) {
    return "dataBinding.preview.empty";
  }
  return states.every((state) => state.status === "ready")
    ? "dataBinding.preview.ready"
    : "dataBinding.preview.needsRefresh";
}

function isExpired(state: DataObjectRuntimeState): boolean {
  return (state.status === "ready" || state.status === "partial") &&
    state.receivedAt !== null &&
    !state.freshness.fresh;
}

function formatParameters(
  context: DataObjectContextState,
  emptyLabel: string
): string {
  const entries = Object.entries(context.parameters);
  return entries.length === 0
    ? emptyLabel
    : entries.map(([key, value]) => `${key}=${String(value)}`).join(" · ");
}

function phaseLabel(
  context: DataObjectContextState,
  workbench: ResolvedWorkbenchContext
): string {
  if (context.paused) {
    return workbench.i18n.t("dataBinding.preview.paused");
  }
  if (context.nextRefreshAt !== null) {
    return workbench.i18n.t("dataBinding.preview.nextRefresh", {
      time: new Date(context.nextRefreshAt).toLocaleTimeString(workbench.i18n.locale)
    });
  }
  const keys = {
    idle: "dataBinding.preview.phase.idle",
    queued: "dataBinding.preview.phase.queued",
    requesting: "dataBinding.preview.phase.requesting",
    waiting: "dataBinding.preview.phase.waiting",
    paused: "dataBinding.preview.phase.paused"
  } satisfies Record<DataObjectContextState["phase"], WorkbenchMessageKey>;
  return workbench.i18n.t(keys[context.phase]);
}
