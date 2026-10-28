import type { SceneSnapshot } from "../snapshot/types";
import { evaluateDataColorRules } from "./color-rules";
import type { DataObjectRuntimeState } from "./object-data";
import type { EditorDataService } from "./service";
import type {
  DataBindingColor,
  DataObjectBinding,
  DataParameterValue,
  DataQuality
} from "./types";

export interface DataColorAssignment {
  objectNodeId: string;
  /** Null inspects material support without changing the authored color. */
  color: string | null;
}

export interface DataColorCapabilityProblem {
  code: "color-material-unsupported";
  meshName: string;
  slotIndex: number | null;
  materialType: string;
  message: string;
}

export type DataColorCapabilityStatus = "unavailable" | "unsupported" | "partial" | "supported" | "applied";

export interface DataColorObjectCapability {
  objectNodeId: string;
  status: DataColorCapabilityStatus;
  meshCount: number;
  slotCount: number;
  supportedSlotCount: number;
  problems: readonly DataColorCapabilityProblem[];
}

export interface DataColorSink {
  setDataColors(assignments: readonly DataColorAssignment[]): readonly DataColorObjectCapability[];
  subscribeProjection?(subscriber: () => void): () => void;
}

export type DataColorSource = "preview" | "trial";

export type DataColorInactiveReason =
  | "disabled"
  | "loading"
  | "missing-device"
  | "empty"
  | "error"
  | "stale"
  | "quality"
  | "no-value"
  | "default"
  | "preview-off";

export type DataColorObjectStatus = "default" | "applied" | "unavailable" | "unsupported";

export interface DataColorObjectState {
  objectNodeId: string;
  source: DataColorSource | null;
  status: DataColorObjectStatus;
  propertyKey: string | null;
  value: DataParameterValue | null;
  color: string | null;
  ruleIndex: number | null;
  reason: DataColorInactiveReason | null;
  quality: DataQuality | null;
  capabilities: DataColorObjectCapability;
}

export interface DataColorTrialState {
  objectNodeId: string;
  source: "sample" | "test";
  propertyKey: string;
  value: DataParameterValue | null;
  color: string | null;
  ruleIndex: number | null;
}

export interface DataColorState {
  previewEnabled: boolean;
  trial: DataColorTrialState | null;
  objects: Readonly<Record<string, DataColorObjectState>>;
}

export type DataColorTrialProblemCode = "color-required" | "preview-active" | "target-not-found";

export interface DataColorTrialProblem {
  code: DataColorTrialProblemCode;
  message: string;
}

export type DataColorTrialResult =
  | { ok: true; trial: DataColorTrialState }
  | { ok: false; problems: readonly DataColorTrialProblem[] };

export interface DataColorTrialInput {
  objectNodeId: string;
  color: DataBindingColor | null;
  /** Explicit sample/test value; trial never polls or saves. */
  value: DataParameterValue | null;
  source: "sample" | "test";
}

export type DataColorSubscriber = (state: DataColorState) => void;

export interface EditorDataColorService {
  getState(): DataColorState;
  subscribe(subscriber: DataColorSubscriber): () => void;
  startTrial(input: DataColorTrialInput): DataColorTrialResult;
  endTrial(): void;
  getTrial(): DataColorTrialState | null;
  readonly disposed: boolean;
  dispose(): void;
}

export interface CoreDataColorServiceOptions {
  getSnapshot(): SceneSnapshot;
  dataService: EditorDataService;
  subscribeSnapshot?(listener: () => void): () => void;
}

interface ActiveTrial {
  objectNodeId: string;
  source: "sample" | "test";
  color: DataBindingColor;
  value: DataParameterValue | null;
}

export function emptyDataColorCapability(objectNodeId: string): DataColorObjectCapability {
  return Object.freeze({
    objectNodeId,
    status: "unavailable",
    meshCount: 0,
    slotCount: 0,
    supportedSlotCount: 0,
    problems: []
  });
}

export class CoreDataColorService implements EditorDataColorService {
  readonly #getSnapshot: CoreDataColorServiceOptions["getSnapshot"];
  readonly #dataService: EditorDataService;
  readonly #subscribers = new Set<DataColorSubscriber>();
  readonly #unsubscribeData: () => void;
  readonly #unsubscribeRuns: () => void;
  readonly #unsubscribeSnapshot: (() => void) | null;
  #sink: DataColorSink | null = null;
  #unsubscribeProjection: (() => void) | null = null;
  #trial: ActiveTrial | null = null;
  #configRevision: number;
  #state: DataColorState;
  #disposed = false;

