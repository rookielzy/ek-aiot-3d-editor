import { isPlainRecord, type JsonValue } from "../snapshot/json";
import { isValidDataPath, resolveDataPath } from "./path";
import { parseDataIsoDateTime } from "./response";
import type {
  DataIdentityMapping,
  DataMappedValueType,
  DataMappingMode,
  DataParameterType,
  DataParameterValue,
  DataPropertyMapping,
  DataQuality,
  DataQualityMapEntry,
  DataQualityMapping,
  DataQueryDefinitionProblem,
  DataQueryMapping,
  DataQueryParameterDraft,
  DataTimeFormat,
  DataValueMapEntry
} from "./types";

const PROPERTY_KEY = /^[A-Za-z0-9_.-]+$/;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const STRICT_NUMERIC_STRING = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export type DataMappingProblemCode =
  | "display-name-invalid"
  | "entity-id-duplicate"
  | "entity-id-invalid"
  | "entity-id-missing"
  | "observed-at-future"
  | "observed-at-invalid"
  | "observed-at-missing"
  | "property-allowed"
  | "property-conversion"
  | "property-missing"
  | "property-null"
  | "property-range"
  | "property-type"
  | "root-missing"
  | "root-type"
  | "source-quality-invalid";

export interface DataMappingProblem {
  code: DataMappingProblemCode;
  message: string;
  propertyKey?: string;
  entityId?: string;
}

export type DataFieldStatus = "ok" | "missing" | "null" | "invalid";

export interface DataMappedField {
  key: string;
  label: string;
  type: DataMappedValueType;
  unit: string | null;
  raw: JsonValue | undefined;
  value: DataParameterValue | null;
  status: DataFieldStatus;
  problems: readonly DataMappingProblem[];
}

export interface DataMappedEntity {
  entityId: string;
  displayName: string | null;
  observedAt: number | null;
  receivedAt: number;
  sourceQuality: DataQuality;
  observedAtProblem: DataMappingProblem | null;
  qualityProblem: DataMappingProblem | null;
  fields: readonly DataMappedField[];
}

export interface DataStandardSample {
  connectionId: string;
  queryId: string | null;
  executionId: string;
  entityId: string;
  propertyKey: string;
  value: DataParameterValue;
  observedAt: number | null;
  receivedAt: number;
  sourceQuality: DataQuality;
}

export interface MapDataQueryBodyOptions {
  connectionId: string;
  queryId?: string | null;
  executionId?: string;
  receivedAt: number;
  parameters?: Readonly<Record<string, DataParameterValue>>;
}

export type DataMappingResult =
  | {
      ok: true;
      errors: readonly [];
      problems: readonly DataMappingProblem[];
      entities: readonly DataMappedEntity[];
      samples: readonly DataStandardSample[];
    }
  | {
      ok: false;
      errors: readonly DataMappingProblem[];
      problems: readonly [];
      entities: readonly [];
      samples: readonly [];
    };

export interface DataMappingValidationResult {
  ok: boolean;
  problems: DataQueryDefinitionProblem[];
  value?: DataQueryMapping;
}

export interface ValidateDataQueryMappingOptions {
  parameters?: readonly DataQueryParameterDraft[];
}

export const DATA_OBSERVED_AT_FUTURE_TOLERANCE_MS = 30_000;

