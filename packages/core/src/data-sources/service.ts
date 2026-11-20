import type { JsonValue } from "../snapshot/json";
import type { SceneSnapshot } from "../snapshot/types";
import { DEFAULT_DATA_MAX_RESPONSE_BYTES, MAX_DATA_QUERY_RETRY_BACKOFF_MS } from "./defaults";
import { validateDeviceEndpointResponse } from "./device-response";
import { mapDataQueryBody, type DataMappedEntity, type DataMappingProblem } from "./mapping";
import {
  buildDataQueryRequest,
  type DataQueryDraft,
  type DataQueryParameterOverrides,
  type DataQueryProblem,
  type DataRequestAuth,
  type DataRequestSummary
} from "./query";
import type {
  DataAuthenticationPause,
  DataObjectContextState,
  DataObjectDataState,
  DataObjectDataSubscriber,
  DataObjectHistorySnapshot,
  DataObjectRuntimeProblem,
  DataObjectRuntimeState,
  DataRequestPhase
} from "./object-data";
import {
  evaluateDataResponse,
  type DataQueryResponse,
  type DataResponseDescriptor,
  type DataResponseFailure
} from "./response";
import type {
  DataConnection,
  DataCredentialDescriptor,
  DataDeviceEndpointKind,
  DataObjectBinding,
  DataParameterValue,
  DataQuery,
  DataQueryMethod
} from "./types";

export {
  type DataQueryResponse,
  type DataResponseBodyKind,
  type DataResponseDescriptor,
  type DataResponseFailure,
  type DataResponseFailureCode
} from "./response";

export interface DataRequestDescriptor {
  method: DataQueryMethod;
  readOnly: boolean;
  url: string;
  headers: Readonly<Record<string, string>>;
  body: JsonValue | null;
  auth: DataRequestAuth;
  credentialRef: string | null;
  timeoutMs: number;
  maxResponseBytes: number;
  signal: AbortSignal;
}

export type DataRequestExecutor = (
  request: DataRequestDescriptor
) => Promise<DataResponseDescriptor> | DataResponseDescriptor;

export type DataQueryRunStatus = "running" | "success" | "error" | "cancelled" | "stale";

interface DataQueryRunBase {
  id: string;
  connectionId: string;
  configRevision: number;
  startedAt: number;
  elapsedMs: number | null;
  request: DataRequestSummary | null;
  response: DataQueryResponse | null;
  problems: readonly DataQueryProblem[];
  recordCount?: number;
}

export interface DataQueryRunState extends DataQueryRunBase {
  status: Exclude<DataQueryRunStatus, "stale">;
  completedAt: number | null;
}

export interface DataQueryRunResult extends DataQueryRunBase {
  status: Exclude<DataQueryRunStatus, "running">;
  completedAt: number;
  elapsedMs: number;
  current: boolean;
}

export interface DataQueryRunHandle {
  id: string;
  configRevision: number;
  result: Promise<DataQueryRunResult>;
  cancel(): void;
}

export interface DataQueryDraftExecutionOptions {
  overrides?: DataQueryParameterOverrides;
  deviceEndpoint?: DataDeviceEndpointKind;
}

export interface DataServiceState {
  executorAvailable: boolean;
  configRevision: number;
  run: DataQueryRunState | null;
}

export type DataServiceSubscriber = (state: DataServiceState) => void;

export interface DataHostCapabilities {
  executor?: DataRequestExecutor | null;
  credentials?: readonly DataCredentialDescriptor[];
  authRevision?: number;
  maxResponseBytes?: number | null;
}

export interface EditorDataService {
  getState(): DataServiceState;
  subscribe(subscriber: DataServiceSubscriber): () => void;
  executeQueryDraft(draft: DataQueryDraft, options?: DataQueryDraftExecutionOptions): DataQueryRunHandle;
  cancelQueryRun(runId: string): boolean;
  invalidateQueryRuns(): void;
  getObjectDataState(): DataObjectDataState;
  subscribeObjectData(subscriber: DataObjectDataSubscriber): () => void;
  startPreview(): Promise<void>;
  stopPreview(): void;
  refreshPreview(): Promise<void>;
  getCredentials(): readonly DataCredentialDescriptor[];
  getAuthRevision(): number;
  setHostCapabilities(capabilities: DataHostCapabilities): void;
  readonly disposed: boolean;
  dispose(): void;
}

export interface CoreDataServiceOptions {
  getSnapshot(): Pick<SceneSnapshot, "dataSources">;
  subscribeSnapshot?(listener: () => void): () => void;
  executor?: DataRequestExecutor | null;
  credentials?: readonly DataCredentialDescriptor[];
  authRevision?: number;
  maxResponseBytes?: number | null;
}

interface ActiveRun {
  id: string;
  connectionId: string;
  configRevision: number;
  startedAt: number;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout> | null;
  settled: boolean;
  state: DataQueryRunState;
  resolve(result: DataQueryRunResult): void;
}

interface RunOutcome {
  status: Exclude<DataQueryRunStatus, "running" | "stale">;
  request?: DataRequestSummary | null;
  response?: DataQueryResponse | null;
  problems?: DataQueryProblem[];
  recordCount?: number;
}

interface PreviewBindingRef {
  objectNodeId: string;
  signature: string;
  binding: DataObjectBinding;
}

interface PreviewMappedResult {
  entities: readonly DataMappedEntity[];
  problems: readonly DataMappingProblem[];
  receivedAt: number;
}

interface PreviewContext {
  key: string;
  query: DataQuery;
  connectionId: string;
  queryName: string;
  parameters: Record<string, DataParameterValue>;
  authRevision: number;
  request: DataRequestSummary;
  bindings: Map<string, PreviewBindingRef>;
  phase: DataRequestPhase;
  paused: DataAuthenticationPause | null;
  controller: AbortController | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  pollTimer: ReturnType<typeof setTimeout> | null;
  expiryTimer: ReturnType<typeof setTimeout> | null;
  runToken: number;
  lastAttemptAt: number | null;
  lastCompletedAt: number | null;
  nextRefreshAt: number | null;
  retryBackoffMs: number | null;
  failureCount: number;
  lastResult: PreviewMappedResult | null;
}

type PreviewOutcome =
  | { kind: "success"; result: PreviewMappedResult }
  | { kind: "retry"; problems: readonly DataObjectRuntimeProblem[]; receivedAt: number; retryAfterMs: number | null }
  | { kind: "paused"; status: number; problems: readonly DataObjectRuntimeProblem[] }
  | { kind: "fatal"; problems: readonly DataObjectRuntimeProblem[]; receivedAt: number | null };

const MAX_CONCURRENT_PREVIEW_REQUESTS = 4;

