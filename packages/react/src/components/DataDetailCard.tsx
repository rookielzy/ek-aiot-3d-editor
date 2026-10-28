import { useEffect, useRef, useState } from "react";
import {
  buildDataObjectDetailModel,
  type DataMappingProblem,
  type DataObjectRuntimeProblem,
  type DataObjectRuntimeStatus,
  type DataQuality
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchMessageKey } from "../i18n/workbench-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import {
  DATA_MAPPING_PROBLEM_MESSAGE_KEYS,
  DATA_QUERY_PROBLEM_MESSAGE_KEYS
} from "./data-query-problem-messages";
import { formatDataParameters } from "./data-context-format";

const STATUS_MESSAGE_KEYS = {
  inactive: "dataBinding.card.status.inactive",
  loading: "dataBinding.card.status.loading",
  ready: "dataBinding.card.status.ready",
  partial: "dataBinding.card.status.partial",
  "missing-device": "dataBinding.card.status.missingDevice",
  empty: "dataBinding.card.status.empty",
  error: "dataBinding.card.status.error"
} satisfies Record<DataObjectRuntimeStatus, WorkbenchMessageKey>;

const QUALITY_MESSAGE_KEYS = {
  good: "dataSources.mapping.quality.good",
  uncertain: "dataSources.mapping.quality.uncertain",
  bad: "dataSources.mapping.quality.bad",
  unknown: "dataSources.mapping.quality.unknown"
} satisfies Record<DataQuality, WorkbenchMessageKey>;