export function mapDataQueryBody(
  mapping: DataQueryMapping,
  body: JsonValue,
  options: MapDataQueryBodyOptions
): DataMappingResult {
  const receivedAt = options.receivedAt;
  const root = resolveDataPath(body, mapping.root);
  if (root === undefined) {
    return failed([{
      code: "root-missing",
      message: "The configured data root is not present in this response."
    }]);
  }

  const items: JsonValue[] = mapping.mode === "array"
    ? Array.isArray(root)
      ? root
      : []
    : isPlainRecord(root)
      ? [root as JsonValue]
      : [];
  if (mapping.mode === "array" && !Array.isArray(root)) {
    return failed([{
      code: "root-type",
      message: "The configured data root must be an array in device array mode."
    }]);
  }
  if (mapping.mode === "single" && !isPlainRecord(root)) {
    return failed([{
      code: "root-type",
      message: "The configured data root must be an object in single object mode."
    }]);
  }

  const problems: DataMappingProblem[] = [];
  const entities: DataMappedEntity[] = [];
  const samples: DataStandardSample[] = [];
  const seenIds = new Set<string>();

  for (const item of items) {
    const identity = resolveIdentity(mapping.identity, item, options.parameters ?? {});
    if (!identity.ok) {
      problems.push(identity.problem);
      continue;
    }
    if (seenIds.has(identity.id)) {
      return failed([{
        code: "entity-id-duplicate",
        entityId: identity.id,
        message: `Device ID ${identity.id} appears more than once in this result.`
      }]);
    }
    seenIds.add(identity.id);

    const displayName = resolveDisplayName(mapping.displayName, item);
    const observed = resolveObservedAt(mapping.observedAt, item, receivedAt);
    const quality = resolveQuality(mapping.sourceQuality, item);
    const fields = mapping.properties.map((property) => mapProperty(property, item));

    const entity: DataMappedEntity = {
      entityId: identity.id,
      displayName: displayName.value,
      observedAt: observed.value,
      receivedAt,
      sourceQuality: quality.value,
      observedAtProblem: observed.problem,
      qualityProblem: quality.problem,
      fields
    };
    entities.push(entity);

    for (const field of fields) {
      if (field.status !== "ok" || field.value === null) {
        continue;
      }
      samples.push({
        connectionId: options.connectionId,
        queryId: options.queryId ?? null,
        executionId: options.executionId ?? "",
        entityId: identity.id,
        propertyKey: field.key,
        value: field.value,
        observedAt: observed.value,
        receivedAt,
        sourceQuality: quality.value
      });
    }
    if (displayName.problem) {
      problems.push({ ...displayName.problem, entityId: identity.id });
    }
  }

  return {
    ok: true,
    errors: [],
    problems,
    entities,
    samples
  };
}

export function validateDataQueryMapping(
  input: unknown,
  options: ValidateDataQueryMappingOptions = {}
): DataMappingValidationResult {
  const problems: DataQueryDefinitionProblem[] = [];
  const mappingProblem = (message: string, propertyKey?: string): void => {
    problems.push({
      field: "mapping",
      code: "mapping-invalid",
      message,
      ...(propertyKey ? { propertyKey } : {})
    });
  };

  if (!isPlainRecord(input)) {
    return {
      ok: false,
      problems: [{ field: "mapping", code: "mapping-invalid", message: "The query mapping must be a plain object." }]
    };
  }

  const mode = input.mode;
  if (mode !== "array" && mode !== "single") {
    mappingProblem("Mapping mode must be array or single.");
  }
  if (!isValidDataPath(input.root, { allowEmpty: true })) {
    mappingProblem("The data root path is invalid.");
  }

  const identity = validateIdentity(input.identity, mode === "single", options.parameters ?? [], mappingProblem);
  const displayName = input.displayName === undefined || input.displayName === null
    ? null
    : isValidDataPath(input.displayName)
      ? input.displayName
      : null;
  if (input.displayName !== undefined && input.displayName !== null && !isValidDataPath(input.displayName)) {
    mappingProblem("The display name path is invalid.");
  }

  const properties: DataPropertyMapping[] = [];
  if (!Array.isArray(input.properties) || input.properties.length === 0) {
    problems.push({
      field: "mapping",
      code: "mapping-property-required",
      message: "At least one mapped property is required."
    });
  } else {
    const keys = new Set<string>();
    for (const property of input.properties) {
      const value = validateProperty(property, mappingProblem);
      if (!value) {
        continue;
      }
      if (keys.has(value.key)) {
        mappingProblem(`Property key ${value.key} is defined more than once.`, value.key);
        continue;
      }
      keys.add(value.key);
      properties.push(value);
    }
  }

  const observedAt = validateObservedAt(input.observedAt, mappingProblem);
  const sourceQuality = validateQuality(input.sourceQuality, mappingProblem);

  if (problems.length > 0 || !identity) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    problems: [],
    value: {
      mode: mode as DataMappingMode,
      root: input.root as DataQueryMapping["root"],
      identity,
      displayName,
      properties,
      observedAt,
      sourceQuality
    }
  };
}

