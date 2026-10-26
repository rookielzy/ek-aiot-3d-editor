import type { DataConnection, DataConnectionId, DataConnectionNameEntry, SceneDataSources } from "./types";

export const DEFAULT_DATA_CONNECTION_TIMEOUT_MS = 10_000;

let nextConnectionId = 0;

export function createEmptyDataSources(): SceneDataSources {
  return {
    connections: {},
    queries: {},
    bindings: {}
  };
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
