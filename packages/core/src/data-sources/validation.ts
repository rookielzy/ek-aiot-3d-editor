import type { SceneSnapshot, SceneNode } from "../snapshot/types";
import { isPlainRecord } from "../snapshot/json";
import { validateDataObjectBindingInput } from "./bindings";
import { validateDataQueryDefinition } from "./query-validation";
import type { DataConnection, DataQuery } from "./types";
import {
  DEFAULT_DATA_CONNECTION_TIMEOUT_MS,
  isDataConnectionNameTaken
} from "./defaults";
import {
  RESERVED_DATA_HEADER_NAMES,
  isValidDataHeaderName,
  reservedDataHeaderNames,
  validateDataHeaders
} from "./headers";
import type {
  DataConnectionAuth,
  DataConnectionDraft,
  DataConnectionInput,
  DataConnectionNameEntry,
  DataConnectionProblem,
  DataConnectionValidationResult
} from "./types";

/**
 * Durable references that fail to resolve. Structural defects stay in `errors`
 * (the configuration is corrupt); a missing query/connection/target object is a
 * *dangling* reference the user can repair by editing, so it is reported
 * separately and must not be mistaken for a corrupt package.
 */
export interface DataReferenceIssue {
  code: "query-missing" | "connection-missing" | "target-not-object";
  /** Human-readable message, also pushed into `errors`. */
  message: string;
}

export function validateDataSources(
  value: unknown,
  nodes: unknown,
  errors: string[],
  danglingReferences: DataReferenceIssue[] = []
): void {
  if (!isPlainRecord(value)) {
    errors.push("Snapshot dataSources must be a plain object.");
    return;
  }

  const connections = isPlainRecord(value.connections) ? value.connections : null;
  const queries = isPlainRecord(value.queries) ? value.queries : null;
  const bindings = isPlainRecord(value.bindings) ? value.bindings : null;

  if (!connections) {
    errors.push("Snapshot dataSources.connections must be a plain object map.");
  }
  if (!queries) {
    errors.push("Snapshot dataSources.queries must be a plain object map.");
  }
  if (!bindings) {
    errors.push("Snapshot dataSources.bindings must be a plain object map.");
  }

  const validConnections = new Map<string, DataConnection>();
  if (connections) {
    const existing: DataConnectionNameEntry[] = [];
    for (const [connectionId, connection] of Object.entries(connections)) {
      if (!isPlainRecord(connection)) {
        errors.push(`Data connection ${connectionId} must be a plain object.`);
        continue;
      }
      if (connection.id !== connectionId || typeof connection.id !== "string" || connection.id.length === 0) {
        errors.push(`Data connection ${connectionId} must use a matching non-empty id.`);
      }
      if (!isPlainRecord(connection.auth)) {
        errors.push(`Data connection ${connectionId} must include an auth object.`);
      }
      if (!isPlainRecord(connection.headers)) {
        errors.push(`Data connection ${connectionId} must include a headers object.`);
      }
      if (typeof connection.timeoutMs !== "number") {
        errors.push(`Data connection ${connectionId} must include a numeric timeoutMs.`);
      }
      const result = validateConnectionFields(connection, {
        existing,
        connectionId
      });
      for (const problem of result.problems) {
        errors.push(`Data connection ${connectionId} ${problem.code}: ${problem.message}`);
      }
      if (result.value) {
        validConnections.set(connectionId, { id: connectionId, ...result.value });
      }
      if (typeof connection.name === "string") {
        existing.push({ id: connectionId, name: connection.name });
      }
    }
  }

  const validQueries: Record<string, DataQuery> = {};
  if (queries) {
    const existingQueries: Pick<DataQuery, "id" | "name" | "connectionId">[] = [];
    for (const [queryId, query] of Object.entries(queries)) {
      if (!isPlainRecord(query)) {
        errors.push(`Data query ${queryId} must be a plain object.`);
        continue;
      }
      if (query.id !== queryId || typeof query.id !== "string" || query.id.length === 0) {
        errors.push(`Data query ${queryId} must use a matching non-empty id.`);
      }
      const connectionId = typeof query.connectionId === "string" ? query.connectionId : "";
      if (connectionId.length > 0 && !validConnections.has(connectionId)) {
        const message = `Data query ${queryId} connection ${connectionId} must exist in dataSources.connections.`;
        errors.push(message);
        danglingReferences.push({ code: "connection-missing", message });
      }
      const result = validateDataQueryDefinition(query, {
        queryId,
        existingQueries,
        connection: validConnections.get(connectionId) ?? null
      });
      for (const problem of result.problems) {
        errors.push(`Data query ${queryId} ${problem.code}: ${problem.message}`);
      }
      // Draft validation supplies defaults; stored queries must already contain them.
      if (result.value && !matchesNormalizedValue(query, result.value)) {
        errors.push(`Data query ${queryId} must contain normalized fields and explicit mapping defaults.`);
      }
      if (typeof query.name === "string") {
        existingQueries.push({
          id: queryId,
          name: query.name,
          connectionId
        });
      }
      if (result.value) {
        validQueries[queryId] = { id: queryId, ...result.value };
      }
    }
  }

  if (bindings) {
    const bindingNodes = isPlainRecord(nodes) ? nodes as Record<string, SceneNode> : {};
    for (const [objectNodeId, binding] of Object.entries(bindings)) {
      if (!isPlainRecord(binding)) {
        errors.push(`Data binding ${objectNodeId} must be a plain object.`);
        continue;
      }
      if (binding.objectNodeId !== objectNodeId) {
        errors.push(`Data binding ${objectNodeId} must use a matching objectNodeId.`);
      }
      const queryExists = typeof binding.queryId === "string" && Boolean(validQueries[binding.queryId]);
      if (!queryExists) {
        const message = `Data binding ${objectNodeId} query ${String(binding.queryId)} must exist in dataSources.queries.`;
        errors.push(message);
        danglingReferences.push({ code: "query-missing", message });
      }
      const node = isPlainRecord(nodes) ? nodes[objectNodeId] : undefined;
      if (!isPlainRecord(node) || node.kind !== "object") {
        const message = `Data binding ${objectNodeId} target must be an existing object node.`;
        errors.push(message);
        danglingReferences.push({ code: "target-not-object", message });
      }

      // Field validation needs the query it validates against; with a dangling
      // query its failures would only restate the missing reference.
      const result = queryExists ? validateDataObjectBindingInput({
        dataSources: {
          connections: Object.fromEntries(validConnections),
          queries: validQueries,
          bindings: {}
        },
        nodes: bindingNodes
      }, binding) : null;
      if (result) {
        for (const problem of result.problems) {
          errors.push(`Data binding ${objectNodeId} ${problem.code}: ${problem.message}`);
        }
        if (result.value && !matchesNormalizedValue(binding, result.value, true)) {
          errors.push(`Data binding ${objectNodeId} must contain normalized binding fields.`);
        }
      }
    }
  }
}

