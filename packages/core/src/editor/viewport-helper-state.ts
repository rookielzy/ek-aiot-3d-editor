export type ViewportHelperKey = "grid" | "floor" | "axes" | "selectionBounds" | "hover" | "snapFeedback";

export type ViewportHelperVisibility = Record<ViewportHelperKey, boolean>;

export interface ViewportSnapFeedbackState {
  status: "idle" | "dragging-unsnapped" | "dragging-snapped" | "disabled" | "invalid";
  nodeId: string | null;
  mode: "translate" | "rotate" | "scale" | null;
  increment: number | null;
  channelSnapped: boolean;
  before?: [number, number, number];
  preview?: [number, number, number];
  snapped?: [number, number, number];
}

export interface ViewportHelperStateSnapshot {
  visibility: ViewportHelperVisibility;
  hoverNodeId: string | null;
  snapFeedback: ViewportSnapFeedbackState;
}

export type ViewportHelperSubscriber = (snapshot: ViewportHelperStateSnapshot) => void;

export const DEFAULT_VIEWPORT_HELPER_VISIBILITY: ViewportHelperVisibility = Object.freeze({
  grid: false,
  floor: false,
  axes: false,
  selectionBounds: false,
  hover: false,
  snapFeedback: false
});

export const DEFAULT_WORKBENCH_VIEWPORT_HELPER_VISIBILITY: ViewportHelperVisibility = Object.freeze({
  grid: true,
  floor: false,
  axes: true,
  selectionBounds: true,
  hover: true,
  snapFeedback: true
});

export const IDLE_VIEWPORT_SNAP_FEEDBACK: ViewportSnapFeedbackState = Object.freeze({
  status: "idle",
  nodeId: null,
  mode: null,
  increment: null,
  channelSnapped: false
});

export class EditorViewportHelperState {
  #initialVisibility: ViewportHelperVisibility;
  #initialVisibilitySeeded: boolean;
  #visibilitySeeded: boolean;
  #snapshot: ViewportHelperStateSnapshot;
  #subscribers = new Set<ViewportHelperSubscriber>();

  constructor(initialVisibility?: Partial<ViewportHelperVisibility>) {
    this.#initialVisibility = normalizeViewportHelperVisibility(initialVisibility);
    this.#initialVisibilitySeeded = initialVisibility !== undefined;
    this.#visibilitySeeded = this.#initialVisibilitySeeded;
    this.#snapshot = freezeViewportHelperSnapshot({
      visibility: this.#initialVisibility,
      hoverNodeId: null,
      snapFeedback: IDLE_VIEWPORT_SNAP_FEEDBACK
    });
  }

  get(): ViewportHelperStateSnapshot {
    return this.#snapshot;
  }

  setVisibility(patch: Partial<ViewportHelperVisibility>): ViewportHelperStateSnapshot {
    this.#visibilitySeeded = true;
    const visibility = normalizeViewportHelperVisibility({
      ...this.#snapshot.visibility,
      ...patch
    });
    if (sameViewportHelperVisibility(this.#snapshot.visibility, visibility)) {
      return this.get();
    }
    this.#snapshot = freezeViewportHelperSnapshot({
      ...this.#snapshot,
      visibility,
      hoverNodeId: visibility.hover ? this.#snapshot.hoverNodeId : null,
      snapFeedback: visibility.snapFeedback ? this.#snapshot.snapFeedback : IDLE_VIEWPORT_SNAP_FEEDBACK
    });
    this.#notify();
    return this.get();
  }

  seedVisibility(visibility: Partial<ViewportHelperVisibility>): ViewportHelperStateSnapshot {
    if (this.#visibilitySeeded) {
      return this.get();
    }
    return this.setVisibility(visibility);
  }

  toggle(key: ViewportHelperKey): ViewportHelperStateSnapshot {
    return this.setVisibility({ [key]: !this.#snapshot.visibility[key] });
  }

  setHover(nodeId: string | null): ViewportHelperStateSnapshot {
    if (this.#snapshot.hoverNodeId === nodeId) {
      return this.get();
    }
    this.#snapshot = freezeViewportHelperSnapshot({
      ...this.#snapshot,
      hoverNodeId: nodeId
    });
    this.#notify();
    return this.get();
  }

  setSnapFeedback(feedback: ViewportSnapFeedbackState): ViewportHelperStateSnapshot {
    this.#snapshot = freezeViewportHelperSnapshot({
      ...this.#snapshot,
      snapFeedback: feedback
    });
    this.#notify();
    return this.get();
  }

  reset(): ViewportHelperStateSnapshot {
    this.#visibilitySeeded = this.#initialVisibilitySeeded;
    this.#snapshot = freezeViewportHelperSnapshot({
      visibility: this.#initialVisibility,
      hoverNodeId: null,
      snapFeedback: IDLE_VIEWPORT_SNAP_FEEDBACK
    });
    this.#notify();
    return this.get();
  }

  subscribe(subscriber: ViewportHelperSubscriber): () => void {
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

export function normalizeViewportHelperVisibility(
  visibility: Partial<ViewportHelperVisibility> | undefined
): ViewportHelperVisibility {
  return Object.freeze({
    grid: visibility?.grid ?? DEFAULT_VIEWPORT_HELPER_VISIBILITY.grid,
    floor: visibility?.floor ?? DEFAULT_VIEWPORT_HELPER_VISIBILITY.floor,
    axes: visibility?.axes ?? DEFAULT_VIEWPORT_HELPER_VISIBILITY.axes,
    selectionBounds: visibility?.selectionBounds ?? DEFAULT_VIEWPORT_HELPER_VISIBILITY.selectionBounds,
    hover: visibility?.hover ?? DEFAULT_VIEWPORT_HELPER_VISIBILITY.hover,
    snapFeedback: visibility?.snapFeedback ?? DEFAULT_VIEWPORT_HELPER_VISIBILITY.snapFeedback
  });
}

function freezeViewportHelperSnapshot(snapshot: ViewportHelperStateSnapshot): ViewportHelperStateSnapshot {
  return Object.freeze({
    visibility: Object.freeze({ ...snapshot.visibility }),
    hoverNodeId: snapshot.hoverNodeId,
    snapFeedback: Object.freeze({ ...snapshot.snapFeedback })
  });
}

function sameViewportHelperVisibility(left: ViewportHelperVisibility, right: ViewportHelperVisibility): boolean {
  return left.grid === right.grid
    && left.floor === right.floor
    && left.axes === right.axes
    && left.selectionBounds === right.selectionBounds
    && left.hover === right.hover
    && left.snapFeedback === right.snapFeedback;
}
