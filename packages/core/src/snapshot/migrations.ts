import { createEmptyCameraState, createEmptyPresentationState } from "../cameras/defaults";
import { createDefaultDataQueryUpdatePolicy, createEmptyDataSources } from "../data-sources/defaults";
import { createLegacyDefaultEnvironment, migrateLegacySceneEnvironment } from "../environment/migration";
import { createDefaultLightShadow } from "../lights/defaults";
import type { LegacyLightDefinition, LightDefinition } from "../lights/types";
import { createEmptyMaterialState } from "../materials/defaults";
import { createEmptyAuthoredProblemState } from "../problems/defaults";
import { createLightNode, createObjectNode } from "./defaults";
import { immutableClone } from "./immutability";
import {
  SNAPSHOT_VERSION,
  type V6SceneSnapshot,
  type V7SceneSnapshot,
  type V8SceneSnapshot,
  type LegacySceneSnapshot,
  type PreviousSceneSnapshot,
  type SceneSnapshot,
  type SerializedSceneSnapshot,
  type V5SceneNode,
  type V5SceneSnapshot,
  type V4SceneSnapshot,
  type V3SceneSnapshot
} from "./types";
import { assertValidSceneSnapshot, type ValidationResult } from "./validation";

export function migrateSerializedSnapshot(serialized: SerializedSceneSnapshot): SceneSnapshot {
  if (serialized.version === SNAPSHOT_VERSION) {
    const normalized = normalizeDataObjectBindingColors(
      normalizeDataQueryRequests(normalizeDataQueryPolicies(serialized))
    );
    assertValidSceneSnapshot(normalized);
    return immutableClone(normalized);
  }

  if (serialized.version === 8) {
    const migrated = migrateV8Snapshot(serialized);
    assertValidSceneSnapshot(migrated);
    return immutableClone(migrated);
  }

  if (serialized.version === 7) {
    const migrated = migrateV7Snapshot(serialized);
    assertValidSceneSnapshot(migrated);
    return immutableClone(migrated);
  }

  if (serialized.version === 6) {
    const migrated = migrateV6Snapshot(serialized);
    assertValidSceneSnapshot(migrated);
    return immutableClone(migrated);
  }

  if (serialized.version === 5) {
    const migrated = migrateV5Snapshot(serialized);
    assertValidSceneSnapshot(migrated);
    return immutableClone(migrated);
  }

  if (serialized.version === 4) {
    const migrated = migrateV4Snapshot(serialized);
    assertValidSceneSnapshot(migrated);
    return immutableClone(migrated);
  }

  if (serialized.version === 3) {
    const migrated = migrateV3Snapshot(serialized);
    assertValidSceneSnapshot(migrated);
    return immutableClone(migrated);
  }

  if (serialized.version === 2) {
    const migrated = migrateV2Snapshot(serialized);
    assertValidSceneSnapshot(migrated);
    return immutableClone(migrated);
  }

  if (serialized.version === 1) {
    const migrated = migrateV1Snapshot(serialized);
    assertValidSceneSnapshot(migrated);
    return immutableClone(migrated);
  }

  const version = (serialized as { version?: unknown }).version;
  throw new Error(`Unsupported snapshot version: ${String(version)}.`);
}

/**
 * Query update policies arrived while the v9 data-source contract was still
 * unreleased. Fill the documented default so snapshots saved before that
 * point remain loadable; new saves always persist the explicit policy.
 */
function normalizeDataQueryPolicies(serialized: SceneSnapshot): SceneSnapshot {
  type QueryRecord = SceneSnapshot["dataSources"]["queries"];
  type LegacyQuery = Omit<QueryRecord[string], "updatePolicy"> & Partial<Pick<QueryRecord[string], "updatePolicy">>;
  const queries = serialized.dataSources.queries as unknown as Record<string, LegacyQuery>;
  let changed = false;
  const normalized = Object.fromEntries(Object.entries(queries).map(([queryId, query]) => {
    if (query.updatePolicy !== undefined) {
      return [queryId, query];
    }
    changed = true;
    return [queryId, { ...query, updatePolicy: createDefaultDataQueryUpdatePolicy() }];
  })) as unknown as QueryRecord;
  if (!changed) {
    return serialized;
  }
  return {
    ...serialized,
    dataSources: {
      ...serialized.dataSources,
      queries: normalized
    }
  };
}

