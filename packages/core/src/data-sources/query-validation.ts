import { isPlainRecord } from "../snapshot/json";
import type { SceneSnapshot } from "../snapshot/types";
import { validateDataQueryMapping } from "./mapping";
import {
  buildDataGetRequest,
  validateDataQueryParameterDefinitions,
  type DataQueryProblemCode
} from "./query";
import type {
  DataConnection,
  DataParameterType,
  DataParameterValue,
  DataQuery,
  DataQueryDefinition,
  DataQueryDefinitionProblem,
  DataQueryParameterDraft,
  DataQueryValidationResult
} from "./types";

export interface ValidateDataQueryDefinitionOptions {
  queryId?: string | null;
  existingQueries?: readonly Pick<DataQuery, "id" | "name" | "connectionId">[];
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
  if (connection && parameters && !problems.some((problem) => problem.field === "parameters")) {
    const request = buildDataGetRequest(
      fakeSnapshot(connection),
      {
        connectionId: connection.id,
        path,
        parameters
      },
      { overrides: sampleParameterValues(parameters) }
    );
    if (!request.ok) {
      for (const problem of request.problems) {
        if (problem.code === "connection-not-found") {
          continue;
        }
        problems.push({
          field: problem.field === "path" ? "path" : "parameters",
          code: mapRequestProblemCode(problem.code),
          message: problem.message,
          ...(problem.parameterName ? { parameterName: problem.parameterName } : {})
        });
      }
    }
  }

  const mapping = validateDataQueryMapping(input.mapping, { parameters: parameters ?? [] });
  for (const problem of mapping.problems) {
    problems.push(problem);
  }

  if (problems.length > 0 || !mapping.value || !parameters) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    problems: [],
    value: {
      connectionId,
      name,
      path,
      parameters,
      mapping: mapping.value
    }
  };
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
    case "parameter-duplicate":
      return "parameter-duplicate";
    case "parameter-missing":
      return "parameter-missing";
    case "parameter-type":
      return "parameter-type";
    default:
      return code.startsWith("path-") ? "path-invalid" : "parameter-invalid";
  }
}
