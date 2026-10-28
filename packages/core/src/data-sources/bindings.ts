import type { SceneSnapshot } from "../snapshot/types";
import { isPlainRecord } from "../snapshot/json";
import type {
  DeleteDataObjectBindingCommand,
  SetDataObjectBindingCommand
} from "../commands/types";
import { resolveDataQueryParameters } from "./query";
import type {
  DataBindingDetailField,
  DataBindingProblem,
  DataObjectBinding,
  DataObjectBindingInput,
  DataObjectBindingValidationResult,
  DataParameterValue,
  DataQuery
} from "./types";

export const DATA_DETAIL_MAX_PRECISION = 6;
export const DATA_DETAIL_DEFAULT_PRECISION = 2;

export type DataObjectBindingCommand = SetDataObjectBindingCommand | DeleteDataObjectBindingCommand;

export type DataObjectBindingCommandBuildResult =
  | { ok: true; command: DataObjectBindingCommand }
  | { ok: false; problems: DataBindingProblem[] };

export interface DataObjectBindingParametersResult {
  ok: boolean;
  values: Record<string, DataParameterValue>;
  problems: DataBindingProblem[];
}

export function buildSaveDataObjectBindingCommand(
  snapshot: Pick<SceneSnapshot, "dataSources" | "nodes">,
  input: DataObjectBindingInput | DataObjectBinding
): DataObjectBindingCommandBuildResult {
  const validation = validateDataObjectBindingInput(snapshot, input);
  if (!validation.ok || !validation.value) {
    return { ok: false, problems: validation.problems };
  }
  return {
    ok: true,
    command: {
      type: "set-data-object-binding",
      binding: validation.value
    }
  };
}

export function buildDeleteDataObjectBindingCommand(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  objectNodeId: string
): DataObjectBindingCommandBuildResult {
  const id = typeof objectNodeId === "string" ? objectNodeId.trim() : "";
  if (!snapshot.dataSources.bindings[id]) {
    return {
      ok: false,
      problems: [{
        field: "binding",
        code: "binding-not-found",
        message: `Object ${id} does not have a data binding.`
      }]
    };
  }
  return {
    ok: true,
    command: {
      type: "delete-data-object-binding",
      objectNodeId: id
    }
  };
}

export function validateDataObjectBindingInput(
  snapshot: Pick<SceneSnapshot, "dataSources" | "nodes">,
  input: unknown
): DataObjectBindingValidationResult {
  if (!isPlainRecord(input)) {
    return {
      ok: false,
      problems: [{
        field: "binding",
        code: "binding-invalid",
        message: "A data binding must be a plain object."
      }]
    };
  }

  const problems: DataBindingProblem[] = [];
  const objectNodeId = typeof input.objectNodeId === "string" ? input.objectNodeId.trim() : "";
  if (!objectNodeId) {
    problems.push({
      field: "object",
      code: "target-not-found",
      message: "A binding must target an object node."
    });
  } else {
    const node = snapshot.nodes[objectNodeId];
    if (!node) {
      problems.push({
        field: "object",
        code: "target-not-found",
        message: `Node ${objectNodeId} does not exist.`
      });
    } else if (node.kind === "imported") {
      problems.push({
        field: "object",
        code: "target-imported",
        ownerObjectId: node.ownerObjectId,
        message: `Imported node ${objectNodeId} cannot be bound directly. Bind its owner object instead.`
      });
    } else if (node.kind !== "object") {
      problems.push({
        field: "object",
        code: "target-unsupported",
        targetKind: node.kind,
        message: `Node ${objectNodeId} is a ${node.kind} and cannot carry device data.`
      });
    }
  }

  const queryId = typeof input.queryId === "string" ? input.queryId.trim() : "";
  const query = queryId ? snapshot.dataSources.queries[queryId] ?? null : null;
  if (!query) {
    problems.push({
      field: "query",
      code: "query-not-found",
      message: queryId ? `Query ${queryId} does not exist.` : "Select a saved query for this binding."
    });
  }

  const deviceId = typeof input.deviceId === "string" ? input.deviceId : "";
  if (!deviceId.trim() || /[\u0000-\u001f\u007f]/.test(deviceId)) {
    problems.push({
      field: "device",
      code: "device-required",
      message: "Enter a device ID or choose one from the current query result."
    });
  }

  const enabled = input.enabled === undefined ? true : input.enabled;
  if (typeof enabled !== "boolean") {
    problems.push({
      field: "binding",
      code: "binding-invalid",
      message: "Binding enabled state must be a boolean."
    });
  }

  const overrides = normalizeOverrides(input.parameterOverrides, query, problems);
  const details = normalizeDetails(input.details, query, problems);

  if (query && Array.isArray(query.parameters) && problems.length === 0) {
    const resolution = resolveDataQueryParameters(query.parameters, overrides, query.connectionId);
    for (const problem of resolution.problems) {
      if (problem.code !== "parameter-missing" && problem.code !== "parameter-type") {
        problems.push({
          field: "parameters",
          code: "binding-invalid",
          message: problem.message,
          ...(problem.parameterName ? { parameterName: problem.parameterName } : {})
        });
        continue;
      }
      if (problems.some((existing) =>
        existing.code === problem.code &&
        existing.parameterName === problem.parameterName
      )) {
        continue;
      }
      problems.push({
        field: "parameters",
        code: problem.code,
        message: problem.message,
        ...(problem.parameterName ? { parameterName: problem.parameterName } : {})
      });
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    problems: [],
    value: {
      objectNodeId,
      queryId,
      parameterOverrides: overrides,
      deviceId,
      enabled: enabled as boolean,
      details
    }
  };
}

export function resolveDataObjectBindingParameters(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  binding: DataObjectBinding
): DataObjectBindingParametersResult {
  const query = snapshot.dataSources.queries[binding.queryId];
  if (!query) {
    return {
      ok: false,
      values: {},
      problems: [{
        field: "query",
        code: "query-not-found",
        message: `Query ${binding.queryId} does not exist.`
      }]
    };
  }
  const resolution = resolveDataQueryParameters(
    query.parameters,
    binding.parameterOverrides,
    query.connectionId
  );
  const problems: DataBindingProblem[] = [];
  for (const problem of resolution.problems) {
    if (problem.code !== "parameter-missing" && problem.code !== "parameter-type") {
      problems.push({
        field: "parameters",
        code: "binding-invalid",
        message: problem.message,
        ...(problem.parameterName ? { parameterName: problem.parameterName } : {})
      });
      continue;
    }
    problems.push({
      field: "parameters",
      code: problem.code,
      message: problem.message,
      ...(problem.parameterName ? { parameterName: problem.parameterName } : {})
    });
  }
  return { ok: resolution.ok, values: resolution.values, problems };
}

function normalizeOverrides(
  input: unknown,
  query: DataQuery | null,
  problems: DataBindingProblem[]
): Record<string, DataParameterValue> {
  if (input === undefined || input === null) {
    return {};
  }
  if (!isPlainRecord(input)) {
    problems.push({
      field: "parameters",
      code: "binding-invalid",
      message: "Binding parameter overrides must be a plain object."
    });
    return {};
  }

  const overrides: Record<string, DataParameterValue> = {};
  const parameters = query && Array.isArray(query.parameters) ? query.parameters : [];
  for (const [rawName, rawValue] of Object.entries(input)) {
    if (rawValue === undefined) {
      continue;
    }
    const name = rawName.trim();
    const parameter = parameters.find((candidate) =>
      isPlainRecord(candidate) && candidate.name === name
    );
    if (!name || !parameter) {
      problems.push({
        field: "parameters",
        code: "parameter-unknown",
        parameterName: name || undefined,
        message: `Parameter ${name || "(empty)"} is not defined by this query.`
      });
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, name)) {
      problems.push({
        field: "parameters",
        code: "binding-invalid",
        parameterName: name,
        message: `Parameter ${name} is overridden more than once.`
      });
      continue;
    }
    if (!isValueOfType(rawValue, parameter.type)) {
      problems.push({
        field: "parameters",
        code: "parameter-type",
        parameterName: name,
        message: `Parameter ${name} must be a ${parameter.type}.`
      });
      continue;
    }
    overrides[name] = rawValue;
  }
  return overrides;
}

