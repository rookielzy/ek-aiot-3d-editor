import {
  DEFAULT_DATA_QUERY_MAX_AGE_MS,
  DEFAULT_DATA_QUERY_REFRESH_INTERVAL_MS,
  formatDataPath,
  parseDataPath,
  resolveDataQueryParameters,
  type DataMappedValueType,
  type DataMappingMode,
  type DataParameterValue,
  type DataPath,
  type DataPathPrimitive,
  type DataQuality,
  type DataQuery,
  type DataQueryDefinition,
  type DataQueryMapping,
  type DataQueryMethod,
  type DataQueryParameterOverrides,
  type DataSuccessCondition,
  type DataTimeFormat,
  type DataValueMapEntry
} from "@ek-aiot/3d-editor-core";
import {
  createQueryHeaderForm,
  createQueryParameterForm,
  toQueryParameterDrafts,
  type QueryHeaderForm,
  type QueryParameterForm
} from "./data-query-form";

export interface QueryPropertyForm {
  id: string;
  key: string;
  label: string;
  type: DataMappedValueType;
  source: string;
  transformKind: "raw" | "number" | "scale" | "map";
  factor: string;
  offset: string;
  mapEntries: QueryMapEntryForm[];
  unit: string;
  nullable: boolean;
  rangeMin: string;
  rangeMax: string;
  allowedText: string;
}

export interface QueryMapEntryForm {
  id: string;
  from: string;
  to: string;
}

export interface QueryQualityEntryForm {
  id: string;
  from: string;
  quality: DataQuality;
}

export type QuerySuccessValueType = "string" | "number" | "boolean" | "null";

export interface QueryFormState {
  name: string;
  method: DataQueryMethod;
  readOnly: boolean;
  path: string;
  headers: QueryHeaderForm[];
  refreshIntervalSeconds: string;
  maxAgeSeconds: string;
  parameters: QueryParameterForm[];
  successPath: string;
  successType: QuerySuccessValueType;
  successValue: string;
  mode: DataMappingMode;
  rootPath: string;
  identityKind: "path" | "parameter" | "literal";
  identityPath: string;
  identityValueType: "string" | "number";
  identityParameter: string;
  identityLiteral: string;
  displayNamePath: string;
  properties: QueryPropertyForm[];
  observedPath: string;
  observedFormat: DataTimeFormat;
  qualityPath: string;
  qualityEntries: QueryQualityEntryForm[];
  baseline: string;
}

export interface QueryFormProblem {
  field: string;
  messageKey:
    | "dataSources.mapping.pathError"
    | "dataSources.mapping.mapValueError"
    | "dataSources.mapping.rangeError"
    | "dataSources.mapping.allowedError";
}

let nextRowId = 0;

function nextId(prefix: string): string {
  nextRowId += 1;
  return `${prefix}-${nextRowId}`;
}

export function createQueryPropertyForm(): QueryPropertyForm {
  return {
    id: nextId("query-property"),
    key: "",
    label: "",
    type: "number",
    source: "",
    transformKind: "raw",
    factor: "",
    offset: "0",
    mapEntries: [],
    unit: "",
    nullable: false,
    rangeMin: "",
    rangeMax: "",
    allowedText: ""
  };
}

export function createQueryMapEntryForm(): QueryMapEntryForm {
  return { id: nextId("query-map-entry"), from: "", to: "" };
}

export function createQueryQualityEntryForm(): QueryQualityEntryForm {
  return { id: nextId("query-quality-entry"), from: "", quality: "good" };
}

export function createQueryFormState(): QueryFormState {
  const form: QueryFormState = {
    name: "",
    method: "GET",
    readOnly: true,
    path: "",
    headers: [],
    refreshIntervalSeconds: formatSeconds(DEFAULT_DATA_QUERY_REFRESH_INTERVAL_MS),
    maxAgeSeconds: formatSeconds(DEFAULT_DATA_QUERY_MAX_AGE_MS),
    parameters: [],
    successPath: "",
    successType: "number",
    successValue: "",
    mode: "array",
    rootPath: "",
    identityKind: "path",
    identityPath: "",
    identityValueType: "string",
    identityParameter: "",
    identityLiteral: "",
    displayNamePath: "",
    properties: [createQueryPropertyForm()],
    observedPath: "",
    observedFormat: "iso",
    qualityPath: "",
    qualityEntries: [],
    baseline: ""
  };
  return { ...form, baseline: serializeQueryForm(form) };
}