function matchesNormalizedValue(value: unknown, normalized: unknown, strict = false): boolean {
  if (value === normalized) {
    return true;
  }
  if (Array.isArray(normalized)) {
    return Array.isArray(value) && value.length === normalized.length &&
      normalized.every((entry, index) => matchesNormalizedValue(value[index], entry, strict));
  }
  if (isPlainRecord(normalized)) {
    if (!isPlainRecord(value)) {
      return false;
    }
    const normalizedKeys = Object.keys(normalized);
    if (strict && normalizedKeys.length !== Object.keys(value).length) {
      return false;
    }
    return normalizedKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(value, key) &&
      matchesNormalizedValue(value[key], normalized[key], strict)
    );
  }
  return false;
}

export function validateDataConnectionDraft(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  draft: DataConnectionInput | DataConnectionDraft,
  options: { connectionId?: string | null } = {}
): DataConnectionValidationResult {
  const existing = Object.entries(snapshot.dataSources.connections).map(([id, connection]) => ({
    id,
    name: connection.name
  }));
  const connectionId = options.connectionId ?? null;
  const result = validateConnectionFields(draft, {
    existing,
    connectionId
  });
  if (!result.value || !connectionId) {
    return result;
  }

  const reserved = reservedDataHeaderNames(result.value.auth);
  const conflicts = Object.values(snapshot.dataSources.queries)
    .filter((query) => query.connectionId === connectionId)
    .flatMap((query) => Object.keys(query.headers)
      .filter((name) => reserved.has(name.toLowerCase()))
      .map((name): DataConnectionProblem => ({
        field: "auth",
        code: "header-reserved",
        message: `Query "${query.name}" uses header "${name}", which this authentication reserves.`
      })));
  if (conflicts.length === 0) {
    return result;
  }
  return { ok: false, problems: [...result.problems, ...conflicts] };
}