/**
 * POST, query headers, success conditions and explicit parameter locations
 * arrived while the v9 data-source contract was still unreleased. Older GET
 * queries keep their implicit path/query placement and normalize to GET.
 */
function normalizeDataQueryRequests(serialized: SceneSnapshot): SceneSnapshot {
  type QueryRecord = SceneSnapshot["dataSources"]["queries"];
  type LegacyParameter = Omit<QueryRecord[string]["parameters"][number], "location"> & {
    location?: QueryRecord[string]["parameters"][number]["location"];
  };
  type LegacyQuery = Omit<
    QueryRecord[string],
    "method" | "readOnly" | "headers" | "successCondition" | "parameters"
  > & {
    method?: QueryRecord[string]["method"];
    readOnly?: boolean;
    headers?: Record<string, string>;
    successCondition?: QueryRecord[string]["successCondition"];
    parameters: readonly LegacyParameter[];
  };
  const queries = serialized.dataSources.queries as unknown as Record<string, LegacyQuery>;
  let changed = false;
  const normalized = Object.fromEntries(Object.entries(queries).map(([queryId, query]) => {
    const method = query.method ?? "GET";
    const placeholders = typeof query.path === "string"
      ? new Set([...query.path.matchAll(/\{([A-Za-z0-9_.-]+)\}/g)].map((match) => match[1]))
      : new Set<string>();
    let queryChanged = query.method === undefined ||
      query.readOnly === undefined ||
      query.headers === undefined ||
      query.successCondition === undefined;
    const parameters = Array.isArray(query.parameters)
      ? query.parameters.map((parameter) => {
          if (parameter.location !== undefined) {
            return parameter;
          }
          queryChanged = true;
          return {
            ...parameter,
            location: placeholders.has(parameter.name.trim())
              ? "path" as const
              : method === "POST" ? "body" as const : "query" as const
          };
        })
      : query.parameters;
    if (!queryChanged) {
      return [queryId, query];
    }
    changed = true;
    return [queryId, {
      ...query,
      method,
      readOnly: query.readOnly ?? true,
      headers: query.headers ?? {},
      parameters,
      successCondition: query.successCondition ?? null
    }];
  })) as unknown as QueryRecord;
  if (!changed) {
    return serialized;
  }
  return {
    ...serialized,
    dataSources: {
      ...serialized.dataSources,
      queries: normalized
    }
  };
}

/**
 * Status colors arrived while the v9 data-source contract was still
 * unreleased. Treat stored bindings without the field as having no color.
 */
function normalizeDataObjectBindingColors(serialized: SceneSnapshot): SceneSnapshot {
  type BindingRecord = SceneSnapshot["dataSources"]["bindings"];
  type LegacyBinding = Omit<BindingRecord[string], "color"> & Partial<Pick<BindingRecord[string], "color">>;
  const bindings = serialized.dataSources.bindings as unknown as Record<string, LegacyBinding>;
  let changed = false;
  const normalized = Object.fromEntries(Object.entries(bindings).map(([objectNodeId, binding]) => {
    if (binding.color !== undefined) {
      return [objectNodeId, binding];
    }
    changed = true;
    return [objectNodeId, { ...binding, color: null }];
  })) as unknown as BindingRecord;
  if (!changed) {
    return serialized;
  }
  return {
    ...serialized,
    dataSources: {
      ...serialized.dataSources,
      bindings: normalized
    }
  };
}

export function migrateV8Snapshot(serialized: V8SceneSnapshot): SceneSnapshot {
  return {
    ...serialized,
    version: SNAPSHOT_VERSION,
    dataSources: createEmptyDataSources()
  };
}

export function migrateV7Snapshot(serialized: V7SceneSnapshot): SceneSnapshot {
  return migrateV8Snapshot({
    ...serialized,
    version: 8,
    lights: migrateLightShadows(serialized.lights)
  });
}

