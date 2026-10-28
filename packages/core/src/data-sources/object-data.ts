import type { SceneSnapshot } from "../snapshot/types";
import type {
  DataFieldStatus,
  DataMappedField,
  DataMappingProblem
} from "./mapping";
import type {
  DataMappedValueType,
  DataParameterValue,
  DataQuality,
  DataQueryId
} from "./types";
import { DATA_DETAIL_DEFAULT_PRECISION } from "./bindings";

export type DataObjectRuntimeStatus =
  | "inactive"
  | "loading"
  | "ready"
  | "partial"
  | "missing-device"
  | "empty"
  | "error";

export type DataRequestPhase = "idle" | "queued" | "requesting" | "waiting" | "paused";

export interface DataAuthenticationPause {
  kind: "authentication";
  status: number;
}

export interface DataObjectFreshness {
  fresh: boolean;
  maxAgeMs: number;
  receivedAgeMs: number | null;
  observedAgeMs: number | null;
  expiresAt: number | null;
}

export interface DataObjectHistorySnapshot {
  entityId: string;
  displayName: string | null;
  fields: readonly DataMappedField[];
  observedAt: number | null;
  receivedAt: number;
  sourceQuality: DataQuality | null;
  observedAtProblem: DataMappingProblem | null;
  qualityProblem: DataMappingProblem | null;
}

export interface DataObjectRuntimeProblem {
  kind: "binding" | "parameters" | "request" | "mapping" | "device" | "freshness";
  code: string;
  message: string;
  parameterName?: string;
  propertyKey?: string;
  status?: number;
}

export interface DataObjectRuntimeState {
  objectNodeId: string;
  queryId: DataQueryId;
  deviceId: string;
  enabled: boolean;
  status: DataObjectRuntimeStatus;
  contextKey: string;
  phase: DataRequestPhase;
  refreshing: boolean;
  paused: DataAuthenticationPause | null;
  nextRefreshAt: number | null;
  freshness: DataObjectFreshness;
  history: DataObjectHistorySnapshot | null;
  entityId: string | null;
  displayName: string | null;
  fields: readonly DataMappedField[];
  observedAt: number | null;
  receivedAt: number | null;
  sourceQuality: DataQuality | null;
  observedAtProblem: DataMappingProblem | null;
  qualityProblem: DataMappingProblem | null;
  problems: readonly DataObjectRuntimeProblem[];
}

export interface DataObjectContextState {
  key: string;
  queryId: DataQueryId;
  connectionId: string;
  queryName: string;
  parameters: Readonly<Record<string, DataParameterValue>>;
  objectNodeIds: readonly string[];
  phase: DataRequestPhase;
  paused: DataAuthenticationPause | null;
  nextRefreshAt: number | null;
  retryBackoffMs: number | null;
  lastAttemptAt: number | null;
  lastCompletedAt: number | null;
  authRevision: number;
}

export interface DataPreviewState {
  enabled: boolean;
  refreshing: boolean;
  lastRefreshAt: number | null;
  contextCount: number;
  pausedCount: number;
}

export interface DataObjectDataState {
  preview: DataPreviewState;
  contexts: Readonly<Record<string, DataObjectContextState>>;
  objects: Readonly<Record<string, DataObjectRuntimeState>>;
}

export type DataObjectDataSubscriber = (state: DataObjectDataState) => void;

export interface DataObjectDetailFieldModel {
  key: string;
  label: string;
  type: DataMappedValueType;
  unit: string | null;
  precision: number | null;
  value: DataParameterValue | null;
  displayValue: string | null;
  status: DataFieldStatus;
  problems: readonly DataMappingProblem[];
  historyValue: DataParameterValue | null;
  historyDisplayValue: string | null;
  historyReceivedAt: number | null;
}

export interface DataObjectDetailModel {
  objectNodeId: string;
  objectName: string;
  queryId: string;
  queryName: string;
  deviceId: string;
  displayName: string | null;
  enabled: boolean;
  status: DataObjectRuntimeStatus;
  contextKey: string;
  phase: DataRequestPhase;
  refreshing: boolean;
  paused: DataAuthenticationPause | null;
  nextRefreshAt: number | null;
  freshness: DataObjectFreshness;
  fields: readonly DataObjectDetailFieldModel[];
  observedAt: number | null;
  receivedAt: number | null;
  sourceQuality: DataQuality | null;
  observedAtProblem: DataMappingProblem | null;
  qualityProblem: DataMappingProblem | null;
  historyReceivedAt: number | null;
  historyObservedAt: number | null;
  problems: readonly DataObjectRuntimeProblem[];
}