export function queryFormFromQuery(query: DataQuery): QueryFormState {
  const properties = query.mapping.properties.map((property): QueryPropertyForm => ({
    id: nextId("query-property"),
    key: property.key,
    label: property.label,
    type: property.type,
    source: formatDataPath(property.source),
    transformKind: property.transform.kind,
    factor: property.transform.kind === "scale" ? String(property.transform.factor) : "",
    offset: property.transform.kind === "scale" ? String(property.transform.offset) : "0",
    mapEntries: property.transform.kind === "map"
      ? property.transform.entries.map((entry) => ({
          id: nextId("query-map-entry"),
          from: formatMapValue(entry.from),
          to: formatMapOutput(entry.to)
        }))
      : [],
    unit: property.unit ?? "",
    nullable: property.nullable,
    rangeMin: property.range?.min === null || property.range?.min === undefined ? "" : String(property.range.min),
    rangeMax: property.range?.max === null || property.range?.max === undefined ? "" : String(property.range.max),
    allowedText: property.allowed ? JSON.stringify(property.allowed) : ""
  }));
  const successType: QuerySuccessValueType = query.successCondition === null
    ? "number"
    : query.successCondition.equals === null
      ? "null"
      : typeof query.successCondition.equals === "boolean"
        ? "boolean"
        : typeof query.successCondition.equals === "number" ? "number" : "string";
  const form: QueryFormState = {
    name: query.name,
    method: query.method,
    readOnly: query.readOnly,
    path: query.path,
    headers: Object.entries(query.headers).map(([name, value]) => createQueryHeaderForm(name, value)),
    refreshIntervalSeconds: formatSeconds(query.updatePolicy.refreshIntervalMs),
    maxAgeSeconds: formatSeconds(query.updatePolicy.maxAgeMs),
    parameters: query.parameters.map((parameter) => ({
      ...createQueryParameterForm(),
      name: parameter.name,
      type: parameter.type,
      location: parameter.location ?? "auto",
      useDefault: Object.prototype.hasOwnProperty.call(parameter, "defaultValue"),
      defaultText: Object.prototype.hasOwnProperty.call(parameter, "defaultValue")
        ? String(parameter.defaultValue)
        : "",
      override: false,
      overrideText: ""
    })),
    successPath: query.successCondition ? formatDataPath(query.successCondition.path) : "",
    successType,
    successValue: query.successCondition === null || query.successCondition.equals === null
      ? ""
      : String(query.successCondition.equals),
    mode: query.mapping.mode,
    rootPath: formatDataPath(query.mapping.root),
    identityKind: query.mapping.identity.kind,
    identityPath: query.mapping.identity.kind === "path" ? formatDataPath(query.mapping.identity.path) : "",
    identityValueType: query.mapping.identity.kind === "path" ? query.mapping.identity.valueType : "string",
    identityParameter: query.mapping.identity.kind === "parameter" ? query.mapping.identity.parameterName : "",
    identityLiteral: query.mapping.identity.kind === "literal" ? query.mapping.identity.value : "",
    displayNamePath: query.mapping.displayName ? formatDataPath(query.mapping.displayName) : "",
    properties: properties.length > 0 ? properties : [createQueryPropertyForm()],
    observedPath: query.mapping.observedAt ? formatDataPath(query.mapping.observedAt.path) : "",
    observedFormat: query.mapping.observedAt?.format ?? "iso",
    qualityPath: query.mapping.sourceQuality ? formatDataPath(query.mapping.sourceQuality.path) : "",
    qualityEntries: query.mapping.sourceQuality?.entries.map((entry) => ({
      id: nextId("query-quality-entry"),
      from: formatMapValue(entry.from),
      quality: entry.quality
    })) ?? [],
    baseline: ""
  };
  return { ...form, baseline: serializeQueryForm(form) };
}

export function buildMappingFromForm(
  form: QueryFormState
): { mapping: DataQueryMapping | null; problems: QueryFormProblem[] } {
  const problems: QueryFormProblem[] = [];
  const root = parseFormPath(form.rootPath, "root", true, problems);
  const identity = buildIdentity(form, problems);
  const displayName = form.displayNamePath.trim()
    ? parseFormPath(form.displayNamePath, "displayName", false, problems)
    : null;
  const properties = form.properties.map((property, index) => {
    const source = parseFormPath(property.source, `property:${index}:source`, false, problems);
    const transform = buildTransform(property, index, problems);
    return {
      key: property.key,
      label: property.label,
      type: property.type,
      nullable: property.nullable,
      unit: property.unit || null,
      source: source ?? [],
      transform,
      range: buildRange(property, index, problems),
      allowed: buildAllowed(property, index, problems)
    };
  });
  const observedAt = form.observedPath.trim()
    ? {
        path: parseFormPath(form.observedPath, "observedAt", false, problems) ?? [],
        format: form.observedFormat
      }
    : null;
  let sourceQuality: DataQueryMapping["sourceQuality"] = null;
  if (form.qualityPath.trim()) {
    const qualityEntries = [];
    for (const [index, entry] of form.qualityEntries.entries()) {
      const from = parseMapValue(entry.from, `quality:entry:${index}`, problems);
      if (!isPathPrimitiveValue(from.value)) {
        if (from.value !== undefined) {
          problems.push({ field: `quality:entry:${index}`, messageKey: "dataSources.mapping.mapValueError" });
        }
        continue;
      }
      qualityEntries.push({ from: from.value, quality: entry.quality });
    }
    sourceQuality = {
      path: parseFormPath(form.qualityPath, "quality", false, problems) ?? [],
      entries: qualityEntries
    };
  }

  if (problems.length > 0 || !root || !identity) {
    return { mapping: null, problems };
  }
  return {
    mapping: {
      mode: form.mode,
      root,
      identity,
      displayName,
      properties,
      observedAt,
      sourceQuality
    },
    problems
  };
}

