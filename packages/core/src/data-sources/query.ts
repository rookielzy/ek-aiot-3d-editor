import type { SceneSnapshot } from "../snapshot/types";
import { isPlainRecord } from "../snapshot/json";
import type {
  DataConnection,
  DataConnectionId,
  DataParameterType,
  DataParameterValue,
  DataQueryParameterDraft,
  DataQueryParameterOverrides
} from "./types";

export type {
  DataParameterType,
  DataParameterValue,
  DataQueryParameterDraft,
  DataQueryParameterOverrides
} from "./types";

export interface DataQueryDraft {
  connectionId: DataConnectionId;
  path: string;
  parameters: readonly DataQueryParameterDraft[];
}

export interface BuildDataGetRequestOptions {
  overrides?: DataQueryParameterOverrides;
}

export interface DataRequestSummary {
  method: "GET";
  url: string;
  headers: Readonly<Record<string, string>>;
  credentialRef: string | null;
  timeoutMs: number;
  parameters: Readonly<Record<string, DataParameterValue>>;
}

export type DataQueryProblemField =
  | "connection"
  | "credential"
  | "executor"
  | "parameters"
  | "path"
  | "request"
  | "response";

export type DataQueryProblemCode =
  | "connection-not-found"
  | "credential-unavailable"
  | "executor-unavailable"
  | "parameter-definition-invalid"
  | "parameter-duplicate"
  | "parameter-missing"
  | "parameter-type"
  | "path-absolute"
  | "path-invalid"
  | "path-parameter-missing"
  | "path-protocol-relative"
  | "path-required"
  | "path-traversal"
  | "request-aborted"
  | "request-failed"
  | "request-timeout"
  | "response-http"
  | "response-invalid"
  | "response-json-invalid"
  | "service-disposed";

export interface DataQueryProblem {
  code: DataQueryProblemCode;
  field: DataQueryProblemField;
  connectionId: string | null;
  message: string;
  parameterName?: string;
  status?: number;
  credentialRef?: string;
}

export type BuildDataGetRequestResult =
  | { ok: true; summary: DataRequestSummary }
  | { ok: false; problems: DataQueryProblem[] };

export interface ResolveDataQueryParametersResult {
  ok: boolean;
  values: Record<string, DataParameterValue>;
  problems: DataQueryProblem[];
}

const PARAMETER_NAME = /^[A-Za-z0-9_.-]+$/;
const PATH_PARAMETER = /\{([A-Za-z0-9_.-]+)\}/g;
const UNSAFE_PARAMETER_NAMES = new Set(["__proto__", "constructor", "prototype"]);
const SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;

export function buildDataGetRequest(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  draft: DataQueryDraft,
  options: BuildDataGetRequestOptions = {}
): BuildDataGetRequestResult {
  const connection = snapshot.dataSources.connections[draft.connectionId];
  if (!connection) {
    return {
      ok: false,
      problems: [{
        code: "connection-not-found",
        field: "connection",
        connectionId: draft.connectionId,
        message: `Data connection ${draft.connectionId} does not exist.`
      }]
    };
  }

  const resolution = resolveDataQueryParameters(draft.parameters, options.overrides, connection.id);  if (!resolution.ok) {
    return { ok: false, problems: resolution.problems };
  }

  const built = buildRequestUrl(connection, draft.path, resolution.values);
  if (!built.ok) {
    return built;
  }

  const headers: Record<string, string> = { ...connection.headers };
  return {
    ok: true,
    summary: Object.freeze({
      method: "GET",
      url: built.url,
      headers: Object.freeze(headers),
      credentialRef: connection.auth.kind === "bearer" ? connection.auth.credentialRef : null,
      timeoutMs: connection.timeoutMs,
      parameters: Object.freeze({ ...resolution.values })
    })
  };
}

export function resolveDataQueryParameters(
  parameters: readonly DataQueryParameterDraft[],
  overrides: DataQueryParameterOverrides = {},
  connectionId: string | null = null
): ResolveDataQueryParametersResult {
  const definitionProblems = validateDataQueryParameterDefinitions(parameters, connectionId);
  if (definitionProblems.length > 0) {
    return { ok: false, values: {}, problems: definitionProblems };
  }

  const values: Record<string, DataParameterValue> = {};
  const problems: DataQueryProblem[] = [];
  for (const parameter of parameters) {
    const name = parameter.name.trim();
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, name) &&
      overrides[name] !== null &&
      overrides[name] !== undefined;
    const value = hasOverride
      ? overrides[name]
      : Object.prototype.hasOwnProperty.call(parameter, "defaultValue")
        ? parameter.defaultValue
        : undefined;

    if (value === undefined) {
      problems.push({
        code: "parameter-missing",
        field: "parameters",
        connectionId,
        parameterName: name,
        message: `Parameter ${name} requires a value.`
      });
      continue;
    }
    if (!isParameterValueOfType(value, parameter.type)) {
      problems.push({
        code: "parameter-type",
        field: "parameters",
        connectionId,
        parameterName: name,
        message: `Parameter ${name} must be a ${parameter.type}.`
      });
      continue;
    }
    values[name] = value;
  }

  return { ok: problems.length === 0, values, problems };
}

