import { isPlainRecord } from "../snapshot/json";
import type { SceneSnapshot } from "../snapshot/types";
import {
  createDefaultDataQueryUpdatePolicy,
  MIN_DATA_QUERY_REFRESH_INTERVAL_MS
} from "./defaults";
import { reservedDataHeaderNames, validateDataHeaders } from "./headers";
import { validateDataQueryMapping } from "./mapping";
import {
  buildDataQueryRequest,
  resolveDataParameterLocations,
  resolveDataQueryParameters,
  validateDataSuccessCondition,
  validateDataQueryParameterDefinitions,
  type DataQueryProblem,
  type DataQueryProblemCode
} from "./query";
import type {
  DataConnection,
  DataObjectBinding,
  DataParameterType,
  DataParameterValue,
  DataQuery,
  DataQueryDefinitionProblem,
  DataQueryMapping,
  DataQueryMethod,
  DataQueryParameterDraft,
  DataQueryUpdatePolicy,
  DataQueryValidationResult,
  DataSuccessCondition
} from "./types";

export interface ValidateDataQueryDefinitionOptions {
  queryId?: string | null;
  existingQueries?: readonly Pick<DataQuery, "id" | "name" | "connectionId">[];
  existingQuery?: DataQuery | null;
  referencingBindings?: readonly DataObjectBinding[];
  connection?: DataConnection | null;
}

export function validateDataQueryDefinition(
  input: unknown,
  options: ValidateDataQueryDefinitionOptions = {}
): DataQueryValidationResult {
  const problems: DataQueryDefinitionProblem[] = [];
  if (!isPlainRecord(input)) {
    return {
      ok: false,
      problems: [{ field: "query", code: "command-failed", message: "A query definition must be a plain object." }]
    };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const connectionId = typeof input.connectionId === "string" ? input.connectionId.trim() : "";
  if (!name) {
    problems.push({ field: "name", code: "name-required", message: "Query name is required." });
  } else if ((options.existingQueries ?? []).some((query) =>
    query.id !== options.queryId &&
    query.connectionId === connectionId &&
    query.name.trim().toLowerCase() === name.toLowerCase()
  )) {
    problems.push({
      field: "name",
      code: "name-duplicate",
      message: `Query name "${name}" is already used by another query on this connection.`
    });
  }

  if (!connectionId) {
    problems.push({ field: "connection", code: "connection-not-found", message: "A query must belong to a connection." });
  } else if (options.connection === null) {
    problems.push({
      field: "connection",
      code: "connection-not-found",
      message: `Connection ${connectionId} does not exist.`
    });
  }

  const method = validateMethod(input.method, problems);
  const readOnly = validateReadOnly(input.readOnly, method, problems);
  const headers = validateHeaders(input.headers, options.connection ?? null, problems);
  const parameters = validateParameters(input.parameters, connectionId, problems);
  const path = typeof input.path === "string" ? input.path.trim() : "";

  const connection = options.connection ?? (connectionId ? {
    id: connectionId,
    name: "",
    baseUrl: "https://data.invalid/",
    auth: { kind: "none" as const },
    headers: {},
    timeoutMs: 10_000
  } : null);
  let normalizedParameters: DataQueryParameterDraft[] | null = null;
  let successCondition: DataSuccessCondition | null = null;
  if (
    connection &&
    parameters &&
    headers &&
    method &&
    readOnly &&
    !problems.some((problem) => problem.field === "parameters")
  ) {
    const locations = resolveDataParameterLocations(parameters, method, path, connectionId);
    if (!locations.ok) {
      for (const problem of locations.problems) {
        problems.push({
          field: "parameters",
          code: "parameter-invalid",
          message: problem.message,
          ...(problem.parameterName ? { parameterName: problem.parameterName } : {})
        });
      }
    }
    if (locations.ok) {
      normalizedParameters = parameters.map((parameter) => ({
        ...parameter,
        location: locations.locations[parameter.name.trim()]
      }));
      if (!problems.some((problem) => problem.field === "parameters")) {
        const validatedSuccessCondition = validateDataSuccessCondition(input.successCondition, connectionId);
        if (validatedSuccessCondition.problem) {
          problems.push({
            field: "successCondition",
            code: "success-condition-invalid",
            message: validatedSuccessCondition.problem.message
          });
        }
        if (!validatedSuccessCondition.problem) {
          const request = buildDataQueryRequest(
            fakeSnapshot(connection),
            {
              connectionId: connection.id,
              method,
              readOnly,
              path,
              headers,
              parameters: normalizedParameters,
              successCondition: validatedSuccessCondition.condition
            },
            { overrides: sampleParameterValues(normalizedParameters) }
          );
          if (!request.ok) {
            for (const problem of request.problems) {
              if (problem.code === "connection-not-found") {
                continue;
              }
              problems.push({
                field: queryProblemField(problem),
                code: mapRequestProblemCode(problem.code),
                message: problem.message,
                ...(problem.parameterName ? { parameterName: problem.parameterName } : {})
              });
            }
          }
          if (request.ok) {
            successCondition = request.summary.successCondition;
          }
        }
      }
    }
  }

  const mapping = validateDataQueryMapping(input.mapping, { parameters: normalizedParameters ?? parameters ?? [] });
  for (const problem of mapping.problems) {
    problems.push(problem);
  }

  const updatePolicy = validateUpdatePolicy(input.updatePolicy, method, problems);

  if (
    problems.length === 0 &&
    normalizedParameters &&
    mapping.value &&
    updatePolicy &&
    options.existingQuery &&
    options.referencingBindings &&
    options.referencingBindings.length > 0
  ) {
    validateBindingReferences(options.existingQuery, normalizedParameters, mapping.value, options.referencingBindings, problems);
  }

  if (
    problems.length > 0 ||
    !mapping.value ||
    !normalizedParameters ||
    !headers ||
    !method ||
    !readOnly ||
    !updatePolicy
  ) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    problems: [],
    value: {
      connectionId,
      name,
      method,
      readOnly,
      path,
      headers,
      parameters: normalizedParameters,
      successCondition,
      mapping: mapping.value,
      updatePolicy
    }
  };
}