function validateIdentity(
  input: unknown,
  singleMode: boolean,
  parameters: readonly DataQueryParameterDraft[],
  report: (message: string) => void
): DataIdentityMapping | null {
  if (!isPlainRecord(input)) {
    report("A device identity rule is required.");
    return null;
  }
  if (input.kind === "path") {
    if (!isValidDataPath(input.path)) {
      report("The identity field path is invalid.");
      return null;
    }
    if (input.valueType !== "string" && input.valueType !== "number") {
      report("The identity field must be read as a string or number.");
      return null;
    }
    return { kind: "path", path: input.path, valueType: input.valueType };
  }
  if (!singleMode) {
    report("Array mode requires the device ID to come from a field.");
    return null;
  }
  if (input.kind === "parameter") {
    const parameterName = typeof input.parameterName === "string" ? input.parameterName.trim() : "";
    const parameter = parameters.find((entry) => entry.name.trim() === parameterName);
    if (!parameterName || !parameter) {
      report(`Identity parameter ${parameterName || "(empty)"} is not defined by this query.`);
      return null;
    }
    if (parameter.type === "boolean") {
      report(`Identity parameter ${parameterName} must be a string or number.`);
      return null;
    }
    return { kind: "parameter", parameterName };
  }
  if (input.kind === "literal") {
    const value = typeof input.value === "string" ? input.value.trim() : "";
    if (!value) {
      report("A fixed device ID is required.");
      return null;
    }
    return { kind: "literal", value: input.value as string };
  }
  report("The identity rule is unsupported.");
  return null;
}

function validateProperty(
  input: unknown,
  report: (message: string, propertyKey?: string) => void
): DataPropertyMapping | null {
  if (!isPlainRecord(input)) {
    report("A property mapping must be a plain object.");
    return null;
  }
  const key = typeof input.key === "string" ? input.key.trim() : "";
  if (!key || !PROPERTY_KEY.test(key) || UNSAFE_KEYS.has(key)) {
    report(`Property key ${key || "(empty)"} is invalid.`);
    return null;
  }
  if (input.type !== "number" && input.type !== "string" && input.type !== "boolean") {
    report(`Property ${key} must use the number, string, or boolean type.`, key);
    return null;
  }
  if (!isValidDataPath(input.source)) {
    report(`Property ${key} must use a valid source path.`, key);
    return null;
  }
  const transform = validateTransform(input.transform, input.type, key, report);
  if (!transform) {
    return null;
  }
  const range = validateRange(input.range, input.type, key, report);
  const allowed = validateAllowed(input.allowed, input.type, key, report);
  const nullable = input.nullable === undefined ? false : input.nullable;
  if (typeof nullable !== "boolean") {
    report(`Property ${key} nullable must be a boolean.`, key);
    return null;
  }
  const unit = input.unit === undefined || input.unit === null
    ? null
    : typeof input.unit === "string" && !/[\u0000-\u001f\u007f]/.test(input.unit)
      ? input.unit.trim() || null
      : null;
  if (input.unit !== undefined && input.unit !== null && unit === null && input.unit !== "") {
    report(`Property ${key} unit is invalid.`, key);
    return null;
  }
  const label = typeof input.label === "string" && input.label.trim().length > 0 ? input.label.trim() : key;

  return {
    key,
    label,
    type: input.type,
    nullable,
    unit,
    source: input.source,
    transform,
    range,
    allowed
  };
}

function validateTransform(
  input: unknown,
  type: DataMappedValueType,
  key: string,
  report: (message: string, propertyKey?: string) => void
): DataPropertyMapping["transform"] | null {
  if (!isPlainRecord(input)) {
    report(`Property ${key} must include a transform.`, key);
    return null;
  }
  switch (input.kind) {
    case "raw":
      return { kind: "raw" };
    case "number":
      if (type !== "number") {
        report(`Property ${key} can only convert to number when its type is number.`, key);
        return null;
      }
      return { kind: "number" };
    case "scale": {
      if (type !== "number") {
        report(`Property ${key} can only scale a number.`, key);
        return null;
      }
      const factor = input.factor;
      const offset = input.offset === undefined ? 0 : input.offset;
      if (typeof factor !== "number" || !Number.isFinite(factor)) {
        report(`Property ${key} scale factor must be a finite number.`, key);
        return null;
      }
      if (typeof offset !== "number" || !Number.isFinite(offset)) {
        report(`Property ${key} scale offset must be a finite number.`, key);
        return null;
      }
      return { kind: "scale", factor, offset };
    }
    case "map": {
      if (!Array.isArray(input.entries) || input.entries.length === 0) {
        report(`Property ${key} map transform requires at least one entry.`, key);
        return null;
      }
      const entries: DataValueMapEntry[] = [];
      for (const entry of input.entries) {
        if (!isPlainRecord(entry) || !isPathPrimitive(entry.from)) {
          report(`Property ${key} map entries must start from a JSON scalar.`, key);
          return null;
        }
        if (!isValueOfType(entry.to, type)) {
          report(`Property ${key} map entries must produce a ${type}.`, key);
          return null;
        }
        if (entries.some((existing) => scalarEquals(existing.from, entry.from))) {
          report(`Property ${key} maps the same source value more than once.`, key);
          return null;
        }
        entries.push({ from: entry.from, to: entry.to as DataParameterValue });
      }
      return { kind: "map", entries };
    }
    default:
      report(`Property ${key} transform is unsupported.`, key);
      return null;
  }
}

