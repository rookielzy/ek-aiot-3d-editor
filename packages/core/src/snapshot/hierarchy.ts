import type { SceneObject, SceneSnapshot } from "./types";

export function collectObjectSubtreeIds(snapshot: SceneSnapshot, objectId: string): string[] {
  const object = snapshot.objects[objectId];
  if (!object) {
    throw new Error(`Object ${objectId} does not exist.`);
  }

  const ids = [objectId];
  for (const childId of object.children) {
    ids.push(...collectObjectSubtreeIds(snapshot, childId));
  }
  return ids;
}

export function isAncestorOf(snapshot: SceneSnapshot, ancestorId: string, descendantId: string): boolean {
  let parentId = snapshot.objects[descendantId]?.parentId ?? null;
  while (parentId) {
    if (parentId === ancestorId) {
      return true;
    }
    parentId = snapshot.objects[parentId]?.parentId ?? null;
  }
  return false;
}

export function removeObjectsFromHierarchy(snapshot: SceneSnapshot, removedObjectIds: Set<string>): {
  objects: SceneSnapshot["objects"];
  rootObjectIds: string[];
} {
  const objects: SceneSnapshot["objects"] = {};

  for (const [objectId, object] of Object.entries(snapshot.objects)) {
    if (removedObjectIds.has(objectId)) {
      continue;
    }
    objects[objectId] = {
      ...object,
      children: object.children.filter((childId) => !removedObjectIds.has(childId))
    };
  }

  return {
    objects,
    rootObjectIds: snapshot.rootObjectIds.filter((objectId) => !removedObjectIds.has(objectId))
  };
}

export function reparentObject(
  objects: SceneSnapshot["objects"],
  rootObjectIds: string[],
  objectId: string,
  nextParentId: string | null
): { objects: SceneSnapshot["objects"]; rootObjectIds: string[] } {
  const object = objects[objectId];
  if (!object) {
    throw new Error(`Object ${objectId} does not exist.`);
  }
  if (nextParentId && !objects[nextParentId]) {
    throw new Error(`Parent object ${nextParentId} does not exist.`);
  }
  if (nextParentId === objectId) {
    throw new Error("Object cannot be parented to itself.");
  }
  let ancestorId = nextParentId;
  while (ancestorId) {
    if (ancestorId === objectId) {
      throw new Error("Object cannot be parented under its descendant.");
    }
    ancestorId = objects[ancestorId]?.parentId ?? null;
  }

  const nextObjects = { ...objects };
  let nextRootObjectIds = [...rootObjectIds];
  const previousParentId = object.parentId;

  if (previousParentId) {
    const previousParent = nextObjects[previousParentId];
    nextObjects[previousParentId] = {
      ...previousParent,
      children: previousParent.children.filter((childId) => childId !== objectId)
    };
  } else {
    nextRootObjectIds = nextRootObjectIds.filter((rootId) => rootId !== objectId);
  }

  if (nextParentId) {
    const nextParent = nextObjects[nextParentId];
    nextObjects[nextParentId] = {
      ...nextParent,
      children: nextParent.children.includes(objectId) ? nextParent.children : [...nextParent.children, objectId]
    };
  } else if (!nextRootObjectIds.includes(objectId)) {
    nextRootObjectIds.push(objectId);
  }

  nextObjects[objectId] = {
    ...object,
    parentId: nextParentId
  };

  return {
    objects: nextObjects,
    rootObjectIds: nextRootObjectIds
  };
}

export function cloneSceneObject(object: SceneObject, id: string, parentId: string | null, children: string[]): SceneObject {
  return {
    ...object,
    id,
    parentId,
    children: [...children],
    asset: { ...object.asset },
    transform: {
      position: [...object.transform.position],
      rotation: [...object.transform.rotation],
      scale: [...object.transform.scale]
    },
    ...(object.metadata ? { metadata: { ...object.metadata } } : {})
  };
}