export function buildDataObjectDetailModel(
  snapshot: Pick<SceneSnapshot, "dataSources" | "nodes">,
  objectNodeId: string,
  state: DataObjectRuntimeState | null | undefined
): DataObjectDetailModel | null {
  const binding = snapshot.dataSources.bindings[objectNodeId];
  if (!binding) {
    return null;
  }
  const query = snapshot.dataSources.queries[binding.queryId];
  if (!query) {
    return null;
  }
  const node = snapshot.nodes[objectNodeId];
  const objectName = node?.kind === "object" ? node.name : objectNodeId;

  const fields = binding.details.map((detail): DataObjectDetailFieldModel => {
    const property = query.mapping.properties.find((candidate) => candidate.key === detail.key) ?? null;
    const runtimeField = state?.fields.find((candidate) => candidate.key === detail.key) ?? null;
    const historyField = state?.history?.fields.find((candidate) => candidate.key === detail.key) ?? null;
    const precision = property?.type === "number"
      ? detail.precision ?? DATA_DETAIL_DEFAULT_PRECISION
      : null;
    const problems = detailFieldProblems(state, runtimeField, detail.key);
    const value = runtimeField?.status === "ok" ? runtimeField.value : null;
    const historyValue = value === null && historyField?.status === "ok" ? historyField.value : null;
    return {
      key: detail.key,
      label: detail.label ?? property?.label ?? detail.key,
      type: property?.type ?? "string",
      unit: property?.unit ?? null,
      precision,
      value,
      displayValue: value === null ? null : formatDetailValue(value, precision),
      status: runtimeField?.status ?? "missing",
      problems,
      historyValue,
      historyDisplayValue: historyValue === null ? null : formatDetailValue(historyValue, precision),
      historyReceivedAt: historyValue === null ? null : state?.history?.receivedAt ?? null
    };
  });

  return {
    objectNodeId,
    objectName,
    queryId: binding.queryId,
    queryName: query.name,
    deviceId: binding.deviceId,
    displayName: state?.displayName ?? null,
    enabled: binding.enabled,
    status: state?.status ?? "inactive",
    contextKey: state?.contextKey ?? "",
    phase: state?.phase ?? "idle",
    refreshing: state?.refreshing ?? false,
    paused: state?.paused ?? null,
    nextRefreshAt: state?.nextRefreshAt ?? null,
    freshness: state?.freshness ?? EMPTY_FRESHNESS,
    fields,
    observedAt: state?.observedAt ?? null,
    receivedAt: state?.receivedAt ?? null,
    sourceQuality: state?.sourceQuality ?? null,
    observedAtProblem: state?.observedAtProblem ?? null,
    qualityProblem: state?.qualityProblem ?? null,
    historyReceivedAt: state?.history?.receivedAt ?? null,
    historyObservedAt: state?.history?.observedAt ?? null,
    problems: state?.problems ?? []
  };
}

const EMPTY_FRESHNESS: DataObjectFreshness = Object.freeze({
  fresh: false,
  maxAgeMs: 0,
  receivedAgeMs: null,
  observedAgeMs: null,
  expiresAt: null
});

function detailFieldProblems(
  state: DataObjectRuntimeState | null | undefined,
  field: DataMappedField | null,
  key: string
): readonly DataMappingProblem[] {
  if (field) {
    return field.problems;
  }
  if (
    !state ||
    state.status === "loading" ||
    state.status === "missing-device" ||
    state.status === "empty" ||
    state.status === "error" ||
    state.status === "inactive"
  ) {
    return [];
  }
  return [{
    code: "property-missing",
    message: `Field ${key} has no current value.`,
    propertyKey: key
  }];
}

function formatDetailValue(value: DataParameterValue, precision: number | null): string {
  if (typeof value === "number") {
    return value.toFixed(precision ?? DATA_DETAIL_DEFAULT_PRECISION);
  }
  return String(value);
}