export class CoreDataService implements EditorDataService {
  readonly #getSnapshot: CoreDataServiceOptions["getSnapshot"];
  readonly #subscribers = new Set<DataServiceSubscriber>();
  readonly #objectSubscribers = new Set<DataObjectDataSubscriber>();
  readonly #unsubscribeSnapshot: (() => void) | null;
  readonly #contexts = new Map<string, PreviewContext>();
  readonly #contextQueue: string[] = [];
  readonly #activeContexts = new Set<string>();
  readonly #refreshWaiters: Array<() => void> = [];
  #executor: DataRequestExecutor | null;
  #credentials: readonly DataCredentialDescriptor[];
  #hostRevision: number;
  #maxResponseBytes: number;
  #state: DataServiceState;
  #objectState: DataObjectDataState;
  #objectStates: Record<string, DataObjectRuntimeState> = {};
  #dataSourcesKey: string;
  #runConfigKey: string | undefined;
  #configRevision = 0;
  #current: ActiveRun | null = null;
  #nextRunId = 0;
  #previewEnabled = false;
  #previewLastRefreshAt: number | null = null;
  #reconcilingPreview = false;
  #disposed = false;

  constructor(options: CoreDataServiceOptions) {
    this.#getSnapshot = options.getSnapshot;
    this.#executor = options.executor ?? null;
    this.#credentials = Object.freeze([...(options.credentials ?? [])]);
    this.#hostRevision = options.authRevision ?? 0;
    this.#maxResponseBytes = normalizeMaxResponseBytes(options.maxResponseBytes);
    this.#dataSourcesKey = dataSourcesKey(this.#getSnapshot());
    this.#state = Object.freeze({
      executorAvailable: this.#executor !== null,
      configRevision: 0,
      run: null
    });
    this.#objectState = freezeObjectDataState(false, false, null, {}, {});
    this.#unsubscribeSnapshot = options.subscribeSnapshot?.(() => this.#refreshConfigRevision()) ?? null;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  getState(): DataServiceState {
    return this.#state;
  }

  subscribe(subscriber: DataServiceSubscriber): () => void {
    if (this.#disposed) {
      return () => {};
    }
    this.#subscribers.add(subscriber);
    return () => {
      this.#subscribers.delete(subscriber);
    };
  }

  getCredentials(): readonly DataCredentialDescriptor[] {
    return this.#credentials;
  }

  getAuthRevision(): number {
    return this.#hostRevision;
  }

  setHostCapabilities(capabilities: DataHostCapabilities): void {
    if (this.#disposed) {
      return;
    }
    let authChanged = false;
    if (Object.prototype.hasOwnProperty.call(capabilities, "executor")) {
      const next = capabilities.executor ?? null;
      if (next !== this.#executor) {
        this.#executor = next;
        authChanged = true;
      }
    }
    if (capabilities.credentials !== undefined) {
      const next = Object.freeze([...capabilities.credentials]);
      if (!sameCredentials(next, this.#credentials)) {
        this.#credentials = next;
        authChanged = true;
      }
    }
    if (capabilities.maxResponseBytes !== undefined) {
      // The response limit is not part of the auth context: existing values stay
      // valid and the new limit only applies to later evaluations.
      this.#maxResponseBytes = normalizeMaxResponseBytes(capabilities.maxResponseBytes);
    }
    const nextRevision = Math.max(
      this.#hostRevision + (authChanged ? 1 : 0),
      capabilities.authRevision ?? 0
    );
    if (!authChanged && nextRevision === this.#hostRevision) {
      return;
    }
    this.#hostRevision = nextRevision;

    this.#invalidateActive();
    this.#cancelAllContexts();
    this.#objectStates = {};
    this.#previewLastRefreshAt = null;
    if (this.#previewEnabled) {
      void this.#reconcilePreview("host");
    } else {
      this.#publishObjectState();
    }
    this.#publish({
      executorAvailable: this.#executor !== null,
      configRevision: this.#configRevision,
      run: null
    });
  }

  executeQueryDraft(draft: DataQueryDraft, options: DataQueryDraftExecutionOptions = {}): DataQueryRunHandle {
    const runId = `data-query-run-${++this.#nextRunId}`;
    if (this.#disposed) {
      return disposedHandle(runId, draft.connectionId, this.#configRevision);
    }

    this.#invalidateActive();
    const controller = new AbortController();
    const startedAt = Date.now();
    let resolve!: (result: DataQueryRunResult) => void;
    const result = new Promise<DataQueryRunResult>((settle) => {
      resolve = settle;
    });
    const active: ActiveRun = {
      id: runId,
      connectionId: draft.connectionId,
      configRevision: this.#configRevision,
      startedAt,
      controller,
      timer: null,
      settled: false,
      state: {
        id: runId,
        connectionId: draft.connectionId,
        status: "running",
        configRevision: this.#configRevision,
        startedAt,
        completedAt: null,
        elapsedMs: null,
        request: null,
        response: null,
        problems: []
      },
      resolve
    };
    this.#current = active;
    this.#runConfigKey = dataSourcesRunKey(this.#getSnapshot(), draft.connectionId);
    this.#publish({ ...this.#state, run: active.state });
    void this.#execute(active, draft, options);

    return {
      id: runId,
      configRevision: active.configRevision,
      result,
      cancel: () => {
        this.cancelQueryRun(runId);
      }
    };
  }

  cancelQueryRun(runId: string): boolean {
    const active = this.#current;
    if (!active || active.id !== runId || active.settled) {
      return false;
    }
    active.controller.abort();
    this.#finish(active, {
      status: "cancelled",
      request: active.state.request,
      response: active.state.response,
      problems: [{
        code: "request-aborted",
        field: "request",
        connectionId: active.connectionId,
        message: "The request was cancelled."
      }]
    });
    return true;
  }

  invalidateQueryRuns(): void {
    this.#invalidateActive();
    if (this.#state.run !== null) {
      this.#publish({ ...this.#state, run: null });
    }
  }

  getObjectDataState(): DataObjectDataState {
    return this.#objectState;
  }

  subscribeObjectData(subscriber: DataObjectDataSubscriber): () => void {
    if (this.#disposed) {
      return () => {};
    }
    this.#objectSubscribers.add(subscriber);
    this.#notifyObjectSubscriber(subscriber);
    return () => {
      this.#objectSubscribers.delete(subscriber);
    };
  }

  startPreview(): Promise<void> {
    if (this.#disposed) {
      return Promise.resolve();
    }
    this.#previewEnabled = true;
    return this.#reconcilePreview("start");
  }

  stopPreview(): void {
    if (this.#disposed) {
      return;
    }
    this.#previewEnabled = false;
    this.#previewLastRefreshAt = null;
    this.#cancelAllContexts();
    this.#objectStates = {};
    this.#resolveRefreshWaiters();
    this.#publishObjectState();
  }

  refreshPreview(): Promise<void> {
    if (this.#disposed || !this.#previewEnabled) {
      return Promise.resolve();
    }
    return this.#reconcilePreview("refresh");
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#previewEnabled = false;
    this.#previewLastRefreshAt = null;
    this.#cancelAllContexts();
    this.#objectStates = {};
    this.#objectState = freezeObjectDataState(false, false, null, {}, {});
    this.#resolveRefreshWaiters();
    this.#unsubscribeSnapshot?.();
    this.#invalidateActive();
    this.#subscribers.clear();
    this.#objectSubscribers.clear();
    this.#state = Object.freeze({
      executorAvailable: this.#executor !== null,
      configRevision: this.#configRevision,
      run: null
    });
  }

  #reconcilePreview(trigger: "start" | "refresh" | "config" | "host"): Promise<void> {
    if (this.#disposed || !this.#previewEnabled) {
      return Promise.resolve();
    }
    this.#reconcilingPreview = true;
    const runNewContexts = trigger === "start" || trigger === "refresh";
    const snapshot = this.#getSnapshot();
    const now = Date.now();
    const objectContexts = new Map<string, PreviewContext>();
    const createdContexts: PreviewContext[] = [];
    const seenObjects = new Set<string>();
    const bindings = Object.values(snapshot.dataSources.bindings)
      .filter((binding) => binding.enabled)
      .sort((left, right) => left.objectNodeId.localeCompare(right.objectNodeId));

    for (const binding of bindings) {
      seenObjects.add(binding.objectNodeId);
      const previousState = this.#objectStates[binding.objectNodeId] ?? null;
      const query = snapshot.dataSources.queries[binding.queryId];
      if (!query) {
        this.#objectStates[binding.objectNodeId] = errorBindingState(binding, [{
          kind: "binding",
          code: "query-missing",
          message: `Query ${binding.queryId} does not exist.`
        }], queryMaxAge(query));
        continue;
      }
      const built = buildDataQueryRequest(snapshot, query, { overrides: binding.parameterOverrides });
      if (!built.ok) {
        this.#objectStates[binding.objectNodeId] = errorBindingState(binding, built.problems.map((problem) => ({
          kind: problem.field === "parameters" ? "parameters" : "request",
          code: problem.code,
          message: problem.message,
          ...(problem.parameterName ? { parameterName: problem.parameterName } : {}),
          ...(problem.status !== undefined ? { status: problem.status } : {})
        })), queryMaxAge(query));
        continue;
      }
      if (!this.#executor) {
        this.#objectStates[binding.objectNodeId] = errorBindingState(binding, [{
          kind: "request",
          code: "executor-unavailable",
          message: "No host request executor is configured."
        }], queryMaxAge(query));
        continue;
      }
      const credentialProblem = this.#credentialProblem(query.connectionId, built.summary.credentialRef);
      if (credentialProblem) {
        this.#objectStates[binding.objectNodeId] = errorBindingState(binding, [{
          kind: "request",
          code: credentialProblem.code,
          message: credentialProblem.message
        }], queryMaxAge(query));
        continue;
      }

      const connection = snapshot.dataSources.connections[query.connectionId];
      const key = previewContextKey(query, connection, built.summary, this.#hostRevision);
      let context = this.#contexts.get(key);
      if (!context) {
        context = {
          key,
          query,
          connectionId: query.connectionId,
          queryName: query.name,
          parameters: { ...built.summary.parameters },
          authRevision: this.#hostRevision,
          request: built.summary,
          bindings: new Map(),
          phase: runNewContexts || query.method !== "POST" ? "idle" : "waiting",
          paused: null,
          controller: null,
          timeoutTimer: null,
          pollTimer: null,
          expiryTimer: null,
          runToken: 0,
          lastAttemptAt: null,
          lastCompletedAt: null,
          nextRefreshAt: null,
          retryBackoffMs: null,
          failureCount: 0,
          lastResult: null
        };
        this.#contexts.set(key, context);
        createdContexts.push(context);
      } else {
        context.query = query;
        context.queryName = query.name;
        context.request = built.summary;
        context.parameters = { ...built.summary.parameters };
      }
      objectContexts.set(binding.objectNodeId, context);

      const signature = JSON.stringify(binding);
      const previousRef = context.bindings.get(binding.objectNodeId);
      const signatureChanged = !previousRef || previousRef.signature !== signature;
      context.bindings.set(binding.objectNodeId, {
        objectNodeId: binding.objectNodeId,
        signature,
        binding
      });

      if (signatureChanged || !previousState || previousState.contextKey !== key) {
        const history = signatureChanged ? null : previousState?.history ?? null;
        if (context.lastResult) {
          this.#applyMappedResult(context, binding, context.lastResult, { history });
        } else {
          const awaitingManualPost = context.query.method === "POST" && context.phase === "waiting";
          this.#objectStates[binding.objectNodeId] = createRuntimeState(
            binding,
            awaitingManualPost ? "inactive" : "loading",
            {
              contextKey: context.key,
              phase: context.phase,
              refreshing: context.phase === "requesting",
              paused: context.paused,
              nextRefreshAt: context.nextRefreshAt,
              history
            },
            now,
            queryMaxAge(query)
          );
        }
      } else {
        this.#objectStates[binding.objectNodeId] = withContextState(previousState, context, now);
      }
    }

    for (const context of [...this.#contexts.values()]) {
      for (const objectNodeId of context.bindings.keys()) {
        if (objectContexts.get(objectNodeId) !== context) {
          context.bindings.delete(objectNodeId);
        }
      }
      if (context.bindings.size === 0) {
        this.#cancelContext(context);
      }
    }
    for (const objectNodeId of Object.keys(this.#objectStates)) {
      if (!seenObjects.has(objectNodeId)) {
        delete this.#objectStates[objectNodeId];
      }
    }

    if (runNewContexts) {
      for (const context of this.#contexts.values()) {
        if (createdContexts.includes(context)) {
          continue;
        }
        if (context.phase === "requesting") {
          continue;
        }
        this.#enqueueContext(context);
      }
    }
    for (const context of createdContexts) {
      if (runNewContexts || context.query.method !== "POST") {
        this.#enqueueContext(context);
      }
    }

    this.#publishObjectState();
    this.#reconcilingPreview = false;
    if (runNewContexts) {
      return this.#waitForRunningContexts();
    }
    this.#flushRefreshWaitersIfIdle();
    return Promise.resolve();
  }

  #enqueueContext(context: PreviewContext): void {
    if (this.#disposed || !this.#previewEnabled) {
      return;
    }
    if (this.#contexts.get(context.key) !== context) {
      return;
    }
    if (context.phase === "queued" || context.phase === "requesting") {
      return;
    }
    this.#clearContextSchedule(context);
    context.paused = null;
    context.nextRefreshAt = null;
    context.phase = "queued";
    if (!this.#contextQueue.includes(context.key)) {
      this.#contextQueue.push(context.key);
    }
    this.#syncContextObjects(context);
    this.#publishObjectState();
    this.#pumpContextQueue();
  }

  #pumpContextQueue(): void {
    while (!this.#disposed && this.#activeContexts.size < MAX_CONCURRENT_PREVIEW_REQUESTS) {
      const key = this.#contextQueue.shift();
      if (key === undefined) {
        break;
      }
      const context = this.#contexts.get(key);
      if (!context || context.phase !== "queued") {
        continue;
      }
      void this.#runContext(context);
    }
    this.#flushRefreshWaitersIfIdle();
  }

  async #runContext(context: PreviewContext): Promise<void> {
    if (
      this.#disposed ||
      !this.#previewEnabled ||
      this.#contexts.get(context.key) !== context ||
      context.phase !== "queued"
    ) {
      return;
    }
    const token = ++context.runToken;
    const controller = new AbortController();
    context.controller = controller;
    context.phase = "requesting";
    context.paused = null;
    context.nextRefreshAt = null;
    context.lastAttemptAt = Date.now();
    this.#activeContexts.add(context.key);
    this.#syncContextObjects(context);
    this.#publishObjectState();
    if (!this.#isCurrentRun(context, token)) {
      return;
    }

    context.timeoutTimer = setTimeout(() => {
      if (context.runToken !== token || context.phase !== "requesting") {
        return;
      }
      controller.abort();
      this.#completeContext(context, token, transportFailureOutcome(context, {
        kind: "request",
        code: "request-timeout",
        message: `The request exceeded ${context.request.timeoutMs} ms.`
      }));
    }, context.request.timeoutMs);

    let descriptor: DataResponseDescriptor | null;
    try {
      const aborted = new Promise<null>((resolve) => {
        if (controller.signal.aborted) {
          resolve(null);
          return;
        }
        controller.signal.addEventListener("abort", () => resolve(null), { once: true });
      });
      descriptor = await Promise.race([
        this.#executor!({
          method: context.request.method,
          readOnly: context.request.readOnly,
          url: context.request.url,
          headers: context.request.headers,
          body: context.request.body,
          auth: context.request.auth,
          credentialRef: context.request.credentialRef,
          timeoutMs: context.request.timeoutMs,
          maxResponseBytes: this.#maxResponseBytes,
          signal: controller.signal
        }),
        aborted
      ]);
    } catch (error) {
      if (!this.#isCurrentRun(context, token)) {
        return;
      }
      this.#completeContext(context, token, transportFailureOutcome(context, {
        kind: "request",
        code: "request-failed",
        message: error instanceof Error ? error.message : String(error)
      }));
      return;
    }
    if (descriptor === null || !this.#isCurrentRun(context, token)) {
      return;
    }
    this.#completeContext(context, token, this.#interpretResponse(context, descriptor));
  }

  #interpretResponse(context: PreviewContext, descriptor: DataResponseDescriptor): PreviewOutcome {
    const receivedAt = Date.now();
    const evaluation = evaluateDataResponse(descriptor, {
      receivedAt,
      maxResponseBytes: this.#maxResponseBytes,
      successCondition: context.query.successCondition
    });
    if (evaluation.kind === "failure") {
      return responseFailureOutcome(evaluation.failure, context.query.method);
    }
    if (evaluation.kind === "empty") {
      return {
        kind: "success",
        result: { entities: [], problems: [], receivedAt }
      };
    }

    const mapped = mapDataQueryBody(context.query.mapping, evaluation.json, {
      connectionId: context.query.connectionId,
      queryId: context.query.id,
      executionId: `preview-${context.runToken}-${Date.now()}`,
      receivedAt,
      parameters: context.request.parameters
    });
    if (!mapped.ok) {
      return {
        kind: "fatal",
        receivedAt,
        problems: mappingRuntimeProblems(mapped.errors)
      };
    }
    if (mapped.entities.length === 0 && mapped.problems.length > 0) {
      return {
        kind: "fatal",
        receivedAt,
        problems: mappingRuntimeProblems(mapped.problems)
      };
    }
    return {
      kind: "success",
      result: {
        entities: mapped.entities,
        problems: mapped.problems,
        receivedAt
      }
    };
  }

  #completeContext(context: PreviewContext, token: number, outcome: PreviewOutcome): void {
    if (!this.#isCurrentRun(context, token)) {
      return;
    }
    const now = Date.now();
    if (context.timeoutTimer !== null) {
      clearTimeout(context.timeoutTimer);
      context.timeoutTimer = null;
    }
    context.controller = null;
    context.runToken += 1;
    this.#activeContexts.delete(context.key);
    context.lastCompletedAt = now;
    this.#previewLastRefreshAt = now;

    if (outcome.kind === "success") {
      context.lastResult = outcome.result;
      context.failureCount = 0;
      context.retryBackoffMs = null;
      context.paused = null;
      context.phase = "waiting";
      for (const ref of context.bindings.values()) {
        const previous = this.#objectStates[ref.objectNodeId] ?? null;
        this.#applyMappedResult(context, ref.binding, outcome.result, {
          history: historyFromState(previous)
        });
      }
      this.#scheduleNextPoll(context, context.query.updatePolicy.refreshIntervalMs);
    } else if (outcome.kind === "retry") {
      context.lastResult = null;
      context.failureCount += 1;
      const backoff = Math.min(
        MAX_DATA_QUERY_RETRY_BACKOFF_MS,
        context.query.updatePolicy.refreshIntervalMs * 2 ** Math.min(context.failureCount - 1, 16)
      );
      const delay = Math.max(backoff, outcome.retryAfterMs ?? 0);
      context.retryBackoffMs = delay;
      context.paused = null;
      context.phase = "waiting";
      this.#failContextBindings(context, outcome.problems, outcome.receivedAt, "waiting", null);
      this.#scheduleNextPoll(context, delay);
    } else if (outcome.kind === "paused") {
      context.lastResult = null;
      context.failureCount = 0;
      context.retryBackoffMs = null;
      context.paused = { kind: "authentication", status: outcome.status };
      context.phase = "paused";
      this.#failContextBindings(context, outcome.problems, null, "paused", context.paused);
    } else {
      context.lastResult = null;
      context.failureCount = 0;
      context.retryBackoffMs = null;
      context.paused = null;
      context.phase = "waiting";
      this.#failContextBindings(context, outcome.problems, outcome.receivedAt, "waiting", null);
    }

    this.#publishObjectState();
    this.#pumpContextQueue();
  }

  #applyMappedResult(
    context: PreviewContext,
    binding: DataObjectBinding,
    result: PreviewMappedResult,
    options: { history: DataObjectHistorySnapshot | null }
  ): void {
    const now = Date.now();
    const relevantProblems = mappingRuntimeProblems(result.problems
      .filter((problem) => problem.entityId === undefined || problem.entityId === binding.deviceId));
    if (result.entities.length === 0) {
      this.#objectStates[binding.objectNodeId] = createRuntimeState(binding, "empty", {
        contextKey: context.key,
        phase: context.phase,
        paused: context.paused,
        nextRefreshAt: context.nextRefreshAt,
        receivedAt: result.receivedAt,
        history: options.history,
        problems: relevantProblems
      }, now, context.query.updatePolicy.maxAgeMs);
      return;
    }

    const entity = result.entities.find((candidate) => candidate.entityId === binding.deviceId) ?? null;
    if (!entity) {
      this.#objectStates[binding.objectNodeId] = createRuntimeState(binding, "missing-device", {
        contextKey: context.key,
        phase: context.phase,
        paused: context.paused,
        nextRefreshAt: context.nextRefreshAt,
        receivedAt: result.receivedAt,
        history: options.history,
        problems: [{
          kind: "device",
          code: "device-missing",
          message: `Device ${binding.deviceId} is not present in the current result.`
        }, ...relevantProblems]
      }, now, context.query.updatePolicy.maxAgeMs);
      return;
    }

    const allDetailsValid = binding.details.every((detail) =>
      entity.fields.find((field) => field.key === detail.key)?.status === "ok"
    );
    this.#objectStates[binding.objectNodeId] = createRuntimeState(
      binding,
      allDetailsValid ? "ready" : "partial",
      {
        contextKey: context.key,
        phase: context.phase,
        paused: context.paused,
        nextRefreshAt: context.nextRefreshAt,
        receivedAt: result.receivedAt,
        history: mergeHistorySnapshot(entity, options.history),
        entityId: entity.entityId,
        displayName: entity.displayName,
        fields: entity.fields,
        observedAt: entity.observedAt,
        sourceQuality: entity.sourceQuality,
        observedAtProblem: entity.observedAtProblem,
        qualityProblem: entity.qualityProblem,
        problems: relevantProblems
      },
      now,
      context.query.updatePolicy.maxAgeMs
    );
  }

  #failContextBindings(
    context: PreviewContext,
    problems: readonly DataObjectRuntimeProblem[],
    receivedAt: number | null,
    phase: DataRequestPhase,
    paused: DataAuthenticationPause | null
  ): void {
    const now = Date.now();
    for (const ref of context.bindings.values()) {
      const previous = this.#objectStates[ref.objectNodeId] ?? null;
      this.#objectStates[ref.objectNodeId] = createRuntimeState(ref.binding, "error", {
        contextKey: context.key,
        phase,
        paused,
        nextRefreshAt: context.nextRefreshAt,
        receivedAt,
        history: historyFromState(previous),
        problems
      }, now, context.query.updatePolicy.maxAgeMs);
    }
  }

  #scheduleNextPoll(context: PreviewContext, delay: number): void {
    this.#clearPollTimer(context);
    if (context.query.method === "POST") {
      // Read-only POST queries run only for manual tests, first preview, or explicit refresh.
      context.nextRefreshAt = null;
      context.retryBackoffMs = null;
      return;
    }
    const now = Date.now();
    context.nextRefreshAt = now + delay;
    context.pollTimer = setTimeout(() => {
      context.pollTimer = null;
      if (this.#contexts.get(context.key) !== context || this.#disposed || !this.#previewEnabled) {
        return;
      }
      if (context.phase !== "waiting") {
        return;
      }
      this.#enqueueContext(context);
    }, clampDelay(delay));
  }

  #syncContextObjects(context: PreviewContext): void {
    const now = Date.now();
    for (const ref of context.bindings.values()) {
      const state = this.#objectStates[ref.objectNodeId];
      if (!state) {
        continue;
      }
      this.#objectStates[ref.objectNodeId] = withContextState(state, context, now);
    }
    this.#scheduleContextExpiry(context);
  }

  #scheduleContextExpiry(context: PreviewContext): void {
    if (context.expiryTimer !== null) {
      clearTimeout(context.expiryTimer);
      context.expiryTimer = null;
    }
    const now = Date.now();
    let nextExpiry: number | null = null;
    for (const objectNodeId of context.bindings.keys()) {
      const state = this.#objectStates[objectNodeId];
      const expiry = state?.freshness.expiresAt ?? null;
      if (
        expiry !== null &&
        state?.freshness.fresh &&
        expiry > now &&
        (nextExpiry === null || expiry < nextExpiry)
      ) {
        nextExpiry = expiry;
      }
    }
    if (nextExpiry === null || this.#disposed) {
      return;
    }
    context.expiryTimer = setTimeout(() => {
      context.expiryTimer = null;
      if (this.#contexts.get(context.key) !== context || this.#disposed) {
        return;
      }
      this.#syncContextObjects(context);
      this.#publishObjectState();
    }, clampDelay(nextExpiry - now));
  }

  #isCurrentRun(context: PreviewContext, token: number): boolean {
    return !this.#disposed &&
      this.#previewEnabled &&
      this.#contexts.get(context.key) === context &&
      context.runToken === token &&
      context.phase === "requesting";
  }

  #cancelContext(context: PreviewContext): void {
    this.#contexts.delete(context.key);
    this.#abortContext(context);
    this.#pumpContextQueue();
  }

  #cancelAllContexts(): void {
    this.#contextQueue.length = 0;
    for (const context of [...this.#contexts.values()]) {
      this.#abortContext(context);
    }
    this.#contexts.clear();
    this.#activeContexts.clear();
  }

  #abortContext(context: PreviewContext): void {
    context.runToken += 1;
    this.#clearContextSchedule(context);
    if (context.controller) {
      context.controller.abort();
      context.controller = null;
    }
    this.#activeContexts.delete(context.key);
    const index = this.#contextQueue.indexOf(context.key);
    if (index >= 0) {
      this.#contextQueue.splice(index, 1);
    }
  }

  #clearContextSchedule(context: PreviewContext): void {
    if (context.timeoutTimer !== null) {
      clearTimeout(context.timeoutTimer);
      context.timeoutTimer = null;
    }
    this.#clearPollTimer(context);
    if (context.expiryTimer !== null) {
      clearTimeout(context.expiryTimer);
      context.expiryTimer = null;
    }
  }

  #clearPollTimer(context: PreviewContext): void {
    if (context.pollTimer !== null) {
      clearTimeout(context.pollTimer);
      context.pollTimer = null;
    }
  }

  #waitForRunningContexts(): Promise<void> {
    if (!this.#hasQueuedOrRunningContexts()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.#refreshWaiters.push(resolve);
    });
  }

  #hasQueuedOrRunningContexts(): boolean {
    if (this.#contextQueue.length > 0 || this.#activeContexts.size > 0) {
      return true;
    }
    for (const context of this.#contexts.values()) {
      if (context.phase === "queued" || context.phase === "requesting") {
        return true;
      }
    }
    return false;
  }

  #flushRefreshWaitersIfIdle(): void {
    if (this.#reconcilingPreview || this.#hasQueuedOrRunningContexts()) {
      return;
    }
    this.#resolveRefreshWaiters();
  }

  #resolveRefreshWaiters(): void {
    const waiters = this.#refreshWaiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
  }

  #publishObjectState(): void {
    const now = Date.now();
    const contexts: Record<string, DataObjectContextState> = {};
    for (const context of this.#contexts.values()) {
      contexts[context.key] = Object.freeze({
        key: context.key,
        queryId: context.query.id,
        connectionId: context.connectionId,
        queryName: context.queryName,
        method: context.query.method,
        parameters: Object.freeze({ ...context.parameters }),
        objectNodeIds: Object.freeze([...context.bindings.keys()]),
        phase: context.phase,
        paused: context.paused,
        nextRefreshAt: context.nextRefreshAt,
        retryBackoffMs: context.retryBackoffMs,
        lastAttemptAt: context.lastAttemptAt,
        lastCompletedAt: context.lastCompletedAt,
        authRevision: context.authRevision
      });
    }
    const refreshedObjects: Record<string, DataObjectRuntimeState> = {};
    for (const [objectNodeId, state] of Object.entries(this.#objectStates)) {
      const context = this.#contexts.get(state.contextKey);
      refreshedObjects[objectNodeId] = context
        ? withContextState(state, context, now)
        : state;
    }
    this.#objectStates = refreshedObjects;
    this.#objectState = freezeObjectDataState(
      this.#previewEnabled,
      this.#hasQueuedOrRunningContexts(),
      this.#previewLastRefreshAt,
      contexts,
      this.#objectStates
    );
    for (const context of this.#contexts.values()) {
      this.#scheduleContextExpiry(context);
    }
    for (const subscriber of [...this.#objectSubscribers]) {
      this.#notifyObjectSubscriber(subscriber);
    }
  }

  #notifyObjectSubscriber(subscriber: DataObjectDataSubscriber): void {
    try {
      subscriber(this.#objectState);
    } catch {
      // Runtime subscribers must not affect request lifecycle results.
    }
  }

  async #execute(
    active: ActiveRun,
    draft: DataQueryDraft,
    options: DataQueryDraftExecutionOptions
  ): Promise<void> {
    // A running-state subscriber can synchronously cancel, invalidate, or dispose this run.
    if (active.settled) {
      return;
    }
    const built = buildDataQueryRequest(this.#getSnapshot(), draft, { overrides: options.overrides });
    if (!built.ok) {
      this.#finish(active, { status: "error", problems: built.problems });
      return;
    }
    const requestSummary = built.summary;
    active.state = { ...active.state, request: requestSummary };

    if (!this.#executor) {
      this.#finish(active, {
        status: "error",
        request: requestSummary,
        problems: [{
          code: "executor-unavailable",
          field: "executor",
          connectionId: active.connectionId,
          message: "No host request executor is configured."
        }]
      });
      return;
    }

    const credentialProblem = this.#credentialProblem(active.connectionId, requestSummary.credentialRef);
    if (credentialProblem) {
      this.#finish(active, {
        status: "error",
        request: requestSummary,
        problems: [credentialProblem]
      });
      return;
    }

    const request: DataRequestDescriptor = Object.freeze({
      method: requestSummary.method,
      readOnly: requestSummary.readOnly,
      url: requestSummary.url,
      headers: requestSummary.headers,
      body: requestSummary.body,
      auth: requestSummary.auth,
      credentialRef: requestSummary.credentialRef,
      timeoutMs: requestSummary.timeoutMs,
      maxResponseBytes: this.#maxResponseBytes,
      signal: active.controller.signal
    });

    active.timer = setTimeout(() => {
      if (active.settled) {
        return;
      }
      active.controller.abort();
      this.#finish(active, {
        status: "error",
        request: requestSummary,
        problems: [{
          code: "request-timeout",
          field: "request",
          connectionId: active.connectionId,
          message: `The request exceeded ${requestSummary.timeoutMs} ms.`
        }]
      });
    }, requestSummary.timeoutMs);

    let responseDescriptor: DataResponseDescriptor;
    try {
      responseDescriptor = await this.#executor(request);
    } catch (error) {
      if (active.settled) {
        return;
      }
      this.#finish(active, {
        status: "error",
        request: requestSummary,
        problems: [{
          code: "request-failed",
          field: "request",
          connectionId: active.connectionId,
          message: error instanceof Error ? error.message : String(error)
        }]
      });
      return;
    }
    if (active.settled) {
      return;
    }

    const receivedAt = Date.now();
    const evaluation = evaluateDataResponse(responseDescriptor, {
      receivedAt,
      maxResponseBytes: this.#maxResponseBytes,
      successCondition: requestSummary.successCondition
    });
    if (evaluation.kind === "failure") {
      this.#finish(active, {
        status: "error",
        request: requestSummary,
        response: evaluation.failure.response,
        problems: [{
          code: evaluation.failure.code,
          field: "response",
          connectionId: active.connectionId,
          ...(evaluation.failure.status !== null ? { status: evaluation.failure.status } : {}),
          message: evaluation.failure.message
        }]
      });
      return;
    }
    const validation = options.deviceEndpoint
      ? validateDeviceEndpointResponse(options.deviceEndpoint, evaluation.kind === "success" ? evaluation.json : undefined)
      : null;
    if (validation && !validation.ok) {
      this.#finish(active, {
        status: "error",
        request: requestSummary,
        response: evaluation.response,
        problems: [{
          code: "response-device-contract",
          field: "response",
          connectionId: active.connectionId,
          responsePath: validation.path,
          message: `The response does not match the device interface at ${validation.path}.`
        }]
      });
      return;
    }
    this.#finish(active, {
      status: "success",
      request: requestSummary,
      response: evaluation.response,
      problems: [],
      ...(validation ? { recordCount: validation.count } : {})
    });
  }

  #credentialProblem(connectionId: string, credentialRef: string | null): DataQueryProblem | null {
    if (!credentialRef) {
      return null;
    }
    const descriptor = this.#credentials.find((credential) => credential.ref === credentialRef);
    if (descriptor?.available) {
      return null;
    }
    return {
      code: "credential-unavailable",
      field: "credential",
      connectionId,
      credentialRef,
      message: `Credential ${credentialRef} is not available from the host.`
    };
  }

  #finish(active: ActiveRun, outcome: RunOutcome): void {
    if (active.settled) {
      return;
    }
    active.settled = true;
    if (active.timer !== null) {
      clearTimeout(active.timer);
      active.timer = null;
    }
    const completedAt = Date.now();
    const elapsedMs = Math.max(0, completedAt - active.startedAt);
    const state: DataQueryRunState = {
      ...active.state,
      status: outcome.status,
      completedAt,
      elapsedMs,
      request: outcome.request === undefined ? active.state.request : outcome.request,
      response: outcome.response === undefined ? active.state.response : outcome.response,
      ...(outcome.recordCount === undefined ? {} : { recordCount: outcome.recordCount }),
      problems: Object.freeze([...(outcome.problems ?? [])])
    };
    active.state = state;
    const current = this.#current === active && !this.#disposed;
    if (this.#current === active) {
      this.#current = null;
      this.#publish({ ...this.#state, run: state });
    }
    active.resolve(Object.freeze({ ...state, status: outcome.status, current, completedAt, elapsedMs }));
  }

  #invalidateActive(): void {
    const active = this.#current;
    this.#current = null;
    if (!active || active.settled) {
      return;
    }
    active.settled = true;
    if (active.timer !== null) {
      clearTimeout(active.timer);
      active.timer = null;
    }
    active.controller.abort();
    active.resolve(Object.freeze({
      ...active.state,
      status: "stale",
      current: false,
      completedAt: Date.now(),
      elapsedMs: Math.max(0, Date.now() - active.startedAt)
    }));
  }

  #refreshConfigRevision(): void {
    if (this.#disposed) {
      return;
    }
    const snapshot = this.#getSnapshot();
    const nextKey = dataSourcesKey(snapshot);
    if (nextKey === this.#dataSourcesKey) {
      return;
    }
    this.#dataSourcesKey = nextKey;
    this.#configRevision += 1;
    const runConnectionId = this.#current?.connectionId ?? this.#state.run?.connectionId;
    const invalidated = runConnectionId !== undefined &&
      dataSourcesRunKey(snapshot, runConnectionId) !== this.#runConfigKey;
    if (invalidated) {
      this.#invalidateActive();
    }
    if (this.#previewEnabled) {
      void this.#reconcilePreview("config");
    } else {
      const state = this.#objectStates;
      this.#objectStates = Object.fromEntries(
        Object.entries(state).filter(([, runtime]) => {
          const binding = snapshot.dataSources.bindings[runtime.objectNodeId];
          return Boolean(binding?.enabled) &&
            binding?.queryId === runtime.queryId &&
            binding?.deviceId === runtime.deviceId;
        })
      );
      this.#publishObjectState();
    }
    this.#publish({
      executorAvailable: this.#executor !== null,
      configRevision: this.#configRevision,
      run: invalidated ? null : this.#state.run
    });
  }

  #publish(state: DataServiceState): void {
    this.#state = Object.freeze({
      executorAvailable: state.executorAvailable,
      configRevision: state.configRevision,
      run: state.run
    });
    for (const subscriber of [...this.#subscribers]) {
      try {
        subscriber(this.#state);
      } catch {
        // Runtime subscribers must not affect request lifecycle results.
      }
    }
  }
}