function validateRange(
  input: unknown,
  type: DataMappedValueType,
  key: string,
  report: (message: string, propertyKey?: string) => void
): DataPropertyMapping["range"] {
  if (input === undefined || input === null) {
    return null;
  }
  if (type !== "number" || !isPlainRecord(input)) {
    report(`Property ${key} range is only valid for numbers.`, key);
    return null;
  }
  const min = input.min === undefined ? null : input.min;
  const max = input.max === undefined ? null : input.max;
  if (min === null && max === null) {
    report(`Property ${key} range must include a minimum or maximum.`, key);
    return null;
  }
  if ((min !== null && (typeof min !== "number" || !Number.isFinite(min))) ||
      (max !== null && (typeof max !== "number" || !Number.isFinite(max)))) {
    report(`Property ${key} range bounds must be finite numbers.`, key);
    return null;
  }
  if (min !== null && max !== null && min > max) {
    report(`Property ${key} range minimum must not exceed its maximum.`, key);
    return null;
  }
  return { min: min as number | null, max: max as number | null };
}

function validateAllowed(
  input: unknown,
  type: DataMappedValueType,
  key: string,
  report: (message: string, propertyKey?: string) => void
): readonly DataParameterValue[] | null {
  if (input === undefined || input === null) {
    return null;
  }
  if (!Array.isArray(input) || input.length === 0) {
    report(`Property ${key} allowed values must be a non-empty array.`, key);
    return null;
  }
  const allowed: DataParameterValue[] = [];
  for (const value of input) {
    if (!isValueOfType(value, type)) {
      report(`Property ${key} allowed values must all be ${type}.`, key);
      return null;
    }
    if (allowed.some((existing) => existing === value)) {
      report(`Property ${key} allowed values must be unique.`, key);
      return null;
    }
    allowed.push(value);
  }
  return allowed;
}

function validateObservedAt(
  input: unknown,
  report: (message: string) => void
): DataQueryMapping["observedAt"] {
  if (input === undefined || input === null) {
    return null;
  }
  if (!isPlainRecord(input) || !isValidDataPath(input.path)) {
    report("The observed-at path is invalid.");
    return null;
  }
  if (input.format !== "iso" && input.format !== "unix-seconds" && input.format !== "unix-milliseconds") {
    report("The observed-at format is unsupported.");
    return null;
  }
  return { path: input.path, format: input.format };
}

function validateQuality(
  input: unknown,
  report: (message: string) => void
): DataQualityMapping | null {
  if (input === undefined || input === null) {
    return null;
  }
  if (!isPlainRecord(input) || !isValidDataPath(input.path)) {
    report("The source quality path is invalid.");
    return null;
  }
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    report("Source quality mapping requires at least one entry.");
    return null;
  }
  const entries: DataQualityMapEntry[] = [];
  for (const entry of input.entries) {
    if (!isPlainRecord(entry) || !isPathPrimitive(entry.from)) {
      report("Source quality entries must start from a JSON scalar.");
      return null;
    }
    if (!isQuality(entry.quality)) {
      report("Source quality entries must map to good, uncertain, bad, or unknown.");
      return null;
    }
    if (entries.some((existing) => scalarEquals(existing.from, entry.from))) {
      report("Source quality maps the same source value more than once.");
      return null;
    }
    entries.push({ from: entry.from, quality: entry.quality });
  }
  return { path: input.path, entries };
}