function validateConnectionFields(
  input: unknown,
  context: { existing: ReadonlyArray<DataConnectionNameEntry>; connectionId?: string | null }
): DataConnectionValidationResult {
  const problems: DataConnectionProblem[] = [];
  if (!isPlainRecord(input)) {
    return {
      ok: false,
      problems: [{ field: "connection", code: "command-failed", message: "Connection must be a plain object." }]
    };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    problems.push({
      field: "name",
      code: "name-required",
      message: "Connection name is required."
    });
  } else if (isDataConnectionNameTaken(context.existing, name, { connectionId: context.connectionId })) {
    problems.push({
      field: "name",
      code: "name-duplicate",
      message: `Connection name "${name}" is already in use.`
    });
  }

  const baseUrl = validateBaseUrl(input.baseUrl, problems);
  const auth = validateAuth(input.auth, problems);
  const headers = validateHeaders(input.headers, auth, problems);
  const timeoutMs = validateTimeout(input.timeoutMs, problems);

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    problems: [],
    value: {
      name,
      baseUrl: baseUrl!,
      auth: auth!,
      headers: headers!,
      timeoutMs: timeoutMs!
    }
  };
}

function validateBaseUrl(value: unknown, problems: DataConnectionProblem[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    problems.push({ field: "baseUrl", code: "base-url-required", message: "Service URL is required." });
    return null;
  }

  const trimmed = value.trim();
  if (/[\s\u0000-\u001f\u007f]/.test(trimmed)) {
    problems.push({ field: "baseUrl", code: "base-url-invalid", message: "Service URL must not contain whitespace or control characters." });
    return null;
  }
  if (trimmed.includes("?") || trimmed.includes("#")) {
    problems.push({ field: "baseUrl", code: "base-url-query", message: "Service URL must not include a query string or fragment." });
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    problems.push({ field: "baseUrl", code: "base-url-invalid", message: "Service URL must be an absolute HTTP or HTTPS URL." });
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    problems.push({ field: "baseUrl", code: "base-url-invalid", message: "Service URL must use HTTP or HTTPS." });
    return null;
  }
  if (url.username || url.password) {
    problems.push({ field: "baseUrl", code: "base-url-credentials", message: "Service URL must not embed credentials." });
    return null;
  }
  if (!url.hostname) {
    problems.push({ field: "baseUrl", code: "base-url-invalid", message: "Service URL must include a host." });
    return null;
  }

  return trimmed.replace(/\/+$/, "");
}

function validateAuth(value: unknown, problems: DataConnectionProblem[]): DataConnectionAuth | null {
  if (value === undefined) {
    return { kind: "none" };
  }
  if (!isPlainRecord(value) || (value.kind !== "none" && value.kind !== "bearer" && value.kind !== "api-key")) {
    problems.push({
      field: "auth",
      code: "auth-invalid",
      message: "Authentication must be none, bearer, or an API key header."
    });
    return null;
  }
  const allowedKeys = value.kind === "none"
    ? ["kind"]
    : value.kind === "bearer"
      ? ["kind", "credentialRef"]
      : ["kind", "credentialRef", "headerName"];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    problems.push({
      field: "auth",
      code: "auth-invalid",
      message: "Authentication contains unsupported fields."
    });
    return null;
  }
  if (value.kind === "none") {
    return { kind: "none" };
  }

  const credentialRef = typeof value.credentialRef === "string" ? value.credentialRef.trim() : "";
  if (!credentialRef) {
    problems.push({
      field: "auth",
      code: "credential-required",
      message: value.kind === "bearer"
        ? "Bearer authentication requires a credential reference."
        : "API key authentication requires a credential reference."
    });
    return null;
  }
  if (value.kind === "bearer") {
    return { kind: "bearer", credentialRef };
  }

  const headerName = typeof value.headerName === "string" ? value.headerName.trim() : "";
  if (!headerName || !isValidDataHeaderName(headerName)) {
    problems.push({
      field: "auth",
      code: "auth-invalid",
      message: "API key authentication requires a valid header name."
    });
    return null;
  }
  if (RESERVED_DATA_HEADER_NAMES.includes(headerName.toLowerCase())) {
    problems.push({
      field: "auth",
      code: "header-reserved",
      message: `Header "${headerName}" is reserved for another authentication scheme.`
    });
    return null;
  }
  return { kind: "api-key", credentialRef, headerName };
}

function validateHeaders(
  value: unknown,
  auth: DataConnectionAuth | null,
  problems: DataConnectionProblem[]
): Record<string, string> | null {
  const result = validateDataHeaders(value, { reserved: reservedDataHeaderNames(auth) });
  for (const problem of result.problems) {
    problems.push({
      field: "headers",
      code: problem.code === "reserved" ? "header-reserved" : "headers-invalid",
      message: problem.message
    });
  }
  return result.headers;
}

function validateTimeout(value: unknown, problems: DataConnectionProblem[]): number | null {
  if (value === undefined) {
    return DEFAULT_DATA_CONNECTION_TIMEOUT_MS;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    problems.push({ field: "timeoutMs", code: "timeout-invalid", message: "Timeout must be a positive whole number of milliseconds." });
    return null;
  }
  return value;
}