export function migrateV6Snapshot(serialized: V6SceneSnapshot): SceneSnapshot {
  return migrateV7Snapshot({
    ...serialized,
    version: 7,
    environment: migrateLegacySceneEnvironment(serialized.environment)
  });
}

function migrateLightShadows(lights: Record<string, LegacyLightDefinition>): Record<string, LightDefinition> {
  const migrated: Record<string, LightDefinition> = {};
  for (const light of Object.values(lights)) {
    switch (light.kind) {
      case "ambient":
      case "hemisphere":
        migrated[light.id] = light;
        break;
      case "directional":
        migrated[light.id] = {
          ...light,
          shadow: createDefaultLightShadow("directional", light.shadow)
        };
        break;
      case "point":
        migrated[light.id] = {
          ...light,
          shadow: createDefaultLightShadow("point", light.shadow)
        };
        break;
      case "spot":
        migrated[light.id] = {
          ...light,
          shadow: createDefaultLightShadow("spot", light.shadow)
        };
        break;
      default:
        assertNever(light);
    }
  }
  return migrated;
}

export function migrateV5Snapshot(serialized: V5SceneSnapshot): SceneSnapshot {
  return migrateV6Snapshot({
    ...serialized,
    version: 6,
    cameras: createEmptyCameraState(),
    presentation: createEmptyPresentationState()
  });
}

export function migrateV4Snapshot(serialized: V4SceneSnapshot): SceneSnapshot {
  return migrateV5Snapshot({
    ...serialized,
    version: 5
  });
}

export function migrateV3Snapshot(serialized: V3SceneSnapshot): SceneSnapshot {
  const nodes: Record<string, V5SceneNode> = {};
  const usedNodeIds = new Set<string>();

  for (const object of Object.values(serialized.objects)) {
    nodes[object.id] = createObjectNode(object);
    usedNodeIds.add(object.id);
  }

  const rootNodeIds = serialized.rootObjectIds.filter((objectId) => nodes[objectId]);

  for (const light of Object.values(serialized.lights)) {
    const nodeId = createCollisionSafeLightNodeId(light.id, usedNodeIds);
    nodes[nodeId] = createLightNode(light, nodeId);
    usedNodeIds.add(nodeId);
    rootNodeIds.push(nodeId);
  }

  const nodeIds = serialized.selection.objectIds.filter((objectId) => nodes[objectId]);
  const nodeId = serialized.selection.objectId && nodeIds.includes(serialized.selection.objectId)
    ? serialized.selection.objectId
    : nodeIds[0] ?? null;

  return migrateV5Snapshot({
    ...serialized,
    version: 5,
    nodes,
    rootNodeIds,
    selection: {
      nodeId,
      nodeIds,
      objectId: nodeId,
      objectIds: nodeIds
    }
  });
}

export function migrateV1Snapshot(serialized: LegacySceneSnapshot): SceneSnapshot {
  return migrateV2Snapshot({
    ...serialized,
    version: 2,
    materials: createEmptyMaterialState(),
    environment: createLegacyDefaultEnvironment(),
    lights: {},
    problems: createEmptyAuthoredProblemState()
  });
}

export function migrateV2Snapshot(serialized: PreviousSceneSnapshot): SceneSnapshot {
  const selectedObjectId = serialized.selection.objectId;
  return migrateV3Snapshot({
    ...serialized,
    version: 3,
    selection: {
      objectId: selectedObjectId,
      objectIds: selectedObjectId ? [selectedObjectId] : []
    }
  });
}

export function validateSerializedSceneSnapshot(value: unknown): ValidationResult {
  try {
    migrateSerializedSnapshot(value as SerializedSceneSnapshot);
    return { ok: true, errors: [] };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

function createCollisionSafeLightNodeId(lightId: string, usedNodeIds: Set<string>): string {
  if (!usedNodeIds.has(lightId)) {
    return lightId;
  }

  const preferred = `${lightId}:light`;
  if (!usedNodeIds.has(preferred)) {
    return preferred;
  }

  let index = 2;
  let candidate = `${preferred}-${index}`;
  while (usedNodeIds.has(candidate)) {
    index += 1;
    candidate = `${preferred}-${index}`;
  }
  return candidate;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported migration value: ${JSON.stringify(value)}`);
}