function validateMethod(value: unknown, problems: DataQueryDefinitionProblem[]): DataQueryMethod | null {
  if (value === undefined) {
    return "GET";
  }
  if (value !== "GET" && value !== "POST") {
    problems.push({
      field: "method",
      code: "method-invalid",
      message: "A query method must be GET or POST."
    });
    return null;
  }
  return value;
}

function validateReadOnly(
  value: unknown,
  method: DataQueryMethod | null,
  problems: DataQueryDefinitionProblem[]
): true | null {
  if (value === undefined) {
    if (method === "POST") {
      problems.push({
        field: "method",
        code: "post-read-only-required",
        message: "A POST query must be explicitly confirmed as read-only."
      });
      return null;
    }
    return true;
  }
  if (value !== true) {
    problems.push({
      field: "method",
      code: method === "POST" ? "post-read-only-required" : "method-invalid",
      message: method === "POST"
        ? "A POST query must be explicitly confirmed as read-only."
        : "Only read-only data queries are supported."
    });
    return null;
  }
  return true;
}

function validateHeaders(
  value: unknown,
  connection: DataConnection | null,
  problems: DataQueryDefinitionProblem[]
): Record<string, string> | null {
  const result = validateDataHeaders(value, {
    reserved: reservedDataHeaderNames(connection?.auth)
  });
  for (const problem of result.problems) {
    problems.push({
      field: "headers",
      code: problem.code === "reserved" ? "header-reserved" : "header-invalid",
      message: problem.message
    });
  }
  return result.headers;
}

function queryProblemField(problem: DataQueryProblem): DataQueryDefinitionProblem["field"] {
  if (problem.field === "path") {
    return "path";
  }
  if (problem.field === "parameters") {
    return "parameters";
  }
  switch (problem.code) {
    case "header-invalid":
    case "header-reserved":
      return "headers";
    case "method-invalid":
    case "post-read-only-required":
      return "method";
    case "success-condition-invalid":
      return "successCondition";
    default:
      return "query";
  }
}

