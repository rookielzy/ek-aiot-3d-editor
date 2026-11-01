import type {
  DataConnection,
  DataConnectionId,
  DataConnectionNameEntry,
  DataQuery,
  DataQueryId,
  DataQueryUpdatePolicy,
  SceneDataSources
} from "./types";

export const DEFAULT_DATA_CONNECTION_TIMEOUT_MS = 10_000;
export const MIN_DATA_QUERY_REFRESH_INTERVAL_MS = 1_000;
export const DEFAULT_DATA_QUERY_REFRESH_INTERVAL_MS = 5_000;
export const DEFAULT_DATA_QUERY_MAX_AGE_MS = 15_000;
export const MAX_DATA_QUERY_RETRY_BACKOFF_MS = 60_000;
export const DEFAULT_DATA_MAX_RESPONSE_BYTES = 1_048_576;
export const DEFAULT_API_KEY_HEADER_NAME = "X-API-Key";

export function createDefaultDataQueryUpdatePolicy(): DataQueryUpdatePolicy {
  return {
    refreshIntervalMs: DEFAULT_DATA_QUERY_REFRESH_INTERVAL_MS,
    maxAgeMs: DEFAULT_DATA_QUERY_MAX_AGE_MS
  };
}

let nextConnectionId = 0;
let nextQueryId = 0;

export function createEmptyDataSources(): SceneDataSources {
  return {
    connections: {},
    queries: {},
    bindings: {}
  };
}

export function createDataQueryId(existing: Record<string, DataQuery> = {}): DataQueryId {
  let candidate: string;
  do {
    nextQueryId += 1;
    candidate = `query-${nextQueryId.toString(36)}`;
  } while (existing[candidate]);
  return candidate;
}

export function createUniqueDataQueryName(
  existing: readonly DataQuery[],
  connectionId: DataConnectionId,
  desiredName: string
): string {
  return createUniqueName(
    existing
      .filter((query) => query.connectionId === connectionId)
      .map((query) => query.name),
    desiredName
  );
}

export function createDataConnectionId(existing: Record<string, DataConnection> = {}): DataConnectionId {
  let candidate: string;
  do {
    nextConnectionId += 1;
    candidate = `connection-${nextConnectionId.toString(36)}`;
  } while (existing[candidate]);
  return candidate;
}

export function isDataConnectionNameTaken(
  existing: readonly DataConnectionNameEntry[],
  name: string,
  options: { connectionId?: string | null } = {}
): boolean {
  const normalized = normalizeDataConnectionName(name);
  return existing.some((connection) =>
    connection.id !== options.connectionId &&
    normalizeDataConnectionName(connection.name) === normalized
  );
}

export function createUniqueDataConnectionName(existingNames: readonly string[], desiredName: string): string {
  return createUniqueName(existingNames, desiredName);
}

function createUniqueName(existingNames: readonly string[], desiredName: string): string {
  const desired = desiredName.trim();
  const taken = new Set(existingNames.map(normalizeDataConnectionName));
  if (!taken.has(normalizeDataConnectionName(desired))) {
    return desired;
  }

  let index = 2;
  let candidate = `${desired} ${index}`;
  while (taken.has(normalizeDataConnectionName(candidate))) {
    index += 1;
    candidate = `${desired} ${index}`;
  }
  return candidate;
}

export function normalizeDataConnectionName(name: string): string {
  return name.trim().toLowerCase();
}
