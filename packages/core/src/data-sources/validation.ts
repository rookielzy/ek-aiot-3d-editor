import type { SceneSnapshot } from "../snapshot/types";
import { isPlainRecord } from "../snapshot/json";
import { validateDataQueryDefinition } from "./query-validation";
import type { DataConnection, DataQuery } from "./types";
import {
  DEFAULT_DATA_CONNECTION_TIMEOUT_MS,
  isDataConnectionNameTaken
} from "./defaults";
import type {
  DataConnectionAuth,
  DataConnectionDraft,
  DataConnectionInput,
  DataConnectionNameEntry,
  DataConnectionProblem,
  DataConnectionValidationResult
} from "./types";

const RESERVED_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie"
]);
const UNSAFE_HEADER_NAMES = new Set(["__proto__", "constructor", "prototype"]);
const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function validateDataSources(value: unknown, nodes: unknown, errors: string[]): void {
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
      if (typeof connection.name === "string") {
        existing.push({ id: connectionId, name: connection.name });
      }
    }
  }

  const knownQueries = new Set<string>();
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
      const connection = connections && connectionId ? connections[connectionId] : undefined;
      const result = validateDataQueryDefinition(query, {
        queryId,
        existingQueries,
        connection: isPlainRecord(connection) ? connection as unknown as DataConnection : null
      });
      for (const problem of result.problems) {
        errors.push(`Data query ${queryId} ${problem.code}: ${problem.message}`);
      }
      if (typeof query.name === "string") {
        existingQueries.push({
          id: queryId,
          name: query.name,
          connectionId
        });
      }
      knownQueries.add(queryId);
    }
  }

  if (bindings) {
    for (const [objectNodeId, binding] of Object.entries(bindings)) {
      if (!isPlainRecord(binding)) {
        errors.push(`Data binding ${objectNodeId} must be a plain object.`);
        continue;
      }
      if (binding.objectNodeId !== objectNodeId) {
        errors.push(`Data binding ${objectNodeId} must use a matching objectNodeId.`);
      }
      if (typeof binding.queryId !== "string" || !knownQueries.has(binding.queryId)) {
        errors.push(`Data binding ${objectNodeId} query ${String(binding.queryId)} must exist in dataSources.queries.`);
      }
      const node = isPlainRecord(nodes) ? nodes[objectNodeId] : undefined;
      if (!isPlainRecord(node) || node.kind !== "object") {
        errors.push(`Data binding ${objectNodeId} target must be an existing object node.`);
      }
    }
  }
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
  return validateConnectionFields(draft, {
    existing,
    connectionId: options.connectionId ?? null
  });
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
  const headers = validateHeaders(input.headers, problems);
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
  if (!isPlainRecord(value) || (value.kind !== "none" && value.kind !== "bearer")) {
    problems.push({ field: "auth", code: "auth-invalid", message: "Authentication must be none or bearer." });
    return null;
  }
  if (Object.keys(value).some((key) => key !== "kind" && (value.kind !== "bearer" || key !== "credentialRef"))) {
    problems.push({ field: "auth", code: "auth-invalid", message: "Authentication must contain only its kind and credential reference." });
    return null;
  }
  if (value.kind === "none") {
    return { kind: "none" };
  }

  const credentialRef = typeof value.credentialRef === "string" ? value.credentialRef.trim() : "";
  if (!credentialRef) {
    problems.push({ field: "auth", code: "credential-required", message: "Bearer authentication requires a credential reference." });
    return null;
  }
  return { kind: "bearer", credentialRef };
}

function validateHeaders(value: unknown, problems: DataConnectionProblem[]): Record<string, string> | null {
  if (value === undefined) {
    return {};
  }
  if (!isPlainRecord(value)) {
    problems.push({ field: "headers", code: "headers-invalid", message: "Connection headers must be a plain object." });
    return null;
  }

  const headers: Record<string, string> = {};
  let valid = true;
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = rawName.trim();
    if (!name || name !== rawName || !HTTP_TOKEN.test(name) || UNSAFE_HEADER_NAMES.has(name.toLowerCase())) {
      problems.push({ field: "headers", code: "headers-invalid", message: `Header name "${rawName}" is invalid.` });
      valid = false;
      continue;
    }
    if (RESERVED_HEADER_NAMES.has(name.toLowerCase())) {
      problems.push({ field: "headers", code: "header-reserved", message: `Header "${rawName}" is reserved for authentication.` });
      valid = false;
      continue;
    }
    if (typeof rawValue !== "string" || /[\r\n\u0000-\u001f\u007f]/.test(rawValue)) {
      problems.push({ field: "headers", code: "headers-invalid", message: `Header "${rawName}" must have a safe string value.` });
      valid = false;
      continue;
    }
    headers[name] = rawValue;
  }

  return valid ? headers : null;
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