function resolveIdentity(
  identity: DataIdentityMapping,
  item: JsonValue,
  parameters: Readonly<Record<string, DataParameterValue>>
): { ok: true; id: string } | { ok: false; problem: DataMappingProblem } {
  if (identity.kind === "literal") {
    return { ok: true, id: identity.value };
  }
  if (identity.kind === "parameter") {
    if (!Object.prototype.hasOwnProperty.call(parameters, identity.parameterName)) {
      return {
        ok: false,
        problem: {
          code: "entity-id-missing",
          message: `Identity parameter ${identity.parameterName} has no value.`
        }
      };
    }
    const raw = parameters[identity.parameterName];
    if (typeof raw === "string") {
      if (raw.trim().length === 0) {
        return emptyIdProblem();
      }
      return { ok: true, id: raw };
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return { ok: true, id: String(raw) };
    }
    return {
      ok: false,
      problem: { code: "entity-id-invalid", message: "The identity parameter must be a string or number." }
    };
  }

  const raw = resolveDataPath(item, identity.path);
  if (raw === undefined) {
    return {
      ok: false,
      problem: { code: "entity-id-missing", message: "The device ID field is missing." }
    };
  }
  if (identity.valueType === "string") {
    if (typeof raw !== "string") {
      return {
        ok: false,
        problem: { code: "entity-id-invalid", message: "The device ID field must be a string." }
      };
    }
    if (raw.trim().length === 0) {
      return emptyIdProblem();
    }
    return { ok: true, id: raw };
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return {
      ok: false,
      problem: { code: "entity-id-invalid", message: "The device ID field must be a finite number." }
    };
  }
  return { ok: true, id: String(raw) };
}

function emptyIdProblem(): { ok: false; problem: DataMappingProblem } {
  return { ok: false, problem: { code: "entity-id-invalid", message: "The device ID is empty." } };
}

function resolveDisplayName(
  path: DataQueryMapping["displayName"],
  item: JsonValue
): { value: string | null; problem: DataMappingProblem | null } {
  if (!path) {
    return { value: null, problem: null };
  }
  const raw = resolveDataPath(item, path);
  if (raw === undefined || raw === null || raw === "") {
    return { value: null, problem: null };
  }
  if (typeof raw === "string") {
    return { value: raw, problem: null };
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { value: String(raw), problem: null };
  }
  return {
    value: null,
    problem: { code: "display-name-invalid", message: "The display name field must be a string or number." }
  };
}

function mapProperty(property: DataPropertyMapping, item: JsonValue): DataMappedField {
  const raw = resolveDataPath(item, property.source);
  const base = {
    key: property.key,
    label: property.label,
    type: property.type,
    unit: property.unit
  };
  if (raw === undefined) {
    return {
      ...base,
      raw,
      value: null,
      status: "missing",
      problems: [{
        code: "property-missing",
        propertyKey: property.key,
        message: `Source field ${property.key} is missing.`
      }]
    };
  }
  if (raw === null) {
    return {
      ...base,
      raw,
      value: null,
      status: "null",
      problems: property.nullable
        ? []
        : [{
            code: "property-null",
            propertyKey: property.key,
            message: `Property ${property.key} does not allow null.`
          }]
    };
  }

  const transformed = transformValue(raw, property);
  if (!transformed.ok) {
    return {
      ...base,
      raw,
      value: null,
      status: "invalid",
      problems: [{
        code: transformed.code,
        propertyKey: property.key,
        message: transformed.message
      }]
    };
  }

  if (property.type === "number") {
    const value = transformed.value as number;
    if (property.range && ((property.range.min !== null && value < property.range.min) ||
      (property.range.max !== null && value > property.range.max))) {
      return {
        ...base,
        raw,
        value: null,
        status: "invalid",
        problems: [{
          code: "property-range",
          propertyKey: property.key,
          message: `Property ${property.key} is outside its configured range.`
        }]
      };
    }
  }
  if (property.allowed && !property.allowed.some((allowed) => allowed === transformed.value)) {
    return {
      ...base,
      raw,
      value: null,
      status: "invalid",
      problems: [{
        code: "property-allowed",
        propertyKey: property.key,
        message: `Property ${property.key} is not an allowed value.`
      }]
    };
  }

  return {
    ...base,
    raw,
    value: transformed.value,
    status: "ok",
    problems: []
  };
}

