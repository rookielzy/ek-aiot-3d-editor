import { Box3, Vector3, type Camera, type Object3D } from "three";
import type { MarqueeSelectionRect } from "../editor/marquee-selection-state";
import type { RuntimeNodeTarget, ThreeObjectMap } from "./three-object-map";

export interface RuntimeMarqueeSelectionOptions {
  camera: Camera;
  objects: ThreeObjectMap;
  viewport: {
    width: number;
    height: number;
  };
}

export interface RuntimeMarqueeSelectionCandidate {
  nodeId: string;
  rect: MarqueeSelectionRect;
  pickPriority: number;
}

export interface RuntimeMarqueeSelectionResult {
  nodeIds: string[];
  primaryNodeId: string | null;
  candidates: RuntimeMarqueeSelectionCandidate[];
}

interface RuntimeMarqueeSelectionInternalCandidate extends RuntimeMarqueeSelectionCandidate {
  target: RuntimeNodeTarget;
}

export class RuntimeMarqueeSelection {
  constructor(private readonly options: RuntimeMarqueeSelectionOptions) {}

  select(rect: MarqueeSelectionRect): RuntimeMarqueeSelectionResult {
    const viewportRect = normalizeSelectionRect({
      left: 0,
      top: 0,
      right: this.options.viewport.width,
      bottom: this.options.viewport.height,
      width: this.options.viewport.width,
      height: this.options.viewport.height
    });
    const selectionRect = intersectRects(normalizeSelectionRect(rect), viewportRect);
    if (!selectionRect) {
      return emptyMarqueeSelectionResult();
    }

    this.options.camera.updateMatrixWorld();
    const candidates: RuntimeMarqueeSelectionInternalCandidate[] = [];
    const seenObjects = new WeakMap<object, RuntimeMarqueeSelectionInternalCandidate>();

    for (const [, target] of this.options.objects.targetEntries()) {
      const candidate = this.#candidateForTarget(target, selectionRect);
      if (!candidate) {
        continue;
      }
      const previous = seenObjects.get(target.object);
      if (previous && compareMarqueeCandidates(candidate, previous) >= 0) {
        continue;
      }
      if (previous) {
        candidates.splice(candidates.indexOf(previous), 1);
      }
      seenObjects.set(target.object, candidate);
      candidates.push(candidate);
    }

    const ordered = removeAncestorCandidates(candidates).sort(compareMarqueeCandidates);
    return {
      nodeIds: ordered.map((candidate) => candidate.nodeId),
      primaryNodeId: ordered[0]?.nodeId ?? null,
      candidates: ordered.map(toPublicCandidate)
    };
  }

  #candidateForTarget(
    target: RuntimeNodeTarget,
    selectionRect: MarqueeSelectionRect
  ): RuntimeMarqueeSelectionInternalCandidate | null {
    if (!target.pickable || target.object.userData.problem || target.object.userData.runtimeOnly || !isObjectVisible(target.object)) {
      return null;
    }

    const targetRect = projectTargetRect(target, this.options.camera, this.options.viewport);
    if (!targetRect || !rectsIntersect(selectionRect, targetRect)) {
      return null;
    }

    return {
      nodeId: target.nodeId,
      rect: targetRect,
      pickPriority: target.pickPriority ?? defaultMarqueePickPriority(target),
      target
    };
  }
}

function projectTargetRect(
  target: RuntimeNodeTarget,
  camera: Camera,
  viewport: { width: number; height: number }
): MarqueeSelectionRect | null {
  target.object.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(target.object);
  if (bounds.isEmpty()) {
    const worldPosition = new Vector3();
    target.object.getWorldPosition(worldPosition);
    return projectWorldPoints([worldPosition], camera, viewport);
  }

  return projectWorldPoints(cornersForBounds(bounds), camera, viewport);
}

