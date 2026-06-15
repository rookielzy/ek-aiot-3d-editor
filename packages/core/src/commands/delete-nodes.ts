import { getSelectedNodeIds, normalizeNodeSelection } from "../selection/selection";
import { collectImportedGlbMaterialSlotTargets, createImportedGlbMaterialSlotTargetKey } from "../imported-targets/slots";
import { collectNodeSubtreeIds, getTopLevelNodeIds, removeNodesFromHierarchy } from "../snapshot/hierarchy";
import type { SceneSnapshot } from "../snapshot/types";
import { syncPayloadsFromNodes } from "./node-state";
import type { DeleteNodesCommand } from "./types";

export function applyDeleteNodes(snapshot: SceneSnapshot, command: DeleteNodesCommand): SceneSnapshot {
  const targetNodeIds = command.nodeIds ?? getSelectedNodeIds(snapshot);
  if (targetNodeIds.length === 0) {
    return snapshot;
  }

  for (const nodeId of targetNodeIds) {
    if (!snapshot.nodes[nodeId]) {
      throw new Error(`Node ${nodeId} does not exist.`);
    }
  }

  const removedNodeIds = new Set<string>();
  for (const nodeId of getTopLevelNodeIds(snapshot, targetNodeIds)) {
    for (const subtreeNodeId of collectNodeSubtreeIds(snapshot, nodeId)) {
      removedNodeIds.add(subtreeNodeId);
    }
  }

  const removedObjectIds = new Set<string>();
  const removedLightIds = new Set<string>();
  const removedCameraIds = new Set<string>();
  const removedImportedNodeIds = new Set<string>();
  for (const nodeId of removedNodeIds) {
    const node = snapshot.nodes[nodeId];
    if (node?.kind === "object") {
      removedObjectIds.add(node.objectId);
    }
    if (node?.kind === "light") {
      removedLightIds.add(node.lightId);
    }
    if (node?.kind === "camera") {
      removedCameraIds.add(node.cameraId);
    }
    if (node?.kind === "imported") {
      removedImportedNodeIds.add(nodeId);
    }
  }
  const removedImportedSlotTargets = collectImportedGlbMaterialSlotTargets(snapshot, removedImportedNodeIds);

  const { nodes, rootNodeIds } = removeNodesFromHierarchy(snapshot, removedNodeIds);
  const objects = Object.fromEntries(
    Object.entries(snapshot.objects).filter(([objectId]) => !removedObjectIds.has(objectId))
  );
  const lights = Object.fromEntries(
    Object.entries(snapshot.lights).filter(([lightId]) => !removedLightIds.has(lightId))
  );
  const cameras = Object.fromEntries(
    Object.entries(snapshot.cameras).filter(([cameraId]) => !removedCameraIds.has(cameraId))
  );
  const assignments = Object.fromEntries(
    Object.entries(snapshot.materials.assignments).filter(([, assignment]) => {
      if (removedObjectIds.has(assignment.target.objectId)) {
        return false;
      }
      return assignment.target.kind !== "material-slot" ||
        !removedImportedSlotTargets.has(createImportedGlbMaterialSlotTargetKey(assignment.target.objectId, assignment.target.slotId));
    })
  );

  const nextSnapshot = syncPayloadsFromNodes({
    ...snapshot,
    nodes,
    rootNodeIds,
    objects,
    rootObjectIds: snapshot.rootObjectIds.filter((objectId) => !removedObjectIds.has(objectId)),
    lights,
    cameras,
    presentation: {
      ...snapshot.presentation,
      defaultCameraId: snapshot.presentation.defaultCameraId && removedCameraIds.has(snapshot.presentation.defaultCameraId)
        ? null
        : snapshot.presentation.defaultCameraId
    },
    materials: {
      ...snapshot.materials,
      assignments
    }
  });
  const nodeIds = snapshot.selection.nodeIds.filter((nodeId) => !removedNodeIds.has(nodeId));

  return {
    ...nextSnapshot,
    selection: normalizeNodeSelection(nextSnapshot, {
      mode: "replace",
      nodeIds,
      primaryNodeId: nodeIds.includes(snapshot.selection.nodeId ?? "") ? snapshot.selection.nodeId : nodeIds[0] ?? null
    })
  };
}
