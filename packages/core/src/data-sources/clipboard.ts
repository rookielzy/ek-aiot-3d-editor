import type { SceneSnapshot } from "../snapshot/types";
import { isPlainRecord } from "../snapshot/json";
import { findObjectNodeId } from "../snapshot/nodes";
import {
  createDataConnectionId,
  createDataQueryId,
  createUniqueDataConnectionName,
  createUniqueDataQueryName
} from "./defaults";
import type {
  DataConnection,
  DataObjectBinding,
  DataQuery,
  SceneDataSources
} from "./types";

/**
 * Durable configuration carried by the node and object clipboards. Bindings are
 * keyed by source object ID for transport; paste resolves each key to the
 * pasted object node ID.
 */
export function collectClipboardDataSources(
  snapshot: Pick<SceneSnapshot, "dataSources" | "nodes">,
  objectIds: readonly string[]
): SceneDataSources {
  const bindings: Record<string, DataObjectBinding> = {};
  const queryIds = new Set<string>();
  for (const objectId of objectIds) {
    const nodeId = findObjectNodeId(snapshot, objectId);
    const binding = nodeId ? snapshot.dataSources.bindings[nodeId] : undefined;
    if (!binding) {
      continue;
    }
    bindings[objectId] = cloneJson(binding);
    queryIds.add(binding.queryId);
  }

  const queries: Record<string, DataQuery> = {};
  const connectionIds = new Set<string>();
  for (const queryId of queryIds) {
    const query = snapshot.dataSources.queries[queryId];
    if (!query) {
      continue;
    }
    queries[queryId] = cloneJson(query);
    connectionIds.add(query.connectionId);
  }

  const connections: Record<string, DataConnection> = {};
  for (const connectionId of connectionIds) {
    const connection = snapshot.dataSources.connections[connectionId];
    if (connection) {
      connections[connectionId] = cloneJson(connection);
    }
  }

  return { connections, queries, bindings };
}

/**
 * Merge a clipboard fragment into the target data sources. Identical ids reuse
 * the target definition; conflicting ids receive fresh ids and unique names.
 * Binding keys are remapped onto the pasted object node ids.
 */
export function applyClipboardDataSources(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  fragment: SceneDataSources,
  objectNodeIdMap: Record<string, string>
): SceneDataSources {
  const connections = { ...snapshot.dataSources.connections };
  const queries = { ...snapshot.dataSources.queries };
  const bindings = { ...snapshot.dataSources.bindings };
  const connectionIdMap = new Map<string, string>();
  const queryIdMap = new Map<string, string>();

  for (const sourceId of Object.keys(fragment.connections).sort()) {
    assertSafeId(sourceId, "connection");
    const source = fragment.connections[sourceId];
    if (!isPlainRecord(source)) {
      throw new Error(`Clipboard connection ${sourceId} is invalid.`);
    }
    const existing = connections[sourceId];
    if (existing && structuresEqual(existing, source)) {
      connectionIdMap.set(sourceId, sourceId);
      continue;
    }
    const id = existing ? createDataConnectionId(connections) : sourceId;
    const name = uniqueConnectionName(connections, source.name);
    connections[id] = { ...cloneJson(source), id, name };
    connectionIdMap.set(sourceId, id);
  }

  for (const sourceId of Object.keys(fragment.queries).sort()) {
    assertSafeId(sourceId, "query");
    const source = fragment.queries[sourceId];
    if (!isPlainRecord(source)) {
      throw new Error(`Clipboard query ${sourceId} is invalid.`);
    }
    const connectionId = connectionIdMap.get(source.connectionId);
    if (!connectionId) {
      throw new Error(`Clipboard query ${sourceId} references an unknown connection.`);
    }
    const candidate: DataQuery = { ...cloneJson(source), connectionId };
    const existing = queries[sourceId];
    if (existing && structuresEqual(existing, candidate)) {
      queryIdMap.set(sourceId, sourceId);
      continue;
    }
    const id = existing ? createDataQueryId(queries) : sourceId;
    const name = createUniqueDataQueryName(
      Object.values(queries),
      connectionId,
      candidate.name
    );
    queries[id] = { ...candidate, id, name };
    queryIdMap.set(sourceId, id);
  }

  for (const [sourceObjectNodeId, binding] of Object.entries(fragment.bindings)) {
    assertSafeId(sourceObjectNodeId, "binding");
    const objectNodeId = objectNodeIdMap[sourceObjectNodeId];
    if (!objectNodeId) {
      continue;
    }
    const queryId = queryIdMap.get(binding.queryId);
    if (!queryId) {
      throw new Error(`Clipboard binding ${sourceObjectNodeId} references an unknown query.`);
    }
    bindings[objectNodeId] = {
      ...cloneJson(binding),
      objectNodeId,
      queryId
    };
  }

  return { connections, queries, bindings };
}

function uniqueConnectionName(
  connections: Record<string, DataConnection>,
  desiredName: string
): string {
  return createUniqueDataConnectionName(
    Object.values(connections).map((connection) => connection.name),
    desiredName
  );
}

function structuresEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => structuresEqual(entry, right[index]));
  }
  if (isPlainRecord(left) && isPlainRecord(right)) {
    const leftKeys = Object.keys(left);
    if (leftKeys.length !== Object.keys(right).length) {
      return false;
    }
    return leftKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      structuresEqual(left[key], right[key])
    );
  }
  return false;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertSafeId(id: string, kind: "connection" | "query" | "binding"): void {
  if (!id || id === "__proto__" || id === "constructor" || id === "prototype") {
    throw new Error(`Clipboard ${kind} id is invalid.`);
  }
}