export function validateDataQueryParameterDefinitions(
  parameters: readonly DataQueryParameterDraft[] | unknown,
  connectionId: string | null
): DataQueryProblem[] {
  if (!Array.isArray(parameters)) {
    return [{
      code: "parameter-definition-invalid",
      field: "parameters",
      connectionId,
      message: "Query parameters must be an array."
    }];
  }

  const problems: DataQueryProblem[] = [];
  const names = new Set<string>();
  for (const parameter of parameters) {
    if (!isPlainRecord(parameter)) {
      problems.push({
        code: "parameter-definition-invalid",
        field: "parameters",
        connectionId,
        message: "Each parameter must be a plain object."
      });
      continue;
    }
    const name = typeof parameter.name === "string" ? parameter.name.trim() : "";
    if (!name || !PARAMETER_NAME.test(name) || UNSAFE_PARAMETER_NAMES.has(name)) {
      problems.push({
        code: "parameter-definition-invalid",
        field: "parameters",
        connectionId,
        parameterName: name || undefined,
        message: `Parameter name "${name}" is invalid.`
      });
      continue;
    }
    if (names.has(name)) {
      problems.push({
        code: "parameter-duplicate",
        field: "parameters",
        connectionId,
        parameterName: name,
        message: `Parameter ${name} is defined more than once.`
      });
      continue;
    }
    names.add(name);

    if (parameter.type !== "string" && parameter.type !== "number" && parameter.type !== "boolean") {
      problems.push({
        code: "parameter-definition-invalid",
        field: "parameters",
        connectionId,
        parameterName: name,
        message: `Parameter ${name} has an unsupported type.`
      });
      continue;
    }
    if (
      Object.prototype.hasOwnProperty.call(parameter, "defaultValue") &&
      parameter.defaultValue !== undefined &&
      !isParameterValueOfType(parameter.defaultValue, parameter.type)
    ) {
      problems.push({
        code: "parameter-type",
        field: "parameters",
        connectionId,
        parameterName: name,
        message: `Parameter ${name} default must be a ${parameter.type}.`
      });
    }
  }
  return problems;
}

function buildRequestUrl(
  connection: DataConnection,
  rawPath: string,
  values: Readonly<Record<string, DataParameterValue>>
): { ok: true; url: string } | { ok: false; problems: DataQueryProblem[] } {
  const path = typeof rawPath === "string" ? rawPath.trim() : "";
  const problem = (
    code:
      | "path-required"
      | "path-absolute"
      | "path-protocol-relative"
      | "path-traversal"
      | "path-invalid"
      | "path-parameter-missing",
    message: string,
    parameterName?: string
  ): DataQueryProblem => ({
    code,
    field: "path",
    connectionId: connection.id,
    message,
    ...(parameterName ? { parameterName } : {})
  });

  if (!path) {
    return { ok: false, problems: [problem("path-required", "A relative request path is required.")] };
  }
  if (path.startsWith("//") || path.startsWith("\\\\")) {
    return { ok: false, problems: [problem("path-protocol-relative", "Protocol-relative request paths are not allowed.")] };
  }
  if (SCHEME_PATTERN.test(path)) {
    return { ok: false, problems: [problem("path-absolute", "Absolute request URLs are not allowed.")] };
  }
  if (path.includes("?") || path.includes("#") || path.includes("\\") || /[\s\u0000-\u001f\u007f]/.test(path)) {
    return { ok: false, problems: [problem("path-invalid", "The request path contains unsupported characters.")] };
  }

  const segments = path.replace(/^\/+/, "").split("/");
  const usedParameters = new Set<string>();
  const builtSegments: string[] = [];
  for (const segment of segments) {
    const segmentProblem = validateLiteralSegment(segment, connection.id);
    if (segmentProblem) {
      return { ok: false, problems: [segmentProblem] };
    }

    let missingParameter: string | null = null;
    const replaced = segment.replace(PATH_PARAMETER, (_match, name: string) => {
      if (!Object.prototype.hasOwnProperty.call(values, name)) {
        missingParameter = name;
        return _match;
      }
      usedParameters.add(name);
      return encodeURIComponent(String(values[name]));
    });
    if (missingParameter) {
      return {
        ok: false,
        problems: [problem(
          "path-parameter-missing",
          `Path parameter ${missingParameter} is not defined.`,
          missingParameter
        )]
      };
    }
    if (/[{}]/.test(replaced)) {
      return { ok: false, problems: [problem("path-invalid", "The request path contains an invalid parameter placeholder.")] };
    }
    // URL parsing normalizes both literal and percent-encoded dot segments.
    if (/^(?:\.|%2e){1,2}$/i.test(replaced)) {
      return { ok: false, problems: [problem("path-traversal", "The request path must not contain dot segments.")] };
    }
    builtSegments.push(replaced);
  }

  let url: URL;
  let base: URL;
  try {
    base = new URL(connection.baseUrl);
    const basePath = base.pathname.replace(/\/+$/, "");
    url = new URL(`${base.origin}${basePath}/${builtSegments.join("/")}`);
    if (url.origin !== base.origin || !url.pathname.startsWith(`${basePath}/`)) {
      return { ok: false, problems: [problem("path-traversal", "The request path must stay under the service prefix.")] };
    }
  } catch {
    return { ok: false, problems: [problem("path-invalid", "The request path cannot be resolved against the service URL.")] };
  }

  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    if (!usedParameters.has(name)) {
      search.append(name, String(value));
    }
  }
  if ([...search].length > 0) {
    url.search = search.toString();
  }

  return { ok: true, url: url.toString() };
}

function validateLiteralSegment(segment: string, connectionId: string): DataQueryProblem | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return {
      code: "path-invalid",
      field: "path",
      connectionId,
      message: "The request path contains invalid percent encoding."
    };
  }
  if (decoded === "." || decoded === "..") {
    return {
      code: "path-traversal",
      field: "path",
      connectionId,
      message: "The request path must stay under the service prefix."
    };
  }
  if (/[/\\?#]/.test(decoded) || /[\u0000-\u001f\u007f]/.test(decoded)) {
    return {
      code: "path-invalid",
      field: "path",
      connectionId,
      message: "The request path segment contains unsupported characters."
    };
  }
  return null;
}

function isParameterValueOfType(value: unknown, type: DataParameterType): value is DataParameterValue {
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