function normalizeDetails(
  input: unknown,
  query: DataQuery | null,
  problems: DataBindingProblem[]
): DataBindingDetailField[] {
  if (input === undefined || input === null) {
    problems.push({
      field: "details",
      code: "detail-required",
      message: "Select at least one display field for this binding."
    });
    return [];
  }
  if (!Array.isArray(input)) {
    problems.push({
      field: "details",
      code: "detail-required",
      message: "Binding detail fields must be an array."
    });
    return [];
  }
  if (input.length === 0) {
    problems.push({
      field: "details",
      code: "detail-required",
      message: "Select at least one display field for this binding."
    });
    return [];
  }

  const details: DataBindingDetailField[] = [];
  const keys = new Set<string>();
  const properties = query && isPlainRecord(query.mapping) && Array.isArray(query.mapping.properties)
    ? query.mapping.properties
    : [];
  for (const entry of input) {
    if (!isPlainRecord(entry)) {
      problems.push({
        field: "details",
        code: "detail-unknown",
        message: "Each detail field must be a plain object."
      });
      continue;
    }
    const key = typeof entry.key === "string" ? entry.key.trim() : "";
    if (!key) {
      problems.push({
        field: "details",
        code: "detail-unknown",
        message: "A detail field must reference a mapped property key."
      });
      continue;
    }
    if (keys.has(key)) {
      problems.push({
        field: "details",
        code: "detail-duplicate",
        propertyKey: key,
        message: `Detail field ${key} is listed more than once.`
      });
      continue;
    }
    const property = properties.find((candidate) => candidate.key === key);
    if (!property) {
      problems.push({
        field: "details",
        code: "detail-unknown",
        propertyKey: key,
        message: `Detail field ${key} is not mapped by this query.`
      });
      continue;
    }

    let label: string | null = null;
    if (entry.label !== undefined && entry.label !== null && entry.label !== "") {
      if (typeof entry.label !== "string" || /[\u0000-\u001f\u007f]/.test(entry.label)) {
        problems.push({
          field: "details",
          code: "detail-unknown",
          propertyKey: key,
          message: `Detail field ${key} label is invalid.`
        });
        continue;
      }
      label = entry.label.trim() || null;
    }

    let precision: number | null = null;
    if (property.type !== "number" && entry.precision !== undefined && entry.precision !== null) {
      problems.push({
        field: "details",
        code: "detail-precision",
        propertyKey: key,
        message: `Detail field ${key} precision applies only to numeric properties.`
      });
      continue;
    }
    if (entry.precision !== undefined && entry.precision !== null) {
      if (
        typeof entry.precision !== "number" ||
        !Number.isInteger(entry.precision) ||
        entry.precision < 0 ||
        entry.precision > DATA_DETAIL_MAX_PRECISION
      ) {
        problems.push({
          field: "details",
          code: "detail-precision",
          propertyKey: key,
          message: `Detail field ${key} precision must be a whole number from 0 to ${DATA_DETAIL_MAX_PRECISION}.`
        });
        continue;
      }
      precision = entry.precision;
    }

    keys.add(key);
    details.push({ key, label, precision });
  }
  return details;
}

function isValueOfType(value: unknown, type: "string" | "number" | "boolean"): value is DataParameterValue {
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
