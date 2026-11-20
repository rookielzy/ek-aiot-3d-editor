import type { JsonValue } from "../snapshot/json";
import { isPlainRecord } from "../snapshot/json";
import type { SceneSnapshot } from "../snapshot/types";
import { findDataHeaderName, mergeDataHeaders, reservedDataHeaderNames, validateDataHeaders } from "./headers";
import { isValidDataPath } from "./path";
import type {
  DataConnection,
  DataConnectionId,
  DataParameterLocation,
  DataParameterType,
  DataParameterValue,
  DataPathPrimitive,
  DataQueryMethod,
  DataQueryParameterDraft,
  DataQueryParameterOverrides,
  DataSuccessCondition
} from "./types";

export type {
  DataParameterType,
  DataParameterValue,
  DataQueryParameterDraft,
  DataQueryParameterOverrides
} from "./types";

export interface DataQueryDraft {
  connectionId: DataConnectionId;
  method?: DataQueryMethod;
  readOnly?: boolean;
  path: string;
  headers?: Readonly<Record<string, string>>;
  parameters: readonly DataQueryParameterDraft[];
  successCondition?: DataSuccessCondition | null;
}

export interface BuildDataQueryRequestOptions {
  overrides?: DataQueryParameterOverrides;
}

/** Resolved auth description for the host executor; never contains secrets. */
export type DataRequestAuth =
  | { kind: "none" }
  | { kind: "bearer"; credentialRef: string }
  | { kind: "api-key"; credentialRef: string; headerName: string };