  constructor(options: CoreDataColorServiceOptions) {
    this.#getSnapshot = options.getSnapshot;
    this.#dataService = options.dataService;
    this.#configRevision = options.dataService.getState().configRevision;
    this.#state = freezeDataColorState(false, null, {});
    this.#unsubscribeData = options.dataService.subscribeObjectData(() => this.#sync());
    this.#unsubscribeRuns = options.dataService.subscribe((state) => {
      if (state.configRevision === this.#configRevision) {
        return;
      }
      this.#configRevision = state.configRevision;
      if (this.#trial) {
        this.#trial = null;
      }
      this.#sync();
    });
    this.#unsubscribeSnapshot = options.subscribeSnapshot?.(() => this.#sync()) ?? null;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  getState(): DataColorState {
    return this.#state;
  }

  subscribe(subscriber: DataColorSubscriber): () => void {
    if (this.#disposed) {
      return () => {};
    }
    this.#subscribers.add(subscriber);
    return () => {
      this.#subscribers.delete(subscriber);
    };
  }

  setSink(sink: DataColorSink | null): void {
    if (this.#disposed) {
      return;
    }
    this.#unsubscribeProjection?.();
    this.#unsubscribeProjection = null;
    this.#sink = sink;
    if (sink?.subscribeProjection) {
      this.#unsubscribeProjection = sink.subscribeProjection(() => this.#sync());
    }
    this.#sync();
  }

  startTrial(input: DataColorTrialInput): DataColorTrialResult {
    if (this.#disposed) {
      return { ok: false, problems: [{ code: "target-not-found", message: "The data color service has been disposed." }] };
    }
    if (this.#dataService.getObjectDataState().preview.enabled) {
      return {
        ok: false,
        problems: [{
          code: "preview-active",
          message: "Stop the global data preview before trying draft colors."
        }]
      };
    }
    const node = this.#getSnapshot().nodes[input.objectNodeId];
    if (!node || node.kind !== "object") {
      return {
        ok: false,
        problems: [{ code: "target-not-found", message: "Select an object node to try draft colors." }]
      };
    }
    if (!input.color || input.color.rules.length === 0) {
      return {
        ok: false,
        problems: [{ code: "color-required", message: "Add at least one color rule before trying it on the object." }]
      };
    }

    this.#trial = {
      objectNodeId: input.objectNodeId,
      source: input.source,
      color: input.color,
      value: input.value
    };
    this.#sync();
    const trial = this.#state.trial;
    if (!trial) {
      return {
        ok: false,
        problems: [{ code: "target-not-found", message: "The draft trial could not be started." }]
      };
    }
    return { ok: true, trial };
  }

  endTrial(): void {
    if (this.#disposed || !this.#trial) {
      return;
    }
    this.#trial = null;
    this.#sync();
  }

  getTrial(): DataColorTrialState | null {
    return this.#state.trial;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#trial = null;
    try {
      this.#sink?.setDataColors([]);
    } catch {
      // A disposed runtime already restored and released its own projection.
    }
    this.#unsubscribeProjection?.();
    this.#unsubscribeProjection = null;
    this.#sink = null;
    this.#unsubscribeData();
    this.#unsubscribeRuns();
    this.#unsubscribeSnapshot?.();
    this.#subscribers.clear();
  }

  #sync(): void {
    if (this.#disposed) {
      return;
    }
    const dataState = this.#dataService.getObjectDataState();
    const previewEnabled = dataState.preview.enabled;
    if (previewEnabled && this.#trial) {
      this.#trial = null;
    }
    const snapshot = this.#getSnapshot();
    if (this.#trial && snapshot.nodes[this.#trial.objectNodeId]?.kind !== "object") {
      this.#trial = null;
    }
    const assignments: DataColorAssignment[] = [];
    const objects: Record<string, DataColorObjectState> = {};

    if (this.#trial) {
      const trial = this.#trial;
      const match = evaluateDataColorRules(trial.color, trial.value);
      const trialState: DataColorTrialState = {
        objectNodeId: trial.objectNodeId,
        source: trial.source,
        propertyKey: trial.color.propertyKey,
        value: trial.value,
        color: match?.color ?? null,
        ruleIndex: match?.ruleIndex ?? null
      };
      assignments.push({ objectNodeId: trial.objectNodeId, color: trialState.color });
      objects[trial.objectNodeId] = createObjectState(
        trial.objectNodeId,
        "trial",
        trialState.propertyKey,
        trialState.value,
        trialState.color,
        trialState.ruleIndex,
        trial.value === null ? "no-value" : trialState.color === null ? "default" : null,
        null,
        emptyDataColorCapability(trial.objectNodeId)
      );
    }

    for (const binding of Object.values(snapshot.dataSources.bindings)) {
      if (!binding.color || objects[binding.objectNodeId]) {
        continue;
      }
      const runtime = previewEnabled ? dataState.objects[binding.objectNodeId] ?? null : null;
      const evaluation = previewEnabled
        ? evaluateBindingColor(binding, runtime)
        : {
            color: null,
            ruleIndex: null,
            value: null,
            reason: binding.enabled ? "preview-off" as const : "disabled" as const
          };
      objects[binding.objectNodeId] = createObjectState(
        binding.objectNodeId,
        "preview",
        binding.color.propertyKey,
        evaluation.value,
        evaluation.color,
        evaluation.ruleIndex,
        evaluation.reason,
        runtime?.sourceQuality ?? null,
        emptyDataColorCapability(binding.objectNodeId)
      );
      assignments.push({
        objectNodeId: binding.objectNodeId,
        color: evaluation.color
      });
    }

    let capabilities: readonly DataColorObjectCapability[] = [];
    try {
      capabilities = this.#sink?.setDataColors(assignments) ?? [];
    } catch {
      // A disposed runtime reports no capability until another one is mounted.
    }
    const capabilityByObject = new Map(capabilities.map((capability) => [capability.objectNodeId, capability]));
    for (const [objectNodeId, objectState] of Object.entries(objects)) {
      const capability = capabilityByObject.get(objectNodeId) ?? emptyDataColorCapability(objectNodeId);
      objects[objectNodeId] = {
        ...objectState,
        status: objectState.color !== null
          ? capability.status === "unsupported" || capability.status === "unavailable"
            ? capability.status
            : "applied"
          : capability.status === "unavailable" ? "unavailable" : objectState.status,
        capabilities: capability
      };
    }

    const trialState = this.#trial && objects[this.#trial.objectNodeId]
      ? {
          objectNodeId: this.#trial.objectNodeId,
          source: this.#trial.source,
          propertyKey: this.#trial.color.propertyKey,
          value: this.#trial.value,
          color: objects[this.#trial.objectNodeId].color,
          ruleIndex: objects[this.#trial.objectNodeId].ruleIndex
        } satisfies DataColorTrialState
      : null;

    const next = freezeDataColorState(previewEnabled, trialState, objects);
    if (sameDataColorState(this.#state, next)) {
      return;
    }
    this.#state = next;
    for (const subscriber of [...this.#subscribers]) {
      try {
        subscriber(this.#state);
      } catch {
        // Runtime subscribers must not change color projection results.
      }
    }
  }
}

interface BindingColorEvaluation {
  color: string | null;
  ruleIndex: number | null;
  value: DataParameterValue | null;
  reason: DataColorInactiveReason | null;
}

function inactive(reason: DataColorInactiveReason): BindingColorEvaluation {
  return { color: null, ruleIndex: null, value: null, reason };
}

function evaluateBindingColor(
  binding: DataObjectBinding,
  runtime: DataObjectRuntimeState | null
): BindingColorEvaluation {
  const color = binding.color;
  if (!color || !binding.enabled) {
    return inactive("disabled");
  }
  if (!runtime) {
    return inactive("loading");
  }
  if (runtime.status === "missing-device") {
    return inactive("missing-device");
  }
  if (runtime.status === "empty") {
    return inactive("empty");
  }
  if (runtime.status === "error") {
    return inactive("error");
  }
  if (runtime.status !== "ready" && runtime.status !== "partial") {
    return inactive("loading");
  }
  if (!runtime.freshness.fresh) {
    return inactive("stale");
  }
  if (runtime.sourceQuality === "bad" || runtime.sourceQuality === "uncertain") {
    return inactive("quality");
  }
  const field = runtime.fields.find((candidate) => candidate.key === color.propertyKey);
  if (!field || field.status !== "ok" || field.value === null) {
    return inactive("no-value");
  }
  const match = evaluateDataColorRules(color, field.value);
  return {
    color: match?.color ?? null,
    ruleIndex: match?.ruleIndex ?? null,
    value: field.value,
    reason: match ? null : "default"
  };
}

function createObjectState(
  objectNodeId: string,
  source: DataColorSource,
  propertyKey: string,
  value: DataParameterValue | null,
  color: string | null,
  ruleIndex: number | null,
  reason: DataColorInactiveReason | null,
  quality: DataQuality | null,
  capabilities: DataColorObjectCapability
): DataColorObjectState {
  return Object.freeze({
    objectNodeId,
    source,
    status: color !== null ? "applied" : "default",
    propertyKey,
    value,
    color,
    ruleIndex,
    reason,
    quality,
    capabilities
  });
}

function freezeDataColorState(
  previewEnabled: boolean,
  trial: DataColorTrialState | null,
  objects: Record<string, DataColorObjectState>
): DataColorState {
  return Object.freeze({
    previewEnabled,
    trial: trial ? Object.freeze({ ...trial }) : null,
    objects: Object.freeze({ ...objects })
  });
}

function sameDataColorState(left: DataColorState, right: DataColorState): boolean {
  return left.previewEnabled === right.previewEnabled &&
    JSON.stringify(left.trial) === JSON.stringify(right.trial) &&
    JSON.stringify(left.objects) === JSON.stringify(right.objects);
}
