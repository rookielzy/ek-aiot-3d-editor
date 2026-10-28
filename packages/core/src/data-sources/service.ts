import type { JsonValue } from "../snapshot/json";
import type { SceneSnapshot } from "../snapshot/types";
import {
  buildDataGetRequest,
  type DataQueryDraft,
  type DataQueryParameterOverrides,
  type DataQueryProblem,
  type DataRequestSummary
} from "./query";
import { mapDataQueryBody } from "./mapping";
import type {
  DataObjectDataState,
  DataObjectDataSubscriber,
  DataObjectRuntimeProblem,
  DataObjectRuntimeState
} from "./object-data";
import type { DataCredentialDescriptor, DataObjectBinding, SceneDataSources } from "./types";

export interface DataRequestDescriptor {
  method: "GET";
  url: string;
  headers: Readonly<Record<string, string>>;
  credentialRef: string | null;
  timeoutMs: number;
  signal: AbortSignal;
}

export interface DataResponseDescriptor {
  status: number;
  body: string;
  contentType?: string | null;
  headers?: Readonly<Record<string, string>>;
}

export type DataRequestExecutor = (
  request: DataRequestDescriptor
) => Promise<DataResponseDescriptor> | DataResponseDescriptor;

export type DataResponseBodyKind = "json" | "text" | "empty";

export interface DataQueryResponse {
  status: number;
  ok: boolean;
  contentType: string | null;
  headers: Readonly<Record<string, string>>;
  bodyText: string;
  bodyKind: DataResponseBodyKind;
  json?: JsonValue;
  receivedAt: number;
}

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
}

export interface DataServiceState {
  executorAvailable: boolean;
  configRevision: number;
  run: DataQueryRunState | null;
}

export type DataServiceSubscriber = (state: DataServiceState) => void;

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
  readonly disposed: boolean;
  dispose(): void;
}

export interface CoreDataServiceOptions {
  getSnapshot(): Pick<SceneSnapshot, "dataSources">;
  subscribeSnapshot?(listener: () => void): () => void;
  executor?: DataRequestExecutor | null;
  credentials?: readonly DataCredentialDescriptor[];
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

interface BindingRun {
  objectNodeId: string;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout> | null;
  settled: boolean;
}

interface RunOutcome {
  status: Exclude<DataQueryRunStatus, "running" | "stale">;
  request?: DataRequestSummary | null;
  response?: DataQueryResponse | null;
  problems?: DataQueryProblem[];
}

export class CoreDataService implements EditorDataService {
  readonly #getSnapshot: CoreDataServiceOptions["getSnapshot"];
  readonly #executor: DataRequestExecutor | null;
  readonly #credentials: readonly DataCredentialDescriptor[];
  readonly #subscribers = new Set<DataServiceSubscriber>();
  readonly #objectSubscribers = new Set<DataObjectDataSubscriber>();
  readonly #unsubscribeSnapshot: (() => void) | null;
  #state: DataServiceState;
  #objectState: DataObjectDataState;
  #objectStates: Record<string, DataObjectRuntimeState> = {};
  #dataSources: SceneDataSources;
  #dataSourcesKey: string;
  #runConnectionKey: string | undefined;
  #configRevision = 0;
  #current: ActiveRun | null = null;
  #nextRunId = 0;
  #previewEnabled = false;
  #previewRefreshing = false;
  #previewLastRefreshAt: number | null = null;
  #previewGeneration = 0;
  #previewRefresh: Promise<void> | null = null;
  readonly #bindingRuns = new Map<string, BindingRun>();
  #disposed = false;