export interface DataRequestSummary {
  method: DataQueryMethod;
  readOnly: boolean;
  url: string;
  headers: Readonly<Record<string, string>>;
  body: JsonValue | null;
  auth: DataRequestAuth;
  credentialRef: string | null;
  timeoutMs: number;
  parameters: Readonly<Record<string, DataParameterValue>>;
  successCondition: DataSuccessCondition | null;
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
  | "header-invalid"
  | "header-reserved"
  | "method-invalid"
  | "parameter-definition-invalid"
  | "parameter-duplicate"
  | "parameter-location-invalid"
  | "parameter-missing"
  | "parameter-type"
  | "path-absolute"
  | "path-invalid"
  | "path-parameter-missing"
  | "path-protocol-relative"
  | "path-required"
  | "path-traversal"
  | "post-read-only-required"
  | "request-aborted"
  | "request-failed"
  | "request-timeout"
  | "response-auth"
  | "response-business"
  | "response-device-contract"
  | "response-http"
  | "response-invalid"
  | "response-json-invalid"
  | "response-not-json"
  | "response-too-large"
  | "service-disposed"
  | "success-condition-invalid";

export interface DataQueryProblem {
  code: DataQueryProblemCode;
  field: DataQueryProblemField;
  connectionId: string | null;
  message: string;
  parameterName?: string;
  status?: number;
  credentialRef?: string;
  responsePath?: string;
}

export type BuildDataQueryRequestResult =
  | { ok: true; summary: DataRequestSummary }
  | { ok: false; problems: DataQueryProblem[] };

/** @deprecated Use BuildDataQueryRequestOptions. */
export type BuildDataGetRequestOptions = BuildDataQueryRequestOptions;

/** @deprecated Use BuildDataQueryRequestResult. */
export type BuildDataGetRequestResult = BuildDataQueryRequestResult;

export interface ResolveDataQueryParametersResult {
  ok: boolean;
  values: Record<string, DataParameterValue>;
  problems: DataQueryProblem[];
}

const PARAMETER_NAME = /^[A-Za-z0-9_.-]+$/;
const PATH_PARAMETER = /\{([A-Za-z0-9_.-]+)\}/g;
const UNSAFE_PARAMETER_NAMES = new Set(["__proto__", "constructor", "prototype"]);
const SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const PARAMETER_LOCATIONS = new Set<DataParameterLocation | "auto">(["auto", "path", "query", "body"]);

export function buildDataQueryRequest(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  draft: DataQueryDraft,
  options: BuildDataQueryRequestOptions = {}
): BuildDataQueryRequestResult {
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

  const method = draft.method ?? "GET";
  if (method !== "GET" && method !== "POST") {
    return {
      ok: false,
      problems: [{
        code: "method-invalid",
        field: "request",
        connectionId: connection.id,
        message: "A data query method must be GET or POST."
      }]
    };
  }
  if (method === "POST" && draft.readOnly !== true) {
    return {
      ok: false,
      problems: [{
        code: "post-read-only-required",
        field: "request",
        connectionId: connection.id,
        message: "A POST query must be explicitly confirmed as read-only before execution."
      }]
    };
  }

  const resolution = resolveDataQueryParameters(draft.parameters, options.overrides, connection.id);
  if (!resolution.ok) {
    return { ok: false, problems: resolution.problems };
  }

  const path = typeof draft.path === "string" ? draft.path.trim() : "";
  const locationResolution = resolveDataParameterLocations(draft.parameters, method, path, connection.id);
  if (!locationResolution.ok) {
    return { ok: false, problems: locationResolution.problems };
  }
  const locations = locationResolution.locations;
  const requestProblems: DataQueryProblem[] = [];

  const successCondition = validateDataSuccessCondition(draft.successCondition, connection.id);
  if (successCondition.problem) {
    requestProblems.push(successCondition.problem);
  }

  const body = buildRequestBody(method, draft.parameters, locations, resolution.values);
  const headers = buildRequestHeaders(
    connection,
    draft.headers,
    method,
    body !== null
  );
  if (headers.problems.length > 0 || headers.headers === null) {
    return { ok: false, problems: [...requestProblems, ...headers.problems] };
  }
  if (requestProblems.length > 0) {
    return { ok: false, problems: requestProblems };
  }

  const built = buildRequestUrl(connection, path, resolution.values, locations);
  if (!built.ok) {
    return built;
  }

  return {
    ok: true,
    summary: Object.freeze({
      method,
      readOnly: true,
      url: built.url,
      headers: Object.freeze(headers.headers),
      body,
      auth: requestAuth(connection),
      credentialRef: connectionCredentialRef(connection),
      timeoutMs: connection.timeoutMs,
      parameters: Object.freeze({ ...resolution.values }),
      successCondition: successCondition.condition
    })
  };
}

/** @deprecated Use buildDataQueryRequest. */
export function buildDataGetRequest(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  draft: DataQueryDraft,
  options: BuildDataGetRequestOptions = {}
): BuildDataGetRequestResult {
  return buildDataQueryRequest(snapshot, draft, options);
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
      parameter.location !== undefined &&
      !PARAMETER_LOCATIONS.has(parameter.location as DataParameterLocation | "auto")
    ) {
      problems.push({
        code: "parameter-location-invalid",
        field: "parameters",
        connectionId,
        parameterName: name,
        message: `Parameter ${name} has an unsupported location.`
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

export interface ResolveDataParameterLocationsResult {
  ok: boolean;
  locations: Record<string, DataParameterLocation>;
  problems: DataQueryProblem[];
}

/** Resolves `auto` placements and checks that declared locations fit the path. */
export function resolveDataParameterLocations(
  parameters: readonly DataQueryParameterDraft[],
  method: DataQueryMethod,
  rawPath: string,
  connectionId: string | null
): ResolveDataParameterLocationsResult {
  const path = typeof rawPath === "string" ? rawPath.trim() : "";
  const placeholders = collectPathPlaceholders(path);
  const locations: Record<string, DataParameterLocation> = {};
  const problems: DataQueryProblem[] = [];
  for (const parameter of parameters) {
    const name = parameter.name.trim();
    const location = resolveParameterLocation(parameter, method, placeholders);
    locations[name] = location;
    if (location === "body" && method !== "POST") {
      problems.push({
        code: "parameter-location-invalid",
        field: "parameters",
        connectionId,
        parameterName: name,
        message: `Parameter ${name} uses the body, but only POST queries send a JSON body.`
      });
      continue;
    }
    if (location === "path" && !placeholders.has(name)) {
      problems.push({
        code: "parameter-location-invalid",
        field: "parameters",
        connectionId,
        parameterName: name,
        message: `Parameter ${name} is marked as a path parameter but the path has no {${name}} placeholder.`
      });
      continue;
    }
    if (location !== "path" && placeholders.has(name)) {
      problems.push({
        code: "parameter-location-invalid",
        field: "parameters",
        connectionId,
        parameterName: name,
        message: `Parameter ${name} is used in the path and must use the path location.`
      });
    }
  }
  return { ok: problems.length === 0, locations, problems };
}

function collectPathPlaceholders(path: string): Set<string> {
  const names = new Set<string>();
  for (const match of path.matchAll(PATH_PARAMETER)) {
    names.add(match[1]);
  }
  return names;
}

function resolveParameterLocation(
  parameter: DataQueryParameterDraft,
  method: DataQueryMethod,
  placeholders: ReadonlySet<string>
): DataParameterLocation {
  const name = parameter.name.trim();
  const declared = parameter.location ?? "auto";
  if (declared !== "auto") {
    return declared;
  }
  if (placeholders.has(name)) {
    return "path";
  }
  return method === "POST" ? "body" : "query";
}

function buildRequestBody(
  method: DataQueryMethod,
  parameters: readonly DataQueryParameterDraft[],
  locations: Readonly<Record<string, DataParameterLocation>>,
  values: Readonly<Record<string, DataParameterValue>>
): JsonValue | null {
  if (method !== "POST") {
    return null;
  }
  const entries = parameters
    .filter((parameter) => locations[parameter.name.trim()] === "body")
    .map((parameter) => [parameter.name.trim(), values[parameter.name.trim()]] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function buildRequestHeaders(
  connection: DataConnection,
  queryHeaders: Readonly<Record<string, string>> | undefined,
  method: DataQueryMethod,
  hasBody: boolean
): { headers: Record<string, string> | null; problems: DataQueryProblem[] } {
  const reserved = reservedDataHeaderNames(connection.auth);
  const connectionHeaders = validateDataHeaders(connection.headers, { reserved });
  const draftHeaders = validateDataHeaders(queryHeaders ?? {}, { reserved });
  const problems = [...connectionHeaders.problems, ...draftHeaders.problems].map((problem): DataQueryProblem => ({
    code: problem.code === "reserved" ? "header-reserved" : "header-invalid",
    field: "request",
    connectionId: connection.id,
    message: problem.message
  }));
  if (problems.length > 0) {
    return { headers: null, problems };
  }

  const headers = mergeDataHeaders(connectionHeaders.headers!, draftHeaders.headers!);
  if (method === "POST" && hasBody && !findDataHeaderName(headers, "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  return { headers, problems: [] };
}

export function validateDataSuccessCondition(
  value: unknown,
  connectionId: string
): { condition: DataSuccessCondition | null; problem: DataQueryProblem | null } {
  if (value === undefined || value === null) {
    return { condition: null, problem: null };
  }
  if (
    !isPlainRecord(value) ||
    Object.keys(value).some((key) => key !== "path" && key !== "equals") ||
    !isValidDataPath(value.path) ||
    !isJsonScalar(value.equals)
  ) {
    return {
      condition: null,
      problem: {
        code: "success-condition-invalid",
        field: "request",
        connectionId,
        message: "A business success condition requires a non-empty field path and a JSON scalar value."
      }
    };
  }
  return {
    condition: { path: value.path, equals: value.equals },
    problem: null
  };
}

function isJsonScalar(value: unknown): value is DataPathPrimitive {
  return value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
}

function requestAuth(connection: DataConnection): DataRequestAuth {
  switch (connection.auth.kind) {
    case "bearer":
      return { kind: "bearer", credentialRef: connection.auth.credentialRef };
    case "api-key":
      return {
        kind: "api-key",
        credentialRef: connection.auth.credentialRef,
        headerName: connection.auth.headerName
      };
    default:
      return { kind: "none" };
  }
}

function connectionCredentialRef(connection: DataConnection): string | null {
  return connection.auth.kind === "none" ? null : connection.auth.credentialRef;
}

function buildRequestUrl(
  connection: DataConnection,
  rawPath: string,
  values: Readonly<Record<string, DataParameterValue>>,
  locations: Readonly<Record<string, DataParameterLocation>>
): { ok: true; url: string } | { ok: false; problems: DataQueryProblem[] } {
  const path = typeof rawPath === "string" ? rawPath.trim() : "";
  const problem = (
    code:
      | "path-required"
      | "path-absolute"
      | "path-protocol-relative"
      | "path-traversal"
      | "path-invalid"
      | "path-parameter-missing"
      | "parameter-location-invalid",
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
    let misplacedParameter: string | null = null;
    const replaced = segment.replace(PATH_PARAMETER, (_match, name: string) => {
      if (!Object.prototype.hasOwnProperty.call(values, name) || locations[name] === undefined) {
        missingParameter = name;
        return _match;
      }
      if (locations[name] !== "path") {
        misplacedParameter = name;
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
    if (misplacedParameter) {
      return {
        ok: false,
        problems: [problem(
          "parameter-location-invalid",
          `Path parameter ${misplacedParameter} must use the path location.`,
          misplacedParameter
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
  for (const [name, location] of Object.entries(locations)) {
    if (location === "path" && !usedParameters.has(name)) {
      return {
        ok: false,
        problems: [problem(
          "parameter-location-invalid",
          `Parameter ${name} is marked as a path parameter but the path has no {${name}} placeholder.`,
          name
        )]
      };
    }
    if (location === "query" && Object.prototype.hasOwnProperty.call(values, name)) {
      search.append(name, String(values[name]));
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