function projectWorldPoints(
  points: Vector3[],
  camera: Camera,
  viewport: { width: number; height: number }
): MarqueeSelectionRect | null {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const point of points) {
    const projected = point.clone().project(camera);
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || !Number.isFinite(projected.z)) {
      continue;
    }
    if (projected.z < -1 || projected.z > 1) {
      continue;
    }
    xs.push((projected.x + 1) / 2 * viewport.width);
    ys.push((1 - projected.y) / 2 * viewport.height);
  }

  if (xs.length === 0 || ys.length === 0) {
    return null;
  }

  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return normalizeSelectionRect({
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  });
}

function cornersForBounds(bounds: Box3): Vector3[] {
  const { min, max } = bounds;
  return [
    new Vector3(min.x, min.y, min.z),
    new Vector3(min.x, min.y, max.z),
    new Vector3(min.x, max.y, min.z),
    new Vector3(min.x, max.y, max.z),
    new Vector3(max.x, min.y, min.z),
    new Vector3(max.x, min.y, max.z),
    new Vector3(max.x, max.y, min.z),
    new Vector3(max.x, max.y, max.z)
  ];
}

function compareMarqueeCandidates(left: RuntimeMarqueeSelectionCandidate, right: RuntimeMarqueeSelectionCandidate): number {
  return left.rect.top - right.rect.top
    || left.rect.left - right.rect.left
    || right.pickPriority - left.pickPriority
    || left.nodeId.localeCompare(right.nodeId);
}

function normalizeSelectionRect(rect: MarqueeSelectionRect): MarqueeSelectionRect {
  const left = Math.min(rect.left, rect.right);
  const top = Math.min(rect.top, rect.bottom);
  const right = Math.max(rect.left, rect.right);
  const bottom = Math.max(rect.top, rect.bottom);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

function intersectRects(left: MarqueeSelectionRect, right: MarqueeSelectionRect): MarqueeSelectionRect | null {
  const intersection = {
    left: Math.max(left.left, right.left),
    top: Math.max(left.top, right.top),
    right: Math.min(left.right, right.right),
    bottom: Math.min(left.bottom, right.bottom)
  };
  if (intersection.right < intersection.left || intersection.bottom < intersection.top) {
    return null;
  }
  return {
    ...intersection,
    width: intersection.right - intersection.left,
    height: intersection.bottom - intersection.top
  };
}

function rectsIntersect(left: MarqueeSelectionRect, right: MarqueeSelectionRect): boolean {
  return left.left <= right.right
    && left.right >= right.left
    && left.top <= right.bottom
    && left.bottom >= right.top;
}

function removeAncestorCandidates(
  candidates: RuntimeMarqueeSelectionInternalCandidate[]
): RuntimeMarqueeSelectionInternalCandidate[] {
  return candidates.filter((candidate) => !candidates.some((other) => {
    if (other === candidate || other.nodeId === candidate.nodeId) {
      return false;
    }
    return other.pickPriority >= candidate.pickPriority && isAncestorObject(candidate.target.object, other.target.object);
  }));
}

function isAncestorObject(ancestor: Object3D, descendant: Object3D): boolean {
  let current = descendant.parent;
  while (current) {
    if (current === ancestor) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isObjectVisible(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

function toPublicCandidate(candidate: RuntimeMarqueeSelectionInternalCandidate): RuntimeMarqueeSelectionCandidate {
  return {
    nodeId: candidate.nodeId,
    rect: candidate.rect,
    pickPriority: candidate.pickPriority
  };
}

function emptyMarqueeSelectionResult(): RuntimeMarqueeSelectionResult {
  return {
    nodeIds: [],
    primaryNodeId: null,
    candidates: []
  };
}

function defaultMarqueePickPriority(target: RuntimeNodeTarget): number {
  switch (target.kind) {
    case "imported":
      return 20;
    case "light":
      return 15;
    case "object":
      return 10;
    case "group":
      return 5;
  }
}