  constructor(options: CoreDataServiceOptions) {
    this.#getSnapshot = options.getSnapshot;
    this.#executor = options.executor ?? null;
    this.#credentials = Object.freeze([...(options.credentials ?? [])]);
    this.#dataSources = this.#getSnapshot().dataSources;
    this.#dataSourcesKey = dataSourcesKey(this.#getSnapshot());
    this.#state = Object.freeze({
      executorAvailable: this.#executor !== null,
      configRevision: 0,
      run: null
    });
    this.#objectState = freezeObjectDataState(false, false, null, {});
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
    this.#runConnectionKey = JSON.stringify(this.#getSnapshot().dataSources.connections[draft.connectionId]);
    this.#publish({ ...this.#state, run: active.state });
    void this.#execute(active, draft, options.overrides ?? {});

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
    if (!this.#previewEnabled) {
      this.#previewEnabled = true;
      this.#publishObjectState();
    }
    return this.refreshPreview();
  }

  stopPreview(): void {
    if (this.#disposed) {
      return;
    }
    this.#previewEnabled = false;
    this.#previewRefreshing = false;
    this.#previewLastRefreshAt = null;
    this.#previewRefresh = null;
    this.#previewGeneration += 1;
    this.#cancelBindingRuns();
    this.#objectStates = {};
    this.#publishObjectState();
  }

  refreshPreview(): Promise<void> {
    if (this.#disposed || !this.#previewEnabled) {
      return Promise.resolve();
    }
    if (this.#previewRefresh) {
      return this.#previewRefresh;
    }
    this.#previewRefresh = this.#runObjectRefresh();
    return this.#previewRefresh;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#previewEnabled = false;
    this.#previewRefreshing = false;
    this.#previewRefresh = null;
    this.#previewGeneration += 1;
    this.#cancelBindingRuns();
    this.#objectStates = {};
    this.#objectState = freezeObjectDataState(false, false, null, {});
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

  async #runObjectRefresh(): Promise<void> {
    const generation = ++this.#previewGeneration;
    const snapshot = this.#getSnapshot();
    const bindings = Object.values(snapshot.dataSources.bindings).filter((binding) => binding.enabled);
    this.#cancelBindingRuns();

    const states: Record<string, DataObjectRuntimeState> = {};
    for (const binding of bindings) {
      const query = snapshot.dataSources.queries[binding.queryId];
      states[binding.objectNodeId] = createRuntimeState(binding, query ? "loading" : "error", {
        problems: query
          ? []
          : [{
              kind: "binding",
              code: "query-missing",
              message: `Query ${binding.queryId} does not exist.`
            }]
      });
    }
    this.#objectStates = states;
    this.#previewRefreshing = true;
    this.#publishObjectState();

    await Promise.all(bindings.map((binding) => this.#refreshBinding(binding, generation)));

    if (this.#disposed || generation !== this.#previewGeneration) {
      return;
    }
    this.#previewRefreshing = false;
    this.#previewLastRefreshAt = Date.now();
    this.#previewRefresh = null;
    this.#publishObjectState();
  }

  async #refreshBinding(binding: DataObjectBinding, generation: number): Promise<void> {
    if (this.#disposed || generation !== this.#previewGeneration) {
      return;
    }
    const snapshot = this.#getSnapshot();
    const query = snapshot.dataSources.queries[binding.queryId];
    if (!query) {
      return;
    }
    const built = buildDataGetRequest(snapshot, {
      connectionId: query.connectionId,
      path: query.path,
      parameters: query.parameters
    }, { overrides: binding.parameterOverrides });
    if (!built.ok) {
      this.#completeBinding(generation, binding, {
        status: "error",
        problems: built.problems.map((problem) => ({
          kind: problem.field === "parameters" ? "parameters" : "request",
          code: problem.code,
          message: problem.message,
          ...(problem.parameterName ? { parameterName: problem.parameterName } : {}),
          ...(problem.status !== undefined ? { status: problem.status } : {})
        }))
      });
      return;
    }
    if (!this.#executor) {
      this.#completeBinding(generation, binding, {
        status: "error",
        problems: [{
          kind: "request",
          code: "executor-unavailable",
          message: "No host request executor is configured."
        }]
      });
      return;
    }
    const credentialProblem = this.#credentialProblem(query.connectionId, built.summary.credentialRef);
    if (credentialProblem) {
      this.#completeBinding(generation, binding, {
        status: "error",
        problems: [{
          kind: "request",
          code: credentialProblem.code,
          message: credentialProblem.message
        }]
      });
      return;
    }

    const controller = new AbortController();
    const run: BindingRun = {
      objectNodeId: binding.objectNodeId,
      controller,
      timer: null,
      settled: false
    };
    this.#bindingRuns.set(binding.objectNodeId, run);
    run.timer = setTimeout(() => {
      if (run.settled) {
        return;
      }
      run.settled = true;
      controller.abort();
      this.#finishBindingRun(run);
      this.#completeBinding(generation, binding, {
        status: "error",
        problems: [{
          kind: "request",
          code: "request-timeout",
          message: `The request exceeded ${built.summary.timeoutMs} ms.`
        }]
      });
    }, built.summary.timeoutMs);

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
        this.#executor({
          method: "GET",
          url: built.summary.url,
          headers: built.summary.headers,
          credentialRef: built.summary.credentialRef,
          timeoutMs: built.summary.timeoutMs,
          signal: controller.signal
        }),
        aborted
      ]);
    } catch (error) {
      if (run.settled || this.#disposed || generation !== this.#previewGeneration) {
        return;
      }
      run.settled = true;
      this.#finishBindingRun(run);
      this.#completeBinding(generation, binding, {
        status: "error",
        problems: [{
          kind: "request",
          code: "request-failed",
          message: error instanceof Error ? error.message : String(error)
        }]
      });
      return;
    }
    if (descriptor === null || run.settled || this.#disposed || generation !== this.#previewGeneration) {
      return;
    }
    run.settled = true;
    this.#finishBindingRun(run);

    const receivedAt = Date.now();
    const response = normalizeResponse(descriptor, receivedAt);
    if (!response.ok) {
      this.#completeBinding(generation, binding, {
        status: "error",
        receivedAt,
        problems: [{
          kind: "request",
          code: "response-invalid",
          message: response.message
        }]
      });
      return;
    }
    if (!response.value.ok) {
      this.#completeBinding(generation, binding, {
        status: "error",
        receivedAt,
        problems: [{
          kind: "request",
          code: "response-http",
          status: response.value.status,
          message: `The service returned HTTP ${response.value.status}.`
        }]
      });
      return;
    }
    if (response.value.bodyKind === "text") {
      this.#completeBinding(generation, binding, {
        status: "error",
        receivedAt,
        problems: [{
          kind: "request",
          code: "response-json-invalid",
          message: "The response body is not valid JSON."
        }]
      });
      return;
    }
    if (response.value.bodyKind === "empty" || response.value.json === undefined) {
      this.#completeBinding(generation, binding, {
        status: "error",
        receivedAt,
        problems: [{
          kind: "mapping",
          code: "response-empty",
          message: "The response body is empty."
        }]
      });
      return;
    }

    const mapped = mapDataQueryBody(query.mapping, response.value.json, {
      connectionId: query.connectionId,
      queryId: query.id,
      executionId: `binding-${generation}-${binding.objectNodeId}`,
      receivedAt,
      parameters: built.summary.parameters
    });
    if (!mapped.ok) {
      this.#completeBinding(generation, binding, {
        status: "error",
        receivedAt,
        problems: mapped.errors.map((problem) => ({
          kind: "mapping",
          code: problem.code,
          message: problem.message,
          ...(problem.propertyKey ? { propertyKey: problem.propertyKey } : {})
        }))
      });
      return;
    }

    const mappingProblems = mapped.problems.map((problem) => ({
      kind: "mapping" as const,
      code: problem.code,
      message: problem.message,
      ...(problem.propertyKey ? { propertyKey: problem.propertyKey } : {})
    }));
    if (mapped.entities.length === 0 && mappingProblems.length > 0) {
      this.#completeBinding(generation, binding, {
        status: "error",
        receivedAt,
        problems: mappingProblems
      });
      return;
    }

    const entity = mapped.entities.find((candidate) => candidate.entityId === binding.deviceId) ?? null;
    if (!entity) {
      this.#completeBinding(generation, binding, {
        status: "missing-device",
        receivedAt,
        problems: [{
          kind: "device",
          code: "device-missing",
          message: `Device ${binding.deviceId} is not present in the current result.`
        }, ...mappingProblems]
      });
      return;
    }

    const allDetailsValid = binding.details.every((detail) =>
      entity.fields.find((field) => field.key === detail.key)?.status === "ok"
    );
    this.#completeBinding(generation, binding, {
      status: allDetailsValid ? "ready" : "partial",
      receivedAt,
      entityId: entity.entityId,
      displayName: entity.displayName,
      fields: entity.fields,
      observedAt: entity.observedAt,
      sourceQuality: entity.sourceQuality,
      observedAtProblem: entity.observedAtProblem,
      qualityProblem: entity.qualityProblem
    });
  }

  #completeBinding(
    generation: number,
    binding: DataObjectBinding,
    patch: Partial<DataObjectRuntimeState> & { status: DataObjectRuntimeState["status"] }
  ): void {
    if (this.#disposed || generation !== this.#previewGeneration) {
      return;
    }
    const current = this.#objectStates[binding.objectNodeId];
    if (!current) {
      return;
    }
    const problems = (patch.problems ?? current.problems) as readonly DataObjectRuntimeProblem[];
    const next = createRuntimeState(binding, patch.status, {
      ...current,
      ...patch,
      problems
    });
    this.#objectStates = {
      ...this.#objectStates,
      [binding.objectNodeId]: next
    };
    this.#publishObjectState();
  }

  #finishBindingRun(run: BindingRun): void {
    if (run.timer !== null) {
      clearTimeout(run.timer);
      run.timer = null;
    }
    if (this.#bindingRuns.get(run.objectNodeId) === run) {
      this.#bindingRuns.delete(run.objectNodeId);
    }
  }

  #cancelBindingRun(objectNodeId: string): void {
    const run = this.#bindingRuns.get(objectNodeId);
    if (!run) {
      return;
    }
    run.settled = true;
    if (run.timer !== null) {
      clearTimeout(run.timer);
    }
    run.controller.abort();
    this.#bindingRuns.delete(objectNodeId);
  }

  #cancelBindingRuns(): void {
    for (const run of this.#bindingRuns.values()) {
      run.settled = true;
      if (run.timer !== null) {
        clearTimeout(run.timer);
      }
      run.controller.abort();
    }
    this.#bindingRuns.clear();
  }

  #publishObjectState(): void {
    this.#objectState = freezeObjectDataState(
      this.#previewEnabled,
      this.#previewRefreshing,
      this.#previewLastRefreshAt,
      this.#objectStates
    );
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
    overrides: DataQueryParameterOverrides
  ): Promise<void> {
    // A running-state subscriber can synchronously cancel, invalidate, or dispose this run.
    if (active.settled) {
      return;
    }
    const built = buildDataGetRequest(this.#getSnapshot(), draft, { overrides });
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
      method: "GET",
      url: requestSummary.url,
      headers: requestSummary.headers,
      credentialRef: requestSummary.credentialRef,
      timeoutMs: requestSummary.timeoutMs,
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
    const response = normalizeResponse(responseDescriptor, receivedAt);
    if (!response.ok) {
      this.#finish(active, {
        status: "error",
        request: requestSummary,
        problems: [{
          code: "response-invalid",
          field: "response",
          connectionId: active.connectionId,
          message: response.message
        }]
      });
      return;
    }

    const problems: DataQueryProblem[] = [];
    if (!response.value.ok) {
      problems.push({
        code: "response-http",
        field: "response",
        connectionId: active.connectionId,
        status: response.value.status,
        message: `The service returned HTTP ${response.value.status}.`
      });
    }
    if (response.value.bodyKind === "text") {
      problems.push({
        code: "response-json-invalid",
        field: "response",
        connectionId: active.connectionId,
        message: "The response body is not valid JSON."
      });
    }
    this.#finish(active, {
      status: problems.length > 0 ? "error" : "success",
      request: requestSummary,
      response: response.value,
      problems
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
    const previousDataSources = this.#dataSources;
    this.#dataSources = snapshot.dataSources;
    this.#dataSourcesKey = nextKey;
    this.#configRevision += 1;
    const invalidated = this.#state.run !== null &&
      JSON.stringify(snapshot.dataSources.connections[this.#state.run.connectionId]) !== this.#runConnectionKey;
    if (invalidated) {
      this.#invalidateActive();
    }
    if (this.#previewEnabled) {
      const affected = collectAffectedObjectIds(previousDataSources, snapshot.dataSources);
      if (affected.size > 0) {
        for (const objectNodeId of affected) {
          this.#cancelBindingRun(objectNodeId);
        }
        this.#objectStates = Object.fromEntries(
          Object.entries(this.#objectStates).filter(([objectNodeId]) => !affected.has(objectNodeId))
        );
        this.#publishObjectState();
      }
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

function dataSourcesKey(snapshot: Pick<SceneSnapshot, "dataSources">): string {
  return JSON.stringify(snapshot.dataSources);
}

function collectAffectedObjectIds(
  previous: SceneDataSources,
  next: SceneDataSources
): Set<string> {
  const affected = new Set<string>();
  const changedQueries = changedIds(previous.queries, next.queries);
  const changedConnections = changedIds(previous.connections, next.connections);
  const objectNodeIds = new Set([
    ...Object.keys(previous.bindings),
    ...Object.keys(next.bindings)
  ]);
  for (const objectNodeId of objectNodeIds) {
    const before = previous.bindings[objectNodeId];
    const after = next.bindings[objectNodeId];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      affected.add(objectNodeId);
      continue;
    }
    if (!after) {
      continue;
    }
    const previousQuery = previous.queries[after.queryId];
    const nextQuery = next.queries[after.queryId];
    if (
      changedQueries.has(after.queryId) ||
      (previousQuery ? changedConnections.has(previousQuery.connectionId) : false) ||
      (nextQuery ? changedConnections.has(nextQuery.connectionId) : false)
    ) {
      affected.add(objectNodeId);
    }
  }
  return affected;
}

function changedIds(
  previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>
): Set<string> {
  const changed = new Set<string>();
  for (const id of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (JSON.stringify(previous[id]) !== JSON.stringify(next[id])) {
      changed.add(id);
    }
  }
  return changed;
}

function createRuntimeState(
  binding: DataObjectBinding,
  status: DataObjectRuntimeState["status"],
  patch: Partial<DataObjectRuntimeState> = {}
): DataObjectRuntimeState {
  return Object.freeze({
    objectNodeId: binding.objectNodeId,
    queryId: binding.queryId,
    deviceId: binding.deviceId,
    enabled: binding.enabled,
    status,
    entityId: patch.entityId ?? null,
    displayName: patch.displayName ?? null,
    fields: Object.freeze([...(patch.fields ?? [])]),
    observedAt: patch.observedAt ?? null,
    receivedAt: patch.receivedAt ?? null,
    sourceQuality: patch.sourceQuality ?? null,
    observedAtProblem: patch.observedAtProblem ?? null,
    qualityProblem: patch.qualityProblem ?? null,
    problems: Object.freeze([...(patch.problems ?? [])])
  });
}

function freezeObjectDataState(
  enabled: boolean,
  refreshing: boolean,
  lastRefreshAt: number | null,
  objects: Record<string, DataObjectRuntimeState>
): DataObjectDataState {
  return Object.freeze({
    preview: Object.freeze({ enabled, refreshing, lastRefreshAt }),
    objects: Object.freeze({ ...objects })
  });
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

function normalizeResponse(
  value: unknown,
  receivedAt: number
): { ok: true; value: DataQueryResponse } | { ok: false; message: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, message: "The host returned a non-object response." };
  }
  const descriptor = value as Partial<DataResponseDescriptor>;
  if (
    typeof descriptor.status !== "number" ||
    !Number.isInteger(descriptor.status) ||
    descriptor.status < 100 ||
    descriptor.status > 599
  ) {
    return { ok: false, message: "The host response status is invalid." };
  }
  if (typeof descriptor.body !== "string") {
    return { ok: false, message: "The host response body must be text." };
  }
  if (
    descriptor.contentType !== undefined &&
    descriptor.contentType !== null &&
    typeof descriptor.contentType !== "string"
  ) {
    return { ok: false, message: "The host response content type is invalid." };
  }
  const headers: Record<string, string> = {};
  if (descriptor.headers !== undefined) {
    if (!descriptor.headers || typeof descriptor.headers !== "object" || Array.isArray(descriptor.headers)) {
      return { ok: false, message: "The host response headers are invalid." };
    }
    for (const [name, headerValue] of Object.entries(descriptor.headers)) {
      if (typeof headerValue !== "string") {
        return { ok: false, message: "The host response headers must be strings." };
      }
      headers[name] = headerValue;
    }
  }

  const bodyText = descriptor.body;
  const trimmed = bodyText.trim();
  let bodyKind: DataResponseBodyKind = "empty";
  let json: JsonValue | undefined;
  if (trimmed.length > 0) {
    try {
      json = JSON.parse(trimmed) as JsonValue;
      bodyKind = "json";
    } catch {
      bodyKind = "text";
    }
  }

  return {
    ok: true,
    value: Object.freeze({
      status: descriptor.status,
      ok: descriptor.status >= 200 && descriptor.status < 300,
      contentType: descriptor.contentType ?? null,
      headers: Object.freeze(headers),
      bodyText,
      bodyKind,
      ...(bodyKind === "json" ? { json } : {}),
      receivedAt
    })
  };
}