export function buildQueryDefinitionFromForm(
  form: QueryFormState,
  connectionId: string,
  mapping: DataQueryMapping
): DataQueryDefinition {
  return {
    connectionId,
    name: form.name,
    method: form.method,
    readOnly: form.readOnly,
    path: form.path,
    headers: queryHeadersToRecord(form.headers),
    parameters: toQueryParameterDrafts(form.parameters),
    successCondition: buildSuccessConditionFromForm(form),
    mapping,
    updatePolicy: buildUpdatePolicy(form)
  };
}

export function buildSuccessConditionFromForm(form: QueryFormState): DataSuccessCondition | null {
  if (!form.successPath.trim()) {
    return null;
  }
  const path = parseDataPath(form.successPath) ?? [];
  const equals: DataPathPrimitive = form.successType === "null"
    ? null
    : form.successType === "boolean"
      ? form.successValue === "true"
      : form.successType === "number"
        ? form.successValue.trim() === "" ? Number.NaN : Number(form.successValue)
        : form.successValue;
  return { path, equals };
}

export function queryHeadersToRecord(headers: readonly QueryHeaderForm[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const header of headers) {
    if (!header.name && !header.value) {
      continue;
    }
    result[header.name] = header.value;
  }
  return result;
}

function buildUpdatePolicy(form: QueryFormState): DataQueryDefinition["updatePolicy"] {
  return {
    refreshIntervalMs: secondsToMilliseconds(form.refreshIntervalSeconds),
    maxAgeMs: secondsToMilliseconds(form.maxAgeSeconds)
  };
}

export function serializeQueryForm(form: QueryFormState): string {
  return JSON.stringify({
    name: form.name,
    method: form.method,
    readOnly: form.readOnly,
    path: form.path,
    headers: form.headers.map(({ name, value }) => ({ name, value })),
    refreshIntervalSeconds: form.refreshIntervalSeconds,
    maxAgeSeconds: form.maxAgeSeconds,
    parameters: form.parameters.map((parameter) => ({
      name: parameter.name,
      type: parameter.type,
      location: parameter.location,
      useDefault: parameter.useDefault,
      defaultText: parameter.defaultText
    })),
    successPath: form.successPath,
    successType: form.successType,
    successValue: form.successValue,
    mode: form.mode,
    rootPath: form.rootPath,
    identityKind: form.identityKind,
    identityPath: form.identityPath,
    identityValueType: form.identityValueType,
    identityParameter: form.identityParameter,
    identityLiteral: form.identityLiteral,
    displayNamePath: form.displayNamePath,
    properties: form.properties.map((property) => ({
      key: property.key,
      label: property.label,
      type: property.type,
      source: property.source,
      transformKind: property.transformKind,
      factor: property.factor,
      offset: property.offset,
      mapEntries: property.mapEntries.map((entry) => ({ from: entry.from, to: entry.to })),
      unit: property.unit,
      nullable: property.nullable,
      rangeMin: property.rangeMin,
      rangeMax: property.rangeMax,
      allowedText: property.allowedText
    })),
    observedPath: form.observedPath,
    observedFormat: form.observedFormat,
    qualityPath: form.qualityPath,
    qualityEntries: form.qualityEntries.map((entry) => ({ from: entry.from, quality: entry.quality }))
  });
}

export function queryDraftSignature(
  form: QueryFormState,
  overrides: DataQueryParameterOverrides
): string {
  return JSON.stringify([serializeQueryForm(form), overrides]);
}

export function resolvedParametersForForm(
  form: QueryFormState,
  overrides: DataQueryParameterOverrides
): Record<string, DataParameterValue> {
  const resolution = resolveDataQueryParameters(toQueryParameterDrafts(form.parameters), overrides);
  return resolution.values;
}