function validateUpdatePolicy(
  input: unknown,
  method: DataQueryMethod | null,
  problems: DataQueryDefinitionProblem[]
): DataQueryUpdatePolicy | null {
  if (input === undefined) {
    return createDefaultDataQueryUpdatePolicy();
  }
  if (!isPlainRecord(input)) {
    problems.push({
      field: "updatePolicy",
      code: "update-policy-invalid",
      message: "Query update policy must be a plain object."
    });
    return null;
  }

  const refreshIntervalMs = input.refreshIntervalMs;
  const maxAgeMs = input.maxAgeMs;
  if (
    typeof refreshIntervalMs !== "number" ||
    !Number.isSafeInteger(refreshIntervalMs) ||
    refreshIntervalMs < MIN_DATA_QUERY_REFRESH_INTERVAL_MS
  ) {
    problems.push({
      field: "updatePolicy",
      code: "update-policy-invalid",
      message: `Refresh interval must be a whole number of milliseconds of at least ${MIN_DATA_QUERY_REFRESH_INTERVAL_MS}.`
    });
  }
  if (typeof maxAgeMs !== "number" || !Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) {
    problems.push({
      field: "updatePolicy",
      code: "update-policy-invalid",
      message: "Maximum age must be a positive whole number of milliseconds."
    });
  }
  if (
    method === "GET" &&
    typeof refreshIntervalMs === "number" &&
    Number.isSafeInteger(refreshIntervalMs) &&
    refreshIntervalMs >= MIN_DATA_QUERY_REFRESH_INTERVAL_MS &&
    typeof maxAgeMs === "number" &&
    Number.isSafeInteger(maxAgeMs) &&
    maxAgeMs > 0 &&
    maxAgeMs < refreshIntervalMs
  ) {
    problems.push({
      field: "updatePolicy",
      code: "update-policy-invalid",
      message: "Maximum age cannot be shorter than the refresh interval while polling."
    });
  }

  if (problems.some((problem) => problem.field === "updatePolicy")) {
    return null;
  }
  return { refreshIntervalMs: refreshIntervalMs as number, maxAgeMs: maxAgeMs as number };
}

function validateParameters(
  input: unknown,
  connectionId: string,
  problems: DataQueryDefinitionProblem[]
): DataQueryParameterDraft[] | null {
  if (!Array.isArray(input)) {
    problems.push({
      field: "parameters",
      code: "parameter-invalid",
      message: "Query parameters must be an array."
    });
    return null;
  }

  const normalized: DataQueryParameterDraft[] = [];
  for (const parameter of input) {
    if (!isPlainRecord(parameter)) {
      problems.push({
        field: "parameters",
        code: "parameter-invalid",
        message: "Each parameter must be a plain object."
      });
      continue;
    }
    const entry: DataQueryParameterDraft = {
      name: typeof parameter.name === "string" ? parameter.name.trim() : "",
      type: parameter.type as DataParameterType
    };
    if (parameter.location !== undefined) {
      entry.location = parameter.location as DataQueryParameterDraft["location"];
    }
    if (Object.prototype.hasOwnProperty.call(parameter, "defaultValue") &&
      parameter.defaultValue !== undefined) {
      entry.defaultValue = parameter.defaultValue as DataParameterValue;
    }
    normalized.push(entry);
  }

  for (const problem of validateDataQueryParameterDefinitions(normalized, connectionId)) {
    problems.push({
      field: "parameters",
      code: problem.code === "parameter-duplicate" || problem.code === "parameter-type"
        ? problem.code
        : "parameter-invalid",
      message: problem.message,
      ...(problem.parameterName ? { parameterName: problem.parameterName } : {})
    });
  }
  return normalized;
}

