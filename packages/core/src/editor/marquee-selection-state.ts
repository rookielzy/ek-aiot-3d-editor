import type { SelectionMode } from "../selection/selection";

export type MarqueeSelectionStatus = "idle" | "pressed" | "dragging";

export interface MarqueeSelectionPoint {
  x: number;
  y: number;
}

export interface MarqueeSelectionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface EditorMarqueeSelectionStateSnapshot {
  status: MarqueeSelectionStatus;
  mode: SelectionMode;
  start: MarqueeSelectionPoint | null;
  current: MarqueeSelectionPoint | null;
  rect: MarqueeSelectionRect | null;
  candidateNodeIds: string[];
}

export type MarqueeSelectionSubscriber = (snapshot: EditorMarqueeSelectionStateSnapshot) => void;

export interface ReadonlyEditorMarqueeSelectionState {
  get(): EditorMarqueeSelectionStateSnapshot;
}

export const IDLE_MARQUEE_SELECTION_STATE: EditorMarqueeSelectionStateSnapshot = freezeMarqueeSelectionSnapshot({
  status: "idle",
  mode: "replace",
  start: null,
  current: null,
  rect: null,
  candidateNodeIds: []
});

export class EditorMarqueeSelectionState {
  #snapshot: EditorMarqueeSelectionStateSnapshot = IDLE_MARQUEE_SELECTION_STATE;
  #subscribers = new Set<MarqueeSelectionSubscriber>();

  get(): EditorMarqueeSelectionStateSnapshot {
    return this.#snapshot;
  }

  #set(snapshot: Partial<EditorMarqueeSelectionStateSnapshot>): EditorMarqueeSelectionStateSnapshot {
    if (marqueeSelectionPatchEquals(this.#snapshot, snapshot)) {
      return this.get();
    }
    const next = freezeMarqueeSelectionSnapshot({
      ...this.#snapshot,
      ...snapshot,
      candidateNodeIds: snapshot.candidateNodeIds ?? this.#snapshot.candidateNodeIds
    });
    this.#snapshot = next;
    this.#notify();
    return this.get();
  }

  start(start: MarqueeSelectionPoint, mode: SelectionMode): EditorMarqueeSelectionStateSnapshot {
    return this.#set({
      status: "pressed",
      mode,
      start,
      current: start,
      rect: null,
      candidateNodeIds: []
    });
  }

  drag(current: MarqueeSelectionPoint, candidateNodeIds: readonly string[] = []): EditorMarqueeSelectionStateSnapshot {
    const start = this.#snapshot.start ?? current;
    return this.#set({
      status: "dragging",
      current,
      rect: normalizeMarqueeSelectionRect(start, current),
      candidateNodeIds: [...candidateNodeIds]
    });
  }

  reset(): EditorMarqueeSelectionStateSnapshot {
    if (this.#snapshot === IDLE_MARQUEE_SELECTION_STATE) {
      return this.get();
    }
    this.#snapshot = IDLE_MARQUEE_SELECTION_STATE;
    this.#notify();
    return this.get();
  }

  subscribe(subscriber: MarqueeSelectionSubscriber): () => void {
    this.#subscribers.add(subscriber);
    subscriber(this.get());
    return () => {
      this.#subscribers.delete(subscriber);
    };
  }

  clear(): void {
    this.#subscribers.clear();
  }

  #notify(): void {
    const snapshot = this.get();
    for (const subscriber of [...this.#subscribers]) {
      subscriber(snapshot);
    }
  }
}

export function normalizeMarqueeSelectionRect(
  start: MarqueeSelectionPoint,
  current: MarqueeSelectionPoint
): MarqueeSelectionRect {
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const right = Math.max(start.x, current.x);
  const bottom = Math.max(start.y, current.y);
  return Object.freeze({
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  });
}

function freezeMarqueeSelectionSnapshot(
  snapshot: EditorMarqueeSelectionStateSnapshot
): EditorMarqueeSelectionStateSnapshot {
  return Object.freeze({
    status: snapshot.status,
    mode: snapshot.mode,
    start: snapshot.start ? Object.freeze({ ...snapshot.start }) : null,
    current: snapshot.current ? Object.freeze({ ...snapshot.current }) : null,
    rect: snapshot.rect ? Object.freeze({ ...snapshot.rect }) : null,
    candidateNodeIds: Object.freeze([...snapshot.candidateNodeIds]) as unknown as string[]
  });
}

function marqueeSelectionPatchEquals(
  current: EditorMarqueeSelectionStateSnapshot,
  patch: Partial<EditorMarqueeSelectionStateSnapshot>
): boolean {
  return (patch.status === undefined || patch.status === current.status)
    && (patch.mode === undefined || patch.mode === current.mode)
    && (patch.start === undefined || samePoint(patch.start, current.start))
    && (patch.current === undefined || samePoint(patch.current, current.current))
    && (patch.rect === undefined || sameRect(patch.rect, current.rect))
    && (patch.candidateNodeIds === undefined || sameNodeIds(patch.candidateNodeIds, current.candidateNodeIds));
}

function samePoint(left: MarqueeSelectionPoint | null, right: MarqueeSelectionPoint | null): boolean {
  return left === right || Boolean(left && right && left.x === right.x && left.y === right.y);
}

function sameRect(left: MarqueeSelectionRect | null, right: MarqueeSelectionRect | null): boolean {
  return left === right || Boolean(left && right
    && left.left === right.left
    && left.top === right.top
    && left.right === right.right
    && left.bottom === right.bottom
    && left.width === right.width
    && left.height === right.height);
}

function sameNodeIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((nodeId, index) => nodeId === right[index]);
}
