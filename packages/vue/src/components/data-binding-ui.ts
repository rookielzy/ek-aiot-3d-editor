import {
  DATA_DETAIL_MAX_PRECISION,
  DATA_MAPPING_PROBLEM_MESSAGE_KEYS,
  buildDeleteDataObjectBindingCommand,
  buildSaveDataObjectBindingCommand,
  dataColorOperatorsForType,
  mapDataQueryBody,
  normalizeDataColorHex,
  parseParameterText,
  type DataBindingColor,
  type DataBindingProblem,
  type DataBindingProblemCode,
  type DataColorObjectCapability,
  type DataColorOperator,
  type DataColorRule,
  type DataColorTrialProblemCode,
  type DataMappingProblem,
  type DataMappedEntity,
  type DataObjectBindingInput,
  type DataParameterValue,
  type DataParameterType,
  type DataPropertyMapping,
  type DataQuery,
  type DataQuality,
  type DataQueryProblem,
  type JsonValue,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchI18n, WorkbenchMessageKey } from "../i18n/workbench-i18n";
import { QUALITY_MESSAGE_KEYS } from "./data-query-ui";

/** Palette offered next to each color rule; the first rule starts on the first swatch. */
export const DATA_BINDING_COLOR_PALETTE = ["#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7"] as const;

export const BINDING_PROBLEM_MESSAGE_KEYS = {
  "binding-invalid": "dataBinding.problem.bindingInvalid",
  "binding-not-found": "dataBinding.problem.bindingNotFound",
  "color-invalid": "dataBinding.problem.colorInvalid",
  "color-operator": "dataBinding.problem.colorOperator",
  "color-property-unknown": "dataBinding.problem.colorPropertyUnknown",
  "color-rules-required": "dataBinding.problem.colorRulesRequired",
  "color-value": "dataBinding.problem.colorValue",
  "command-failed": "dataBinding.problem.commandFailed",
  "device-required": "dataBinding.problem.deviceRequired",
  "detail-duplicate": "dataBinding.problem.detailDuplicate",
  "detail-precision": "dataBinding.problem.detailPrecision",
  "detail-required": "dataBinding.problem.detailRequired",
  "detail-unknown": "dataBinding.problem.detailUnknown",
  "parameter-missing": "dataBinding.problem.parameterMissing",
  "parameter-type": "dataBinding.problem.parameterType",
  "parameter-unknown": "dataBinding.problem.parameterUnknown",
  "query-not-found": "dataBinding.problem.queryNotFound",
  "target-imported": "dataBinding.problem.targetImported",
  "target-not-found": "dataBinding.problem.targetNotFound",
  "target-unsupported": "dataBinding.problem.targetUnsupported"
} satisfies Record<DataBindingProblemCode, WorkbenchMessageKey>;

export const COLOR_TRIAL_PROBLEM_MESSAGE_KEYS = {
  "color-required": "dataBinding.colors.trial.problem.color-required",
  "preview-active": "dataBinding.colors.trial.problem.preview-active",
  "target-not-found": "dataBinding.colors.trial.problem.target-not-found"
} satisfies Record<DataColorTrialProblemCode, WorkbenchMessageKey>;

export const BINDING_STATUS_MESSAGE_KEYS = {
  saved: "dataBinding.form.status.saved",
  updated: "dataBinding.form.status.updated",
  removed: "dataBinding.form.status.removed",
  reset: "dataBinding.form.status.reset"
} as const;

export type BindingStatus = keyof typeof BINDING_STATUS_MESSAGE_KEYS;

export type BindingCandidateState =
  | { status: "idle"; signature: string }
  | { status: "loading"; signature: string }
  | { status: "ready"; signature: string; entities: readonly DataMappedEntity[] }
  | {
      status: "error";
      signature: string;
      problems: readonly DataQueryProblem[];
      message: string | null;
    };

export interface DetailDraft {
  key: string;
  label: string;
  precision: string;
}

export interface OverrideDraft {
  enabled: boolean;
  text: string;
}

export interface ColorRuleDraft {
  operator: DataColorOperator;
  value: string;
  max: string;
  color: string;
}

export interface ColorDraft {
  propertyKey: string;
  rules: ColorRuleDraft[];
}

export interface BindingDraft {
  queryId: string;
  overrides: Record<string, OverrideDraft>;
  deviceId: string;
  enabled: boolean;
  details: DetailDraft[];
  color: ColorDraft | null;
}

/**
 * Start a binding draft from the saved binding, or from defaults when the
 * object has none yet. The form only edits this draft; durable state changes
 * on an explicit save.
 */