function sampleParameterValues(
  parameters: readonly DataQueryParameterDraft[]
): Record<string, DataParameterValue> {
  const values: Record<string, DataParameterValue> = {};
  for (const parameter of parameters) {
    values[parameter.name] = Object.prototype.hasOwnProperty.call(parameter, "defaultValue")
      ? parameter.defaultValue as DataParameterValue
      : sampleParameterValue(parameter.type);
  }
  return values;
}

function sampleParameterValue(type: DataParameterType): DataParameterValue {
  switch (type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    default:
      return "sample";
  }
}

function fakeSnapshot(connection: DataConnection): Pick<SceneSnapshot, "dataSources"> {
  return {
    dataSources: {
      connections: { [connection.id]: connection },
      queries: {},
      bindings: {}
    }
  };
}

function mapRequestProblemCode(code: DataQueryProblemCode): DataQueryDefinitionProblem["code"] {
  switch (code) {
    case "connection-not-found":
      return "connection-not-found";
    case "header-invalid":
      return "header-invalid";
    case "header-reserved":
      return "header-reserved";
    case "method-invalid":
      return "method-invalid";
    case "parameter-duplicate":
      return "parameter-duplicate";
    case "parameter-missing":
      return "parameter-missing";
    case "parameter-type":
      return "parameter-type";
    case "post-read-only-required":
      return "post-read-only-required";
    case "success-condition-invalid":
      return "success-condition-invalid";
    case "parameter-location-invalid":
    case "parameter-definition-invalid":
      return "parameter-invalid";
    default:
      return code.startsWith("path-") ? "path-invalid" : "parameter-invalid";
  }
}

function validateBindingReferences(
  existingQuery: DataQuery,
  parameters: readonly DataQueryParameterDraft[],
  mapping: DataQueryMapping,
  bindings: readonly DataObjectBinding[],
  problems: DataQueryDefinitionProblem[]
): void {
  const previousParameters = new Map(existingQuery.parameters.map((parameter) => [parameter.name.trim(), parameter]));
  const nextParameters = new Map(parameters.map((parameter) => [parameter.name.trim(), parameter]));
  const previousProperties = new Map(existingQuery.mapping.properties.map((property) => [property.key, property]));
  const nextProperties = new Map(mapping.properties.map((property) => [property.key, property]));

  const reportedProperties = new Set<string>();
  const bindingPropertyKeys = new Set(bindings.flatMap((binding) => [
    ...binding.details.map((detail) => detail.key),
    ...(binding.color ? [binding.color.propertyKey] : [])
  ]));
  for (const propertyKey of bindingPropertyKeys) {
    const previous = previousProperties.get(propertyKey);
    const next = nextProperties.get(propertyKey);
    if (!next || (previous && previous.type !== next.type)) {
      reportedProperties.add(propertyKey);
      problems.push({
        field: "mapping",
        code: "binding-property-in-use",
        propertyKey,
        message: `Property ${propertyKey} is used by an object binding. Remove the binding or keep a compatible property.`
      });
    }
  }

  const reportedParameters = new Set<string>();
  for (const binding of bindings) {
    for (const name of Object.keys(binding.parameterOverrides)) {
      if (reportedParameters.has(name)) {
        continue;
      }
      const previous = previousParameters.get(name);
      const next = nextParameters.get(name);
      if (!next || (previous && previous.type !== next.type)) {
        reportedParameters.add(name);
        problems.push({
          field: "parameters",
          code: "binding-parameter-in-use",
          parameterName: name,
          message: `Parameter ${name} is overridden by an object binding. Remove the override or keep its type.`
        });
      }
    }

    const resolution = resolveDataQueryParameters(parameters, binding.parameterOverrides, existingQuery.connectionId);
    for (const problem of resolution.problems) {
      if (problem.code !== "parameter-missing" && problem.code !== "parameter-type") {
        continue;
      }
      const name = problem.parameterName ?? "";
      if (name && reportedParameters.has(name)) {
        continue;
      }
      if (name) {
        reportedParameters.add(name);
      }
      problems.push({
        field: "parameters",
        code: "binding-parameter-in-use",
        ...(name ? { parameterName: name } : {}),
        message: problem.message
      });
    }
  }
}
