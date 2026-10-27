import type { DataObjectDataState } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { useObjectDataState } from "../hooks/use-object-data-state";

export function DataPreviewControls({ context }: { context: ResolvedWorkbenchContext }) {
  const service = context.editor.getDataService?.() ?? null;
  const dataState = useObjectDataState(context);
  const t = context.i18n.t;
  const bindings = Object.values(context.snapshot.dataSources.bindings);
  if (bindings.length === 0 && !dataState.preview.enabled) {
    return null;
  }

  const enabledBindings = bindings.filter((binding) => binding.enabled).length;
  const status = previewStatusKey(dataState, bindings);
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
      <small>{t("dataBinding.preview.summary", { count: enabledBindings })}</small>
      {lastRefresh ? (
        <small>{t("dataBinding.preview.lastRefresh", { time: lastRefresh })}</small>
      ) : null}
      {dataState.preview.enabled && status === "dataBinding.preview.needsRefresh" && !dataState.preview.refreshing
        ? <small>{t("dataBinding.preview.needsRefresh")}</small>
        : null}
    </div>
  );
}

function previewStatusKey(
  dataState: DataObjectDataState,
  bindings: readonly { objectNodeId: string; enabled: boolean }[]
): "dataBinding.preview.off"
  | "dataBinding.preview.refreshing"
  | "dataBinding.preview.noBindings"
  | "dataBinding.preview.needsRefresh"
  | "dataBinding.preview.error"
  | "dataBinding.preview.partial"
  | "dataBinding.preview.ready" {
  if (!dataState.preview.enabled) {
    return "dataBinding.preview.off";
  }
  if (dataState.preview.refreshing) {
    return "dataBinding.preview.refreshing";
  }
  const enabledBindings = bindings.filter((binding) => binding.enabled);
  if (enabledBindings.length === 0) {
    return "dataBinding.preview.noBindings";
  }
  if (enabledBindings.some((binding) => !dataState.objects[binding.objectNodeId])) {
    return "dataBinding.preview.needsRefresh";
  }
  const states = enabledBindings.map((binding) => dataState.objects[binding.objectNodeId]!);
  if (states.some((state) => state.status === "error" || state.status === "missing-device")) {
    return "dataBinding.preview.error";
  }
  if (states.some((state) => state.status === "partial")) {
    return "dataBinding.preview.partial";
  }
  return states.every((state) => state.status === "ready")
    ? "dataBinding.preview.ready"
    : "dataBinding.preview.needsRefresh";
}
