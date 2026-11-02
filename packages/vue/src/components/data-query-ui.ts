import {
  DATA_QUERY_PROBLEM_MESSAGE_KEYS,
  buildDataQueryRequest,
  dataQueryProblemMessageValues,
  queryHeadersToRecord,
  resolveDataPath,
  parseDataPath,
  formatDataPath,
  buildSuccessConditionFromForm,
  toQueryParameterDrafts,
  collectQueryOverrides,
  type DataQuality,
  type DataQueryProblem,
  type DataQueryParameterOverrides,
  type DataTimeFormat,
  type JsonValue,
  type QueryFormState,
  type QueryPropertyForm,
  type QuerySuccessValueType,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchI18n, WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";

export const QUALITY_MESSAGE_KEYS = {
  good: "dataSources.mapping.quality.good",
  uncertain: "dataSources.mapping.quality.uncertain",
  bad: "dataSources.mapping.quality.bad",
  unknown: "dataSources.mapping.quality.unknown"
} satisfies Record<DataQuality, WorkbenchMessageKey>;

export const PROPERTY_TYPE_MESSAGE_KEYS = {
  number: "dataSources.mapping.type.number",
  string: "dataSources.mapping.type.string",
  boolean: "dataSources.mapping.type.boolean"
} satisfies Record<QueryPropertyForm["type"], WorkbenchMessageKey>;

export const TRANSFORM_MESSAGE_KEYS = {
  raw: "dataSources.mapping.transform.raw",
  number: "dataSources.mapping.transform.number",
  scale: "dataSources.mapping.transform.scale",
  map: "dataSources.mapping.transform.map"
} satisfies Record<QueryPropertyForm["transformKind"], WorkbenchMessageKey>;

export const MODE_MESSAGE_KEYS = {
  array: "dataSources.mapping.mode.array",
  single: "dataSources.mapping.mode.single"
} satisfies Record<QueryFormState["mode"], WorkbenchMessageKey>;

export const IDENTITY_KIND_MESSAGE_KEYS = {
  path: "dataSources.mapping.identity.path",
  parameter: "dataSources.mapping.identity.parameter",
  literal: "dataSources.mapping.identity.literal"
} satisfies Record<QueryFormState["identityKind"], WorkbenchMessageKey>;

export const VALUE_TYPE_MESSAGE_KEYS = {
  string: "dataSources.mapping.identity.valueType.string",
  number: "dataSources.mapping.identity.valueType.number"
} satisfies Record<QueryFormState["identityValueType"], WorkbenchMessageKey>;

export const SUCCESS_TYPE_MESSAGE_KEYS = {
  string: "dataSources.request.success.type.string",
  number: "dataSources.request.success.type.number",
  boolean: "dataSources.request.success.type.boolean",
  null: "dataSources.request.success.type.null"
} satisfies Record<QuerySuccessValueType, WorkbenchMessageKey>;

export const TIME_FORMAT_MESSAGE_KEYS = {
  iso: "dataSources.mapping.observedAt.format.iso",
  "unix-seconds": "dataSources.mapping.observedAt.format.unixSeconds",
  "unix-milliseconds": "dataSources.mapping.observedAt.format.unixMilliseconds"
} satisfies Record<DataTimeFormat, WorkbenchMessageKey>;

export type RequestPreview =
  | { ok: true; method: string; url: string; body: JsonValue | null }
  | { ok: false };

/**
 * Resolve the request draft through core so the preview, the run, and the
 * saved query always agree on method, URL encoding, and body shape.
 */
export function buildRequestPreview(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  connectionId: string,
  form: QueryFormState
): RequestPreview {
  const preview = buildDataQueryRequest(snapshot, {
    connectionId,
    method: form.method,
    readOnly: form.readOnly,
    path: form.path,
    headers: queryHeadersToRecord(form.headers),
    parameters: toQueryParameterDrafts(form.parameters),
    successCondition: buildSuccessConditionFromForm(form)
  }, { overrides: collectQueryOverrides(form.parameters) });
  return preview.ok
    ? { ok: true, method: preview.summary.method, url: preview.summary.url, body: preview.summary.body }
    : { ok: false };
}

export function formatDataQueryProblem(i18n: WorkbenchI18n, problem: DataQueryProblem): string {
  const values: WorkbenchMessageValues = dataQueryProblemMessageValues(problem);
  return i18n.t(DATA_QUERY_PROBLEM_MESSAGE_KEYS[problem.code], values);
}

/**
 * Flatten a sample body into datalist suggestions so authors can pick paths
 * from the response instead of typing them by hand.
 */
export function collectPathSuggestions(body: JsonValue | undefined): string[] {
  const suggestions: string[] = [];
  const seen = new Set<string>();
  const walk = (value: JsonValue | undefined, path: Parameters<typeof formatDataPath>[0], depth: number): void => {
    if (suggestions.length >= 120 || depth > 8) {
      return;
    }
    if (path.length > 0) {
      const text = formatDataPath(path);
      if (!seen.has(text)) {
        seen.add(text);
        suggestions.push(text);
      }
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < Math.min(value.length, 20); index += 1) {
        walk(value[index], [...path, { kind: "index", index }], depth + 1);
      }
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const [key, entry] of Object.entries(value)) {
        walk(entry, [...path, { kind: "key", key }], depth + 1);
        if (suggestions.length >= 120) {
          return;
        }
      }
    }
  };
  if (body !== undefined) {
    walk(body, [], 0);
  }
  return suggestions;
}

export function mappingSuggestions(
  body: JsonValue | undefined,
  rootPath: string,
  mode: QueryFormState["mode"]
): string[] {
  const path = parseDataPath(rootPath);
  const root = body !== undefined && path ? resolveDataPath(body, path) : undefined;
  const items = mode === "array" ? Array.isArray(root) ? root.slice(0, 20) : [] : [root];
  return [...new Set(items.flatMap((item) => collectPathSuggestions(item)))].slice(0, 120);
}

export function parameterOverridesForForm(form: QueryFormState): DataQueryParameterOverrides {
  return collectQueryOverrides(form.parameters);
}