export function formatMapValue(value: unknown): string {
  return JSON.stringify(value);
}

function formatMapOutput(value: DataParameterValue): string {
  return String(value);
}

function buildRange(
  property: QueryPropertyForm,
  index: number,
  problems: QueryFormProblem[]
): DataQueryMapping["properties"][number]["range"] {
  const minText = property.rangeMin.trim();
  const maxText = property.rangeMax.trim();
  if (!minText && !maxText) {
    return null;
  }
  if (property.type !== "number") {
    problems.push({ field: `property:${index}:range`, messageKey: "dataSources.mapping.rangeError" });
    return null;
  }
  const min = minText === "" ? null : Number(minText);
  const max = maxText === "" ? null : Number(maxText);
  if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) {
    problems.push({ field: `property:${index}:range`, messageKey: "dataSources.mapping.rangeError" });
    return null;
  }
  return { min, max };
}

function buildAllowed(
  property: QueryPropertyForm,
  index: number,
  problems: QueryFormProblem[]
): DataQueryMapping["properties"][number]["allowed"] {
  const text = property.allowedText.trim();
  if (!text) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    problems.push({ field: `property:${index}:allowed`, messageKey: "dataSources.mapping.allowedError" });
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 ||
    !parsed.every((value) => isPropertyValueOfType(value, property.type))) {
    problems.push({ field: `property:${index}:allowed`, messageKey: "dataSources.mapping.allowedError" });
    return null;
  }
  return parsed as DataParameterValue[];
}

function isPropertyValueOfType(value: unknown, type: DataMappedValueType): value is DataParameterValue {
  switch (type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    default:
      return typeof value === "string";
  }
}

function buildIdentity(
  form: QueryFormState,
  problems: QueryFormProblem[]
): DataQueryMapping["identity"] | null {
  if (form.identityKind === "path") {
    const identityPath = parseFormPath(form.identityPath, "identity", false, problems);
    if (!identityPath) {
      return null;
    }
    return { kind: "path", path: identityPath, valueType: form.identityValueType };
  }
  if (form.identityKind === "parameter") {
    return { kind: "parameter", parameterName: form.identityParameter };
  }
  return { kind: "literal", value: form.identityLiteral };
}

function buildTransform(
  property: QueryPropertyForm,
  index: number,
  problems: QueryFormProblem[]
): DataQueryMapping["properties"][number]["transform"] {
  switch (property.transformKind) {
    case "number":
      return { kind: "number" };
    case "scale":
      return {
        kind: "scale",
        factor: property.factor.trim() === "" ? Number.NaN : Number(property.factor),
        offset: property.offset.trim() === "" ? 0 : Number(property.offset)
      };
    case "map": {
      const entries: DataValueMapEntry[] = [];
      for (const [entryIndex, entry] of property.mapEntries.entries()) {
        const from = parseMapValue(entry.from, `property:${index}:map:${entryIndex}`, problems);
        if (!isPathPrimitiveValue(from.value)) {
          if (from.value !== undefined) {
            problems.push({ field: `property:${index}:map:${entryIndex}`, messageKey: "dataSources.mapping.mapValueError" });
          }
          continue;
        }
        const to = parseMapOutput(entry.to, property.type);
        entries.push({ from: from.value, to });
      }
      return { kind: "map", entries };
    }
    default:
      return { kind: "raw" };
  }
}

function parseMapOutput(value: string, type: DataMappedValueType): DataParameterValue {
  if (type === "boolean") {
    return value === "true";
  }
  if (type === "number") {
    return value.trim() === "" ? Number.NaN : Number(value);
  }
  return value;
}

function parseFormPath(
  text: string,
  field: string,
  allowEmpty: boolean,
  problems: QueryFormProblem[]
): DataPath | null {
  const trimmed = text.trim();
  if (trimmed === "" && allowEmpty) {
    return [];
  }
  const parsed = parseDataPath(trimmed);
  if (!parsed) {
    problems.push({ field, messageKey: "dataSources.mapping.pathError" });
    return null;
  }
  return parsed;
}

function parseMapValue(
  text: string,
  field: string,
  problems: QueryFormProblem[]
): { value: unknown } {
  try {
    return { value: JSON.parse(text) };
  } catch {
    problems.push({ field, messageKey: "dataSources.mapping.mapValueError" });
    return { value: undefined };
  }
}

function isPathPrimitiveValue(value: unknown): value is DataPathPrimitive {
  return value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
}

function formatSeconds(milliseconds: number): string {
  return String(milliseconds / 1000);
}

function secondsToMilliseconds(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return Number.NaN;
  }
  return Number(trimmed) * 1000;
}