function transformValue(
  raw: JsonValue,
  property: DataPropertyMapping
): { ok: true; value: DataParameterValue } | { ok: false; code: "property-type" | "property-conversion"; message: string } {
  switch (property.transform.kind) {
    case "raw":
      if (isValueOfType(raw, property.type)) {
        return { ok: true, value: raw };
      }
      return {
        ok: false,
        code: "property-type",
        message: `Property ${property.key} must be a ${property.type}.`
      };
    case "number":
      if (typeof raw === "number" && Number.isFinite(raw)) {
        return { ok: true, value: raw };
      }
      if (typeof raw === "string" && STRICT_NUMERIC_STRING.test(raw)) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
          return { ok: true, value: parsed };
        }
      }
      return {
        ok: false,
        code: "property-conversion",
        message: `Property ${property.key} is not a strict numeric value.`
      };
    case "scale":
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return {
          ok: false,
          code: "property-type",
          message: `Property ${property.key} must be a finite number to scale.`
        };
      }
      {
        const scaled = raw * property.transform.factor + property.transform.offset;
        if (!Number.isFinite(scaled)) {
          return {
            ok: false,
            code: "property-conversion",
            message: `Property ${property.key} scaled to a non-finite number.`
          };
        }
        return { ok: true, value: scaled };
      }
    case "map": {
      if (!isPathPrimitive(raw)) {
        return {
          ok: false,
          code: "property-conversion",
          message: `Property ${property.key} map transform requires a JSON scalar.`
        };
      }
      const entry = property.transform.entries.find((candidate) => scalarEquals(candidate.from, raw));
      if (!entry) {
        return {
          ok: false,
          code: "property-conversion",
          message: `Property ${property.key} source value has no mapping entry.`
        };
      }
      return { ok: true, value: entry.to };
    }
  }
}

function resolveObservedAt(
  mapping: DataQueryMapping["observedAt"],
  item: JsonValue,
  receivedAt: number
): { value: number | null; problem: DataMappingProblem | null } {
  if (!mapping) {
    return { value: null, problem: null };
  }
  const raw = resolveDataPath(item, mapping.path);
  if (raw === undefined) {
    return {
      value: null,
      problem: { code: "observed-at-missing", message: "The configured observed-at field is missing." }
    };
  }
  const parsed = parseObservedAt(raw, mapping.format);
  if (parsed === null) {
    return {
      value: null,
      problem: { code: "observed-at-invalid", message: "The observed-at value is not a valid configured time." }
    };
  }
  if (parsed > receivedAt + DATA_OBSERVED_AT_FUTURE_TOLERANCE_MS) {
    return {
      value: null,
      problem: {
        code: "observed-at-future",
        message: "The observed-at value is more than 30 seconds after it was received."
      }
    };
  }
  return { value: parsed, problem: null };
}

function parseObservedAt(raw: JsonValue, format: DataTimeFormat): number | null {
  if (format === "iso") return parseDataIsoDateTime(raw);
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  const parsed = format === "unix-seconds" ? raw * 1000 : raw;
  return Number.isFinite(new Date(parsed).getTime()) ? parsed : null;
}

function resolveQuality(
  mapping: DataQueryMapping["sourceQuality"],
  item: JsonValue
): { value: DataQuality; problem: DataMappingProblem | null } {
  if (!mapping) {
    return { value: "unknown", problem: null };
  }
  const raw = resolveDataPath(item, mapping.path);
  if (raw === undefined) {
    return {
      value: "unknown",
      problem: { code: "source-quality-invalid", message: "The configured source quality field is missing." }
    };
  }
  if (!isPathPrimitive(raw)) {
    return {
      value: "unknown",
      problem: { code: "source-quality-invalid", message: "The source quality value is not a JSON scalar." }
    };
  }
  const entry = mapping.entries.find((candidate) => scalarEquals(candidate.from, raw));
  if (!entry) {
    return {
      value: "unknown",
      problem: { code: "source-quality-invalid", message: "The source quality value has no mapping entry." }
    };
  }
  return { value: entry.quality, problem: null };
}

function failed(errors: DataMappingProblem[]): DataMappingResult {
  return { ok: false, errors, problems: [], entities: [], samples: [] };
}

function isValueOfType(value: unknown, type: DataMappedValueType | DataParameterType): value is DataParameterValue {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    default:
      return false;
  }
}

function isPathPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
}

function isQuality(value: unknown): value is DataQuality {
  return value === "good" || value === "uncertain" || value === "bad" || value === "unknown";
}

function scalarEquals(left: unknown, right: unknown): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return typeof left === typeof right && Object.is(left, right);
}