function previewContextKey(
  query: DataQuery,
  connection: DataConnection | undefined,
  request: DataRequestSummary,
  authRevision: number
): string {
  return stableJson({
    queryId: query.id,
    connectionId: query.connectionId,
    query: {
      method: query.method,
      readOnly: query.readOnly,
      path: query.path,
      headers: query.headers,
      parameters: query.parameters,
      successCondition: query.successCondition,
      mapping: query.mapping,
      updatePolicy: query.updatePolicy
    },
    connection: connection
      ? {
          baseUrl: connection.baseUrl,
          auth: connection.auth,
          headers: connection.headers,
          timeoutMs: connection.timeoutMs
        }
      : null,
    parameters: request.parameters,
    authRevision
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sameCredentials(
  left: readonly DataCredentialDescriptor[],
  right: readonly DataCredentialDescriptor[]
): boolean {
  return left.length === right.length && left.every((credential, index) =>
    credential.ref === right[index]?.ref &&
    credential.label === right[index]?.label &&
    credential.available === right[index]?.available
  );
}

function dataSourcesKey(snapshot: Pick<SceneSnapshot, "dataSources">): string {
  return JSON.stringify(snapshot.dataSources);
}

function dataSourcesRunKey(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  connectionId: string
): string {
  return stableJson({
    connection: snapshot.dataSources.connections[connectionId] ?? null,
    queries: Object.values(snapshot.dataSources.queries)
      .filter((query) => query.connectionId === connectionId)
      .sort((left, right) => left.id.localeCompare(right.id))
  });
}

function withContextState(
  state: DataObjectRuntimeState,
  context: PreviewContext,
  now: number
): DataObjectRuntimeState {
  return createRuntimeState(state, state.status, {
    ...state,
    contextKey: context.key,
    phase: context.phase,
    refreshing: context.phase === "requesting",
    paused: context.paused,
    nextRefreshAt: context.nextRefreshAt
  }, now, context.query.updatePolicy.maxAgeMs);
}

function createRuntimeState(
  binding: Pick<DataObjectBinding, "objectNodeId" | "queryId" | "deviceId" | "enabled">,
  status: DataObjectRuntimeState["status"],
  patch: Partial<DataObjectRuntimeState> = {},
  now = Date.now(),
  maxAgeMs = patch.freshness?.maxAgeMs ?? 0
): DataObjectRuntimeState {
  const receivedAt = patch.receivedAt ?? null;
  const observedAt = patch.observedAt ?? null;
  const observedAtProblem = patch.observedAtProblem ?? null;
  const hasCurrentValues = status === "ready" || status === "partial";
  const receivedAgeMs = receivedAt === null ? null : Math.max(0, now - receivedAt);
  const observedAgeMs = observedAt === null ? null : Math.max(0, now - observedAt);
  const expiryCandidates: number[] = [];
  if (hasCurrentValues && receivedAt !== null && maxAgeMs > 0) {
    expiryCandidates.push(receivedAt + maxAgeMs);
  }
  if (
    hasCurrentValues &&
    observedAt !== null &&
    observedAtProblem === null &&
    maxAgeMs > 0
  ) {
    expiryCandidates.push(observedAt + maxAgeMs);
  }
  const expiresAt = expiryCandidates.length > 0 ? Math.min(...expiryCandidates) : null;
  const fresh = hasCurrentValues &&
    receivedAt !== null &&
    maxAgeMs > 0 &&
    receivedAgeMs !== null &&
    receivedAgeMs < maxAgeMs &&
    (observedAt === null || observedAtProblem !== null || (observedAgeMs !== null && observedAgeMs < maxAgeMs));

  return Object.freeze({
    objectNodeId: binding.objectNodeId,
    queryId: binding.queryId,
    deviceId: binding.deviceId,
    enabled: binding.enabled,
    status,
    contextKey: patch.contextKey ?? "",
    phase: patch.phase ?? "idle",
    refreshing: patch.refreshing ?? patch.phase === "requesting",
    paused: patch.paused ?? null,
    nextRefreshAt: patch.nextRefreshAt ?? null,
    freshness: Object.freeze({
      fresh,
      maxAgeMs,
      receivedAgeMs,
      observedAgeMs,
      expiresAt
    }),
    history: patch.history ?? null,
    entityId: patch.entityId ?? null,
    displayName: patch.displayName ?? null,
    fields: Object.freeze([...(patch.fields ?? [])]),
    observedAt,
    receivedAt,
    sourceQuality: patch.sourceQuality ?? null,
    observedAtProblem,
    qualityProblem: patch.qualityProblem ?? null,
    problems: Object.freeze([...(patch.problems ?? [])])
  });
}

function mappingRuntimeProblems(
  problems: readonly DataMappingProblem[]
): DataObjectRuntimeProblem[] {
  return problems.map((problem) => ({
    kind: "mapping",
    code: problem.code,
    message: problem.message,
    ...(problem.propertyKey ? { propertyKey: problem.propertyKey } : {})
  }));
}

function errorBindingState(
  binding: DataObjectBinding,
  problems: readonly DataObjectRuntimeProblem[],
  maxAgeMs: number
): DataObjectRuntimeState {
  return createRuntimeState(binding, "error", {
    phase: "idle",
    problems
  }, Date.now(), maxAgeMs);
}

function queryMaxAge(query: DataQuery | undefined): number {
  return query?.updatePolicy.maxAgeMs ?? 0;
}

function historyFromState(state: DataObjectRuntimeState | null): DataObjectHistorySnapshot | null {
  if (!state) {
    return null;
  }
  if (state.fields.length === 0 || state.receivedAt === null) {
    return state.history;
  }
  return Object.freeze({
    entityId: state.entityId ?? state.deviceId,
    displayName: state.displayName,
    fields: mergeHistoryFields(state.fields, state.history?.fields ?? []),
    fieldReceivedAt: fieldHistoryTimestamps(state.fields, state.receivedAt, state.history),
    observedAt: state.observedAt,
    receivedAt: state.receivedAt,
    sourceQuality: state.sourceQuality,
    observedAtProblem: state.observedAtProblem,
    qualityProblem: state.qualityProblem
  });
}

function mergeHistorySnapshot(
  entity: DataMappedEntity,
  previous: DataObjectHistorySnapshot | null
): DataObjectHistorySnapshot | null {
  if (!previous) {
    return null;
  }
  return Object.freeze({
    entityId: entity.entityId,
    displayName: entity.displayName,
    fields: mergeHistoryFields(entity.fields, previous.fields),
    fieldReceivedAt: fieldHistoryTimestamps(entity.fields, entity.receivedAt, previous),
    observedAt: entity.observedAt,
    receivedAt: entity.receivedAt,
    sourceQuality: entity.sourceQuality,
    observedAtProblem: entity.observedAtProblem,
    qualityProblem: entity.qualityProblem
  });
}

function fieldHistoryTimestamps(
  current: readonly DataMappedEntity["fields"][number][],
  currentReceivedAt: number,
  previous: DataObjectHistorySnapshot | null
): Readonly<Record<string, number>> {
  const timestamps: Record<string, number> = {};
  for (const field of current) {
    if (field.status === "ok" && field.value !== null) {
      timestamps[field.key] = currentReceivedAt;
      continue;
    }
    const previousTime = previous?.fieldReceivedAt[field.key] ?? previous?.receivedAt;
    if (previousTime !== undefined) {
      timestamps[field.key] = previousTime;
    }
  }
  return Object.freeze(timestamps);
}

function mergeHistoryFields(
  current: readonly DataMappedEntity["fields"][number][],
  previous: readonly DataMappedEntity["fields"][number][]
): readonly DataMappedEntity["fields"][number][] {
  const previousByKey = new Map(previous.map((field) => [field.key, field]));
  return Object.freeze(current.map((field) => {
    if (field.status === "ok" && field.value !== null) {
      return field;
    }
    return previousByKey.get(field.key) ?? field;
  }));
}

function freezeObjectDataState(
  enabled: boolean,
  refreshing: boolean,
  lastRefreshAt: number | null,
  contexts: Record<string, DataObjectContextState>,
  objects: Record<string, DataObjectRuntimeState>
): DataObjectDataState {
  const frozenContexts = Object.freeze({ ...contexts });
  const pausedCount = Object.values(frozenContexts).filter((context) => context.paused !== null).length;
  return Object.freeze({
    preview: Object.freeze({
      enabled,
      refreshing,
      lastRefreshAt,
      contextCount: Object.keys(frozenContexts).length,
      pausedCount
    }),
    contexts: frozenContexts,
    objects: Object.freeze({ ...objects })
  });
}

function responseFailureOutcome(
  failure: DataResponseFailure,
  method: DataQueryMethod
): PreviewOutcome {
  const problem: DataObjectRuntimeProblem = {
    kind: "request",
    code: failure.code,
    ...(failure.status !== null ? { status: failure.status } : {}),
    message: failure.message
  };
  if (failure.code === "response-auth" && failure.status !== null) {
    return { kind: "paused", status: failure.status, problems: [problem] };
  }
  if (failure.retryable && method === "GET") {
    const receivedAt = failure.receivedAt ?? Date.now();
    return {
      kind: "retry",
      receivedAt,
      retryAfterMs: failure.response ? parseRetryAfter(failure.response.headers, receivedAt) : null,
      problems: [problem]
    };
  }
  return { kind: "fatal", receivedAt: failure.receivedAt, problems: [problem] };
}

function transportFailureOutcome(
  context: PreviewContext,
  problem: DataObjectRuntimeProblem
): PreviewOutcome {
  const receivedAt = Date.now();
  return context.query.method === "GET"
    ? { kind: "retry", receivedAt, retryAfterMs: null, problems: [problem] }
    : { kind: "fatal", receivedAt, problems: [problem] };
}

function normalizeMaxResponseBytes(value: number | null | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_DATA_MAX_RESPONSE_BYTES;
}

function parseRetryAfter(headers: Readonly<Record<string, string>>, now: number): number | null {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== "retry-after") {
      continue;
    }
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return Math.max(0, Number(trimmed) * 1000);
    }
    const date = Date.parse(trimmed);
    if (Number.isFinite(date)) {
      return Math.max(0, date - now);
    }
  }
  return null;
}

function clampDelay(delay: number): number {
  return Math.max(0, Math.min(delay, 2_147_483_647));
}

function disposedHandle(runId: string, connectionId: string, configRevision: number): DataQueryRunHandle {
  const now = Date.now();
  const result: DataQueryRunResult = Object.freeze({
    id: runId,
    connectionId,
    status: "error",
    configRevision,
    startedAt: now,
    completedAt: now,
    elapsedMs: 0,
    request: null,
    response: null,
    problems: Object.freeze([
      {
        code: "service-disposed",
        field: "request",
        connectionId,
        message: "The editor data service has been disposed."
      } satisfies DataQueryProblem
    ]),
    current: false
  });
  return {
    id: runId,
    configRevision,
    result: Promise.resolve(result),
    cancel() {}
  };
}