export function DataDetailCard({
  context,
  focusFieldKey
}: {
  context: ResolvedWorkbenchContext;
  focusFieldKey?: string | null;
}) {
  const service = context.editor.getDataService?.() ?? null;
  const dataState = context.dataState;
  const [closedNodeId, setClosedNodeId] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const t = context.i18n.t;

  const selection = context.selection;
  const nodeId = selection.count === 1 ? selection.nodeId : null;
  const node = nodeId ? context.snapshot.nodes[nodeId] ?? null : null;
  const binding = nodeId ? context.snapshot.dataSources.bindings[nodeId] ?? null : null;

  useEffect(() => {
    setClosedNodeId(null);
  }, [dataState.preview.enabled, nodeId, service]);

  useEffect(() => {
    if (!focusFieldKey) {
      return;
    }
    const field = [...cardRef.current?.querySelectorAll<HTMLElement>("[data-field-key]") ?? []]
      .find((candidate) => candidate.dataset.fieldKey === focusFieldKey);
    field?.scrollIntoView?.({ block: "nearest" });
  }, [focusFieldKey, nodeId]);

  if (
    !service ||
    !dataState.preview.enabled ||
    !node ||
    node.kind !== "object" ||
    !binding?.enabled ||
    !nodeId ||
    closedNodeId === nodeId
  ) {
    return null;
  }

  const runtime = dataState.objects[nodeId] ?? null;
  const model = buildDataObjectDetailModel(context.snapshot, nodeId, runtime);
  if (!model) {
    return null;
  }

  const loading = model.status === "loading";
  const contextState = model.contextKey ? dataState.contexts[model.contextKey] ?? null : null;
  const expired = (model.status === "ready" || model.status === "partial") &&
    model.receivedAt !== null &&
    !model.freshness.fresh;
  const statusKey = model.paused
    ? "dataBinding.card.status.authPaused"
    : model.refreshing && !loading
      ? "dataBinding.card.status.refreshing"
      : expired
        ? "dataBinding.card.status.expired"
        : runtime
          ? STATUS_MESSAGE_KEYS[model.status]
          : "dataBinding.preview.idle";

  return (
    <section
      ref={cardRef}
      className="ek-workbench__detail-card"
      role="region"
      aria-label={t("dataBinding.card.label")}
      data-status={model.status}
      data-freshness={expired ? "expired" : "current"}
    >
      <header className="ek-workbench__detail-card-header">
        <div>
          <span className="ek-workbench__detail-card-eyebrow">{t("dataBinding.card.title")}</span>
          <h3>{model.objectName}</h3>
          <small>
            {model.displayName ? `${model.displayName} · ${model.deviceId}` : model.deviceId}
          </small>
        </div>
        <button
          type="button"
          aria-label={t("dataBinding.card.close")}
          onClick={() => setClosedNodeId(nodeId)}
        >×</button>
      </header>

      <div className="ek-workbench__detail-card-status">
        <span data-status={model.paused ? "paused" : expired ? "expired" : model.status}>
          {t(statusKey)}
        </span>
        <small>{model.queryName}</small>
      </div>

      <p className="ek-workbench__detail-card-context">
        {t("dataBinding.card.sharedContext", {
          count: contextState?.objectNodeIds.length ?? 1,
          parameters: formatDataParameters(contextState?.parameters, t("dataBinding.preview.noParameters"))
        })}
      </p>

      {loading ? (
        <p className="ek-workbench__detail-card-loading">{t("dataBinding.card.status.loading")}</p>
      ) : null}

      {!loading && runtime && model.fields.length > 0 ? (
        <dl className="ek-workbench__detail-card-fields">
          {model.fields.map((field) => (
            <div
              key={field.key}
              data-status={field.status}
              data-field-key={field.key}
              data-focused={field.key === focusFieldKey ? "true" : undefined}
              data-history={field.historyValue !== null ? "true" : undefined}
            >
              <dt>
                {field.label}
                {field.unit ? <small> · {field.unit}</small> : null}
              </dt>
              <dd>
                <strong>{field.displayValue ?? t("dataBinding.card.noValue")}</strong>
                {field.problems.map((problem) => (
                  <small key={`${problem.code}-${problem.propertyKey ?? ""}`}>
                    {formatMappingProblem(context, problem)}
                  </small>
                ))}
                {field.historyValue !== null ? (
                  <small className="ek-workbench__detail-card-history">
                    {t("dataBinding.card.lastValue", {
                      value: field.historyDisplayValue ?? "",
                      time: formatTimestamp(field.historyReceivedAt, context.i18n.locale, t("dataBinding.card.unknown"))
                    })}
                  </small>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {!loading && runtime ? (
        <dl className="ek-workbench__detail-card-meta">
          <div>
            <dt>{t("dataBinding.card.received")}</dt>
            <dd>{formatTimestamp(model.receivedAt, context.i18n.locale, t("dataBinding.card.unknown"))}</dd>
          </div>
          <div>
            <dt>{t("dataBinding.card.observed")}</dt>
            <dd>{formatTimestamp(model.observedAt, context.i18n.locale, t("dataBinding.card.unknown"))}</dd>
          </div>
          <div>
            <dt>{t("dataBinding.card.quality")}</dt>
            <dd>{model.sourceQuality
              ? t(QUALITY_MESSAGE_KEYS[model.sourceQuality])
              : t("dataBinding.card.unknown")}</dd>
          </div>
        </dl>
      ) : null}

      {model.observedAtProblem ? (
        <p className="ek-workbench__detail-card-note">{formatMappingProblem(context, model.observedAtProblem)}</p>
      ) : null}
      {model.qualityProblem ? (
        <p className="ek-workbench__detail-card-note">{formatMappingProblem(context, model.qualityProblem)}</p>
      ) : null}
      {model.paused ? (
        <p className="ek-workbench__detail-card-note" data-state="paused">
          {t("dataBinding.card.authPausedDetail", { status: model.paused.status })}
        </p>
      ) : null}
      {expired ? (
        <p className="ek-workbench__detail-card-note" data-state="expired">
          {t("dataBinding.card.expiredDetail", {
            maxAgeSeconds: Math.max(0, Math.round(model.freshness.maxAgeMs / 1000))
          })}
        </p>
      ) : null}
      {model.status === "error" || model.status === "missing-device" ? (
        <p className="ek-workbench__detail-card-note">{t("dataBinding.card.retryHint")}</p>
      ) : null}

      {model.problems.length > 0 ? (
        <ul className="ek-workbench__detail-card-problems" aria-label={t("dataBinding.card.problems")}>
          {model.problems.map((problem, index) => (
            <li key={`${problem.code}-${problem.propertyKey ?? ""}-${index}`}>
              {formatRuntimeProblem(context, problem, model.deviceId)}
            </li>
          ))}
        </ul>
      ) : null}
      {!runtime ? (
        <p className="ek-workbench__detail-card-note">{t("dataBinding.preview.needsRefresh")}</p>
      ) : null}

      <div className="ek-workbench__detail-card-actions">
        <button
          type="button"
          disabled={dataState.preview.refreshing}
          onClick={() => { void service.refreshPreview(); }}
        >{t("dataBinding.card.retry")}</button>
      </div>
    </section>
  );
}

function formatMappingProblem(
  context: ResolvedWorkbenchContext,
  problem: DataMappingProblem
): string {
  return context.i18n.t(DATA_MAPPING_PROBLEM_MESSAGE_KEYS[problem.code], {
    propertyKey: problem.propertyKey ?? ""
  });
}

function formatRuntimeProblem(
  context: ResolvedWorkbenchContext,
  problem: DataObjectRuntimeProblem,
  deviceId: string
): string {
  if (problem.kind === "device") {
    return context.i18n.t("dataBinding.card.deviceMissing", { deviceId });
  }
  if (problem.kind === "mapping") {
    const mappingKey = DATA_MAPPING_PROBLEM_MESSAGE_KEYS[problem.code as DataMappingProblem["code"]];
    if (mappingKey) {
      return context.i18n.t(mappingKey, { propertyKey: problem.propertyKey ?? "" });
    }
    if (problem.code === "response-empty") {
      return context.i18n.t("dataBinding.card.responseEmpty");
    }
    return context.i18n.t("dataBinding.card.mappingFailed", { detail: problem.message });
  }
  if (problem.kind === "request") {
    const requestKey = DATA_QUERY_PROBLEM_MESSAGE_KEYS[
      problem.code as keyof typeof DATA_QUERY_PROBLEM_MESSAGE_KEYS
    ];
    if (requestKey) {
      return context.i18n.t(requestKey, {
        status: problem.status ?? "",
        detail: problem.message
      });
    }
    return problem.message;
  }
  if (problem.kind === "parameters") {
    return context.i18n.t("dataBinding.card.runtimeParameters", { detail: problem.message });
  }
  return context.i18n.t("dataBinding.card.runtimeBinding", { detail: problem.message });
}

function formatTimestamp(milliseconds: number | null, locale: string, fallback: string): string {
  if (milliseconds === null) {
    return fallback;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(new Date(milliseconds));
}
