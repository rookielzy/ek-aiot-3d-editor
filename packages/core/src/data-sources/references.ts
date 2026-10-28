import type { SceneSnapshot } from "../snapshot/types";
import type { DataObjectBinding, DataQueryId } from "./types";

export interface DataBindingReference {
  objectNodeId: string;
  objectName: string;
  queryId: DataQueryId;
  deviceId: string;
}

export interface DataQueryPropertyUsageEntry {
  objectNodeId: string;
  objectName: string;
  usage: "detail" | "color";
}

export interface DataQueryPropertyUsage {
  propertyKey: string;
  objects: readonly DataQueryPropertyUsageEntry[];
}

export interface DataQueryParameterUsageEntry {
  objectNodeId: string;
  objectName: string;
}

export interface DataQueryParameterUsage {
  parameterName: string;
  objects: readonly DataQueryParameterUsageEntry[];
}

export interface DataQueryReferenceModel {
  bindings: readonly DataBindingReference[];
  properties: readonly DataQueryPropertyUsage[];
  parameters: readonly DataQueryParameterUsage[];
}

export interface DataConnectionQueryReference {
  id: DataQueryId;
  name: string;
}

export interface DataConnectionReferenceModel {
  connectionId: string;
  queries: readonly DataConnectionQueryReference[];
  bindings: readonly DataBindingReference[];
}

type ReferenceSnapshot = Pick<SceneSnapshot, "dataSources" | "nodes">;

/**
 * Reverse references for one saved query: which objects bind it, which mapped
 * properties they read (as detail fields or status color), and which parameter
 * overrides they pin.
 */
export function buildDataQueryReferenceModel(
  snapshot: ReferenceSnapshot,
  queryId: DataQueryId
): DataQueryReferenceModel {
  const bindings: DataBindingReference[] = [];
  const propertyUsage = new Map<string, DataQueryPropertyUsageEntry[]>();
  const parameterUsage = new Map<string, DataQueryParameterUsageEntry[]>();

  for (const binding of Object.values(snapshot.dataSources.bindings)) {
    if (binding.queryId !== queryId) {
      continue;
    }
    bindings.push(toBindingReference(snapshot, binding));
    const object = { objectNodeId: binding.objectNodeId, objectName: objectName(snapshot, binding.objectNodeId) };
    for (const detail of binding.details) {
      pushPropertyUsage(propertyUsage, detail.key, { ...object, usage: "detail" });
    }
    if (binding.color) {
      pushPropertyUsage(propertyUsage, binding.color.propertyKey, { ...object, usage: "color" });
    }
    for (const parameterName of Object.keys(binding.parameterOverrides).sort()) {
      const objects = parameterUsage.get(parameterName) ?? [];
      if (!objects.some((entry) => entry.objectNodeId === object.objectNodeId)) {
        objects.push(object);
      }
      parameterUsage.set(parameterName, objects);
    }
  }

  return {
    bindings,
    properties: [...propertyUsage.entries()]
      .map(([propertyKey, objects]) => ({ propertyKey, objects })),
    parameters: [...parameterUsage.entries()]
      .map(([parameterName, objects]) => ({ parameterName, objects }))
  };
}

/** Reverse references for one connection: its queries and everything bound through them. */
export function buildDataConnectionReferenceModel(
  snapshot: ReferenceSnapshot,
  connectionId: string
): DataConnectionReferenceModel {
  const queries = Object.values(snapshot.dataSources.queries)
    .filter((query) => query.connectionId === connectionId);
  const queryIds = new Set(queries.map((query) => query.id));
  const bindings = Object.values(snapshot.dataSources.bindings)
    .filter((binding) => queryIds.has(binding.queryId))
    .map((binding) => toBindingReference(snapshot, binding));

  return {
    connectionId,
    queries: queries.map((query) => ({ id: query.id, name: query.name })),
    bindings
  };
}

function pushPropertyUsage(
  usage: Map<string, DataQueryPropertyUsageEntry[]>,
  propertyKey: string,
  entry: DataQueryPropertyUsageEntry
): void {
  const entries = usage.get(propertyKey) ?? [];
  const duplicate = entries.some((existing) =>
    existing.objectNodeId === entry.objectNodeId && existing.usage === entry.usage
  );
  if (!duplicate) {
    entries.push(entry);
  }
  usage.set(propertyKey, entries);
}

function toBindingReference(snapshot: ReferenceSnapshot, binding: DataObjectBinding): DataBindingReference {
  return {
    objectNodeId: binding.objectNodeId,
    objectName: objectName(snapshot, binding.objectNodeId),
    queryId: binding.queryId,
    deviceId: binding.deviceId
  };
}

function objectName(snapshot: ReferenceSnapshot, objectNodeId: string): string {
  const node = snapshot.nodes[objectNodeId];
  return node && node.kind === "object" ? node.name : objectNodeId;
}