export function createBindingDraft(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  objectNodeId: string,
  fixedQueryId: string | null
): BindingDraft {
  const saved = snapshot.dataSources.bindings[objectNodeId] ?? null;
  const queries = Object.values(snapshot.dataSources.queries);
  const queryId = fixedQueryId ?? saved?.queryId ?? (queries.length === 1 ? queries[0].id : "");
  const query = queryId ? snapshot.dataSources.queries[queryId] ?? null : null;
  const overrides: Record<string, OverrideDraft> = {};
  for (const parameter of query?.parameters ?? []) {
    const stored = saved?.parameterOverrides[parameter.name];
    overrides[parameter.name] = {
      enabled: stored !== undefined,
      text: stored === undefined ? "" : formatParameterValue(stored)
    };
  }
  return {
    queryId,
    overrides,
    deviceId: saved?.deviceId ?? "",
    enabled: saved?.enabled ?? true,
    details: saved
      ? saved.details
          .filter((detail) => query?.mapping.properties.some((property) => property.key === detail.key))
          .map((detail) => ({
            key: detail.key,
            label: detail.label ?? "",
            precision: detail.precision === null ? "" : String(detail.precision)
          }))
      : (query?.mapping.properties ?? []).map((property) => ({
          key: property.key,
          label: "",
          precision: ""
        })),
    color: saved?.color
      ? {
          propertyKey: saved.color.propertyKey,
          rules: saved.color.rules.map((rule) => ({
            operator: rule.operator,
            value: String(rule.value),
            max: rule.max === null ? "" : String(rule.max),
            color: rule.color
          }))
        }
      : null
  };
}

export function serializeBindingDraft(draft: BindingDraft): string {
  return JSON.stringify({
    queryId: draft.queryId,
    overrides: draft.overrides,
    deviceId: draft.deviceId,
    enabled: draft.enabled,
    details: draft.details.map((detail) => ({
      key: detail.key,
      label: detail.label,
      precision: detail.precision
    })),
    color: draft.color
      ? {
          propertyKey: draft.color.propertyKey,
          rules: draft.color.rules.map((rule) => ({
            operator: rule.operator,
            value: rule.value,
            max: rule.max,
            color: rule.color
          }))
        }
      : null
  });
}

export function createDefaultColorDraft(properties: readonly DataPropertyMapping[]): ColorDraft | null {
  const property = properties[0];
  return property
    ? { propertyKey: property.key, rules: [createDefaultColorRule(property, 0)] }
    : null;
}

export function createDefaultColorRule(property: DataPropertyMapping, index: number): ColorRuleDraft {
  return {
    operator: property.type === "number" ? "gte" : "eq",
    value: property.type === "boolean" ? "true" : property.type === "number" ? "0" : "",
    max: "",
    color: DATA_BINDING_COLOR_PALETTE[index % DATA_BINDING_COLOR_PALETTE.length]!
  };
}

export function colorOperatorsForRule(property: DataPropertyMapping | null): readonly DataColorOperator[] {
  return dataColorOperatorsForType(property?.type ?? "string");
}

export function draftOverridesForQuery(
  current: Record<string, OverrideDraft>,
  query: DataQuery | null
): Record<string, OverrideDraft> {
  const overrides: Record<string, OverrideDraft> = {};
  for (const parameter of query?.parameters ?? []) {
    overrides[parameter.name] = current[parameter.name] ?? { enabled: false, text: "" };
  }
  return overrides;
}

export function detailsForQuery(details: readonly DetailDraft[], query: DataQuery | null): DetailDraft[] {
  if (!query) {
    return [];
  }
  const matching = details.filter((detail) =>
    query.mapping.properties.some((property) => property.key === detail.key)
  );
  if (matching.length > 0) {
    return matching;
  }
  return query.mapping.properties.map((property) => ({
    key: property.key,
    label: "",
    precision: ""
  }));
}

export function colorForQuery(color: ColorDraft | null, query: DataQuery | null): ColorDraft | null {
  if (!color) {
    return null;
  }
  return query?.mapping.properties.some((property) => property.key === color.propertyKey)
    ? color
    : null;
}

export function collectBindingOverrides(
  draft: BindingDraft,
  query: DataQuery
): Record<string, DataParameterValue> {
  const overrides: Record<string, DataParameterValue> = {};
  for (const parameter of query.parameters) {
    const entry = draft.overrides[parameter.name];
    if (!entry?.enabled) {
      continue;
    }
    overrides[parameter.name] = parseParameterText(parameter.type, entry.text);
  }
  return overrides;
}

