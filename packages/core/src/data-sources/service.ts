import type { JsonValue } from "../snapshot/json";
import type { SceneSnapshot } from "../snapshot/types";
import {
  buildDataGetRequest,
  type DataQueryDraft,
  type DataQueryParameterOverrides,
  type DataQueryProblem,
  type DataRequestSummary
} from "./query";
import type { DataCredentialDescriptor } from "./types";

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
  readonly #unsubscribeSnapshot: (() => void) | null;
  #state: DataServiceState;
  #dataSourcesKey: string;
  #configRevision = 0;
  #current: ActiveRun | null = null;
  #nextRunId = 0;
  #disposed = false;

  constructor(options: CoreDataServiceOptions) {
    this.#getSnapshot = options.getSnapshot;
    this.#executor = options.executor ?? null;
    this.#credentials = Object.freeze([...(options.credentials ?? [])]);
    this.#dataSourcesKey = dataSourcesKey(this.#getSnapshot());
    this.#state = Object.freeze({
      executorAvailable: this.#executor !== null,
      configRevision: 0,
      run: null
    });
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

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#unsubscribeSnapshot?.();
    this.#invalidateActive();
    this.#subscribers.clear();
    this.#state = Object.freeze({
      executorAvailable: this.#executor !== null,
      configRevision: this.#configRevision,
      run: null
    });
  }

  async #execute(
    active: ActiveRun,
    draft: DataQueryDraft,
    overrides: DataQueryParameterOverrides
  ): Promise<void> {
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
    const nextKey = dataSourcesKey(this.#getSnapshot());
    if (nextKey === this.#dataSourcesKey) {
      return;
    }
    this.#dataSourcesKey = nextKey;
    this.#configRevision += 1;
    this.#invalidateActive();
    this.#publish({
      executorAvailable: this.#executor !== null,
      configRevision: this.#configRevision,
      run: null
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