export function collectBindingColor(draft: BindingDraft, query: DataQuery | null): DataBindingColor | null {
  if (!draft.color) {
    return null;
  }
  const property = query?.mapping.properties.find((candidate) => candidate.key === draft.color?.propertyKey) ?? null;
  const type = property?.type ?? "string";
  return {
    propertyKey: draft.color.propertyKey,
    rules: draft.color.rules.map((rule): DataColorRule => ({
      operator: rule.operator,
      value: parseColorRuleValue(type, rule.value),
      max: rule.operator === "between" ? parseColorRuleNumber(rule.max) : null,
      color: rule.color
    }))
  };
}

/** Translate the whole draft into the durable binding input consumed by core. */
export function collectBindingInput(draft: BindingDraft, objectNodeId: string, query: DataQuery): DataObjectBindingInput {
  return {
    objectNodeId,
    queryId: query.id,
    parameterOverrides: collectBindingOverrides(draft, query),
    deviceId: draft.deviceId,
    enabled: draft.enabled,
    details: draft.details.map((detail) => ({
      key: detail.key,
      label: detail.label.trim() || null,
      precision: detail.precision.trim() === "" ? null : Number(detail.precision)
    })),
    color: collectBindingColor(draft, query)
  };
}

export function formatBindingProblem(i18n: WorkbenchI18n, problem: DataBindingProblem): string {
  return i18n.t(BINDING_PROBLEM_MESSAGE_KEYS[problem.code], {
    parameterName: problem.parameterName ?? "",
    propertyKey: problem.propertyKey ?? "",
    detail: problem.message
  });
}

export function formatMappingFailureMessage(
  i18n: WorkbenchI18n,
  problems: readonly { code: string; propertyKey?: string }[]
): string {
  return problems.length > 0
    ? problems.map((problem) => {
        const key = DATA_MAPPING_PROBLEM_MESSAGE_KEYS[problem.code as DataMappingProblem["code"]];
        return i18n.t(key ?? "dataBinding.problem.candidatesFailed", {
          propertyKey: problem.propertyKey ?? ""
        });
      }).join(" ")
    : i18n.t("dataBinding.problem.candidatesFailed");
}

export function colorCapabilityLabel(capability: DataColorObjectCapability, i18n: WorkbenchI18n): string {
  switch (capability.status) {
    case "unavailable":
      return i18n.t("dataBinding.colors.capability.unavailable");
    case "unsupported":
      return i18n.t("dataBinding.colors.capability.unsupported");
    case "partial":
      return i18n.t("dataBinding.colors.capability.partial", {
        count: capability.slotCount - capability.supportedSlotCount,
        total: capability.slotCount
      });
    default:
      return i18n.t("dataBinding.colors.capability.applied");
  }
}

export function formatParameterValue(value: DataParameterValue): string {
  return String(value);
}

export function queryOptionLabel(query: DataQuery, snapshot: Pick<SceneSnapshot, "dataSources">): string {
  const connection = snapshot.dataSources.connections[query.connectionId];
  return connection ? `${query.name} · ${connection.name}` : query.name;
}

export function parameterTypeKey(type: DataParameterType): WorkbenchMessageKey {
  return `dataSources.request.type.${type}` as WorkbenchMessageKey;
}

export function qualityMessageKey(quality: DataQuality): WorkbenchMessageKey {
  return QUALITY_MESSAGE_KEYS[quality];
}

/** A loaded candidate list belongs to the request signature that produced it. */
export function isCandidatesStale(state: BindingCandidateState, signature: string): boolean {
  return state.status === "ready" && state.signature !== signature;
}

export function isValidBindingPrecision(text: string): boolean {
  if (text.trim() === "") {
    return true;
  }
  const value = Number(text);
  return Number.isInteger(value) && value >= 0 && value <= DATA_DETAIL_MAX_PRECISION;
}

/** Map a candidate request response through the saved query mapping. */
export function mapCandidateResponse(
  query: DataQuery,
  body: JsonValue,
  meta: { executionId: string; receivedAt: number; parameters: Readonly<Record<string, DataParameterValue>> }
) {
  return mapDataQueryBody(query.mapping, body, {
    connectionId: query.connectionId,
    queryId: query.id,
    executionId: meta.executionId,
    receivedAt: meta.receivedAt,
    parameters: meta.parameters
  });
}

export function normalizedRuleColor(color: string): string {
  return normalizeDataColorHex(color) ?? "#22c55e";
}

function parseColorRuleValue(type: "number" | "string" | "boolean", text: string): DataParameterValue {
  if (type === "boolean") {
    return text === "true";
  }
  if (type === "number") {
    return parseColorRuleNumber(text);
  }
  return text;
}

function parseColorRuleNumber(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text);
}
