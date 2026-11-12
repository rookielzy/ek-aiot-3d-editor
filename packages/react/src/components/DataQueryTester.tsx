import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode
} from "react";
import {
  buildDataQueryRequest,
  collectQueryOverrides,
  createQueryParameterForm,
  formatDataPath,
  toQueryParameterDrafts,
  type DataParameterLocationInput,
  type DataParameterType,
  type DataParameterValue,
  type DataQueryMethod,
  type DataQueryRunState,
  type DataServiceState,
  type QueryParameterForm
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchI18n } from "../i18n/workbench-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { DataParameterValueInput } from "./DataParameterValueInput";
import {
  DATA_QUERY_RUN_STATUS_MESSAGE_KEYS,
  formatDataQueryProblem,
  PARAMETER_TYPE_MESSAGE_KEYS
} from "./data-query-problem-messages";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { DataFieldProblems } from "./DataFieldProblems";
import { Input } from "./ui/Input";
import { WorkbenchSelect } from "./ui/WorkbenchSelect";

export interface DataQueryTesterProps {
  context: ResolvedWorkbenchContext;
  connectionId: string;
  /** Asked to close: the panel decides whether an unsaved draft needs a prompt. */
  onRequestClose(): void;
  /** Close for real and drop the draft. */
  onClose(): void;
  discardRequested: boolean;
  onKeepEditing(): void;
  onDraftChange(dirty: boolean): void;
}

const EMPTY_SERVICE_STATE: DataServiceState = Object.freeze({
  executorAvailable: false,
  configRevision: 0,
  run: null
});

interface TesterDraft {
  method: DataQueryMethod;
  readOnly: boolean;
  path: string;
  parameters: QueryParameterForm[];
}

/**
 * Manual request tester. Its draft is window state: it never enters the scene
 * snapshot and is dropped when the dialog closes.
 */
export function DataQueryTester({
  context,
  connectionId,
  onRequestClose,
  onClose,
  discardRequested,
  onKeepEditing,
  onDraftChange
}: DataQueryTesterProps) {
  const service = context.editor.getDataService?.() ?? null;
  const subscribe = useCallback((listener: () => void) => service?.subscribe(listener) ?? (() => {}), [service]);
  const getState = useCallback(() => service?.getState() ?? EMPTY_SERVICE_STATE, [service]);
  const dataState = useSyncExternalStore(subscribe, getState, getState);
  const [draft, setDraft] = useState<TesterDraft>({ method: "GET", readOnly: true, path: "", parameters: [] });
  const pathRef = useRef<HTMLInputElement>(null);
  const problemId = useId();
  const t = context.i18n.t;
  const connection = context.snapshot.dataSources.connections[connectionId];

  useEffect(() => {
    service?.invalidateQueryRuns();
    return () => {
      service?.invalidateQueryRuns();
    };
  }, [service, connectionId]);

  if (!connection) {
    return null;
  }

  const parameterDrafts = toQueryParameterDrafts(draft.parameters);
  const overrides = collectQueryOverrides(draft.parameters);
  const preview = buildDataQueryRequest(context.snapshot, {
    connectionId,
    method: draft.method,
    readOnly: draft.readOnly,
    path: draft.path,
    parameters: parameterDrafts
  }, { overrides });
  const run = dataState.run?.connectionId === connectionId ? dataState.run : null;
  const running = run?.status === "running";
  const pathErrors = run?.problems.filter((problem) => problem.field === "path")
    .map((problem) => formatDataQueryProblem(context.i18n, problem)) ?? [];
  const parameterErrors = run?.problems.filter((problem) => problem.field === "parameters")
    .map((problem) => formatDataQueryProblem(context.i18n, problem)) ?? [];

  function updateDraft(patch: Partial<TesterDraft>): void {
    service?.invalidateQueryRuns();
    const next = { ...draft, ...patch };
    setDraft(next);
    onDraftChange(isDirtyDraft(next));
  }

  function addParameter(): void {
    updateDraft({ parameters: [...draft.parameters, createQueryParameterForm()] });
  }

  function updateParameter(id: string, patch: Partial<QueryParameterForm>): void {
    updateDraft({
      parameters: draft.parameters.map((parameter) =>
        parameter.id === id ? { ...parameter, ...patch } : parameter
      )
    });
  }

  function removeParameter(id: string): void {
    updateDraft({ parameters: draft.parameters.filter((parameter) => parameter.id !== id) });
  }

  function changeParameterType(id: string, type: DataParameterType): void {
    const initialText = type === "boolean" ? "false" : "";
    updateParameter(id, { type, defaultText: initialText, overrideText: initialText });
  }

  function updateMethod(next: DataQueryMethod): void {
    updateDraft({
      method: next,
      readOnly: next === "GET",
      parameters: next === "GET"
        ? draft.parameters.map((parameter) =>
          parameter.location === "body" ? { ...parameter, location: "auto" } : parameter
        )
        : draft.parameters
    });
  }

  function updateLocation(id: string, location: DataParameterLocationInput): void {
    updateParameter(id, { location });
  }

  function runRequest(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!service || running) {
      return;
    }
    if (!preview.ok && preview.problems[0]?.field === "path") pathRef.current?.focus();
    service.invalidateQueryRuns();
    void service.executeQueryDraft({
      connectionId,
      method: draft.method,
      readOnly: draft.readOnly,
      path: draft.path,
      parameters: parameterDrafts
    }, { overrides }).result;
  }

  function cancelRequest(): void {
    if (run && service) {
      service.cancelQueryRun(run.id);
    }
  }

  return (
    <Dialog
      onDismiss={onRequestClose}
      label={t("dataSources.request.label")}
      title={t("dataSources.request.title", { name: connection.name })}
      className="ek-workbench__request-dialog"
      headerActions={<Button data-dialog-dismiss onClick={onRequestClose}>{t("dataSources.request.close")}</Button>}
      initialFocus={pathRef}
      discard={discardRequested ? {
        title: t("dataSources.form.discard.title"),
        description: t("dataSources.request.discardDescription"),
        keepLabel: t("dataSources.form.discard.keep"),
        discardLabel: t("dataSources.form.discard.confirm"),
        onKeepEditing,
        onDiscard: onClose
      } : undefined}
    >
      <div className="ek-workbench__dialog-content">
        <TesterSection label={t("dataSources.request.connectionSection")}>
          <p className="ek-workbench__request-hint">{t("dataSources.request.draftHint")}</p>
          <p className="ek-workbench__request-connection">{connection.baseUrl}</p>
        </TesterSection>

        {!service ? (
          <p className="ek-workbench__request-warning" role="alert">{t("dataSources.request.unavailable")}</p>
        ) : !dataState.executorAvailable ? (
          <p className="ek-workbench__request-warning" role="status">{t("dataSources.request.executorMissing")}</p>
        ) : null}

        <TesterSection label={t("dataSources.request.section.request")}>
          <form className="ek-workbench__request-form" aria-label={t("dataSources.request.label")} onSubmit={runRequest} noValidate>
            <label className="ek-workbench__field">
              <span>{t("dataSources.request.method")}</span>
              <WorkbenchSelect
                aria-label={t("dataSources.request.method")}
                value={draft.method}
                options={[
                  { value: "GET", label: "GET" },
                  { value: "POST", label: "POST" }
                ]}
                onChange={updateMethod}
              />
            </label>
            {draft.method === "POST" ? (
              <>
                <label className="ek-workbench__request-check">
                  <input
                    type="checkbox"
                    aria-label={t("dataSources.request.readOnlyConfirm")}
                    checked={draft.readOnly}
                    onChange={(event) => updateDraft({ readOnly: event.target.checked })}
                  />
                  <span>{t("dataSources.request.readOnlyConfirm")}</span>
                </label>
                <p className="ek-workbench__request-hint">{t("dataSources.request.postManualHint")}</p>
              </>
            ) : null}
            <label className="ek-workbench__field">
              <span>{t("dataSources.request.path")}</span>
              <Input
                ref={pathRef}
                type="text"
                aria-label={t("dataSources.request.path")}
                aria-invalid={pathErrors.length > 0}
                aria-describedby={pathErrors.length > 0 ? `${problemId}-path` : undefined}
                placeholder={t("dataSources.request.pathPlaceholder")}
                value={draft.path}
                onChange={(event) => updateDraft({ path: event.target.value })}
              />
            </label>
            <DataFieldProblems id={`${problemId}-path`} messages={pathErrors} />
            <div className="ek-workbench__request-preview">
              <span>{t("dataSources.request.preview")}</span>
              {preview.ok
                ? (
                  <>
                    <span data-method={preview.summary.method}>{preview.summary.method}</span>
                    <code>{preview.summary.url}</code>
                    {preview.summary.body !== null ? (
                      <pre className="ek-workbench__request-payload" aria-label={t("dataSources.request.bodyPreview")}>
                        {JSON.stringify(preview.summary.body, null, 2)}
                      </pre>
                    ) : null}
                  </>
                )
                : <small>{t("dataSources.request.previewPending")}</small>}
            </div>

            <fieldset
              className="ek-workbench__request-parameters"
              aria-describedby={parameterErrors.length > 0 ? `${problemId}-parameters` : undefined}
            >
              <legend>{t("dataSources.request.parameters")}</legend>
              <DataFieldProblems id={`${problemId}-parameters`} messages={parameterErrors} />
              {draft.parameters.length === 0 ? <small>{t("dataSources.request.parameters.empty")}</small> : null}
              {draft.parameters.map((parameter, index) => {
                const row = index + 1;
                return (
                  <div
                    key={parameter.id}
                    className="ek-workbench__request-parameter"
                    role="group"
                    aria-label={t("dataSources.request.parameter.group", { index: row })}
                  >
                    <label className="ek-workbench__field">
                      <span>{t("dataSources.request.parameter.name", { index: row })}</span>
                      <Input
                        type="text"
                        aria-label={t("dataSources.request.parameter.name", { index: row })}
                        value={parameter.name}
                        onChange={(event) => updateParameter(parameter.id, { name: event.target.value })}
                      />
                    </label>
                    <label className="ek-workbench__field">
                      <span>{t("dataSources.request.parameter.type", { index: row })}</span>
                      <WorkbenchSelect
                        aria-label={t("dataSources.request.parameter.type", { index: row })}
                        value={parameter.type}
                        options={(["string", "number", "boolean"] as const).map((type) => ({
                          value: type,
                          label: t(PARAMETER_TYPE_MESSAGE_KEYS[type])
                        }))}
                        onChange={(next) => changeParameterType(parameter.id, next)}
                      />
                    </label>
                    <label className="ek-workbench__field">
                      <span>{t("dataSources.request.parameter.location", { index: row })}</span>
                      <WorkbenchSelect
                        aria-label={t("dataSources.request.parameter.location", { index: row })}
                        value={parameter.location}
                        options={[
                          { value: "auto", label: t("dataSources.request.parameter.location.auto") },
                          { value: "path", label: t("dataSources.request.parameter.location.path") },
                          { value: "query", label: t("dataSources.request.parameter.location.query") },
                          { value: "body", label: t("dataSources.request.parameter.location.body") }
                        ]}
                        onChange={(next) => updateLocation(parameter.id, next)}
                      />
                    </label>
                    <div className="ek-workbench__request-parameter-value">
                      <label className="ek-workbench__field">
                        <span>{t("dataSources.request.parameter.label.default")}</span>
                        <DataParameterValueInput
                          id={`${parameter.id}-default`}
                          type={parameter.type}
                          value={parameter.defaultText}
                          disabled={!parameter.useDefault}
                          label={t("dataSources.request.parameter.default", { index: row })}
                          trueLabel={t("dataSources.request.boolean.true")}
                          falseLabel={t("dataSources.request.boolean.false")}
                          onChange={(value) => updateParameter(parameter.id, { defaultText: value })}
                        />
                      </label>
                      <label className="ek-workbench__request-check">
                        <input
                          type="checkbox"
                          aria-label={t("dataSources.request.parameter.useDefault", { index: row })}
                          checked={parameter.useDefault}
                          onChange={(event) => updateParameter(parameter.id, { useDefault: event.target.checked })}
                        />
                        <span>{t("dataSources.request.parameter.useDefault", { index: row })}</span>
                      </label>
                    </div>
                    <div className="ek-workbench__request-parameter-value">
                      <label className="ek-workbench__request-check">
                        <input
                          type="checkbox"
                          aria-label={t("dataSources.request.parameter.override", { index: row })}
                          checked={parameter.override}
                          onChange={(event) => updateParameter(parameter.id, {
                            override: event.target.checked,
                            ...(event.target.checked && parameter.type === "boolean" && !parameter.overrideText
                              ? { overrideText: "false" }
                              : {})
                          })}
                        />
                        <span>{t("dataSources.request.parameter.label.override")}</span>
                      </label>
                      {parameter.override ? (
                        <label className="ek-workbench__field">
                          <span>{t("dataSources.request.parameter.testValue", { index: row })}</span>
                          <DataParameterValueInput
                            id={`${parameter.id}-override`}
                            type={parameter.type}
                            value={parameter.overrideText}
                            disabled={false}
                            label={t("dataSources.request.parameter.testValue", { index: row })}
                            trueLabel={t("dataSources.request.boolean.true")}
                            falseLabel={t("dataSources.request.boolean.false")}
                            onChange={(value) => updateParameter(parameter.id, { overrideText: value })}
                          />
                        </label>
                      ) : null}
                    </div>
                    <Button
                      aria-label={t("dataSources.request.parameter.remove", { index: row })}
                      onClick={() => removeParameter(parameter.id)}
                    >{t("dataSources.request.parameter.label.remove")}</Button>
                  </div>
                );
              })}
              <Button onClick={addParameter}>{t("dataSources.request.parameters.add")}</Button>
            </fieldset>

            <div className="ek-workbench__request-actions">
              <Button type="submit" disabled={!service || running}>{t("dataSources.request.run")}</Button>
              {running ? (
                <Button onClick={cancelRequest}>{t("dataSources.request.cancel")}</Button>
              ) : null}
            </div>
          </form>
        </TesterSection>

        <TesterSection label={t("dataSources.request.resultSection")}>
          {running ? <p className="ek-workbench__request-running" role="status">{t("dataSources.request.running")}</p> : null}
          {run ? <RequestRunResult run={run} i18n={context.i18n} /> : null}
          {!running && !run ? <p className="ek-workbench__request-hint">{t("dataSources.request.noResult")}</p> : null}
        </TesterSection>
      </div>
    </Dialog>
  );
}

function isDirtyDraft(draft: TesterDraft): boolean {
  return draft.method !== "GET"
    || !draft.readOnly
    || draft.path.length > 0
    || draft.parameters.length > 0;
}

function TesterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="ek-workbench__request-section" role="group" aria-label={label}>
      <h4>{label}</h4>
      {children}
    </section>
  );
}

function RequestRunResult({ run, i18n }: { run: DataQueryRunState; i18n: WorkbenchI18n }) {
  const t = i18n.t;
  const problems = run.problems.filter((problem) => problem.field !== "path" && problem.field !== "parameters");
  return (
    <div
      className="ek-workbench__request-result"
      aria-label={t("dataSources.request.result")}
      data-status={run.status}
      data-config-revision={run.configRevision}
    >
      <div className="ek-workbench__request-result-header">
        <span className="ek-workbench__request-status" data-status={run.status}>
          {t(DATA_QUERY_RUN_STATUS_MESSAGE_KEYS[run.status])}
        </span>
        {run.elapsedMs !== null ? (
          <small>{t("dataSources.request.response.durationValue", { milliseconds: run.elapsedMs })}</small>
        ) : null}
        <small data-config-revision={run.configRevision}>
          {t("dataSources.request.resultRevision", { revision: run.configRevision })}
        </small>
        <small>{t("dataSources.request.sessionOnly")}</small>
      </div>
      {problems.length > 0 ? (
        <ul className="ek-workbench__request-problems" aria-label={t("dataSources.request.problems")}>
          {problems.map((problem, index) => (
            <li key={`${problem.code}-${problem.parameterName ?? ""}-${index}`}>
              {formatDataQueryProblem(i18n, problem)}
            </li>
          ))}
        </ul>
      ) : null}
      {run.request ? <RequestSummary run={run} i18n={i18n} /> : null}
      {run.response ? <ResponseDetails run={run} i18n={i18n} /> : null}
    </div>
  );
}

function RequestSummary({ run, i18n }: { run: DataQueryRunState; i18n: WorkbenchI18n }) {
  const t = i18n.t;
  if (!run.request) {
    return null;
  }
  const request = run.request;
  return (
    <section className="ek-workbench__request-summary" aria-label={t("dataSources.request.summary")}>
      <h4>{t("dataSources.request.summary")}</h4>
      <dl>
        <div>
          <dt>{t("dataSources.request.summary.method")}</dt>
          <dd>{request.method}</dd>
        </div>
        <div>
          <dt>{t("dataSources.request.summary.url")}</dt>
          <dd><code>{request.url}</code></dd>
        </div>
        <div>
          <dt>{t("dataSources.request.summary.timeout")}</dt>
          <dd>{t("dataSources.request.summary.timeoutValue", { milliseconds: request.timeoutMs })}</dd>
        </div>
        <div>
          <dt>{t("dataSources.request.summary.credential")}</dt>
          <dd>{request.credentialRef ?? t("dataSources.request.summary.none")}</dd>
        </div>
        <div>
          <dt>{t("dataSources.request.summary.headers")}</dt>
          <dd>{Object.keys(request.headers).length > 0
            ? <pre>{formatRecord(request.headers)}</pre>
            : t("dataSources.request.summary.none")}</dd>
        </div>
        <div>
          <dt>{t("dataSources.request.summary.parameters")}</dt>
          <dd>{Object.keys(request.parameters).length > 0
            ? <pre>{formatRecord(request.parameters)}</pre>
            : t("dataSources.request.summary.none")}</dd>
        </div>
        {request.body !== null ? (
          <div>
            <dt>{t("dataSources.request.summary.body")}</dt>
            <dd>
              <pre aria-label={t("dataSources.request.summary.body")}>
                {JSON.stringify(request.body, null, 2)}
              </pre>
            </dd>
          </div>
        ) : null}
        {request.successCondition ? (
          <div>
            <dt>{t("dataSources.request.summary.successCondition")}</dt>
            <dd>
              <code>
                {formatDataPath(request.successCondition.path)}
                {" = "}
                {JSON.stringify(request.successCondition.equals)}
              </code>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function ResponseDetails({ run, i18n }: { run: DataQueryRunState; i18n: WorkbenchI18n }) {
  const t = i18n.t;
  if (!run.response) {
    return null;
  }
  const response = run.response;
  return (
    <section className="ek-workbench__request-response" aria-label={t("dataSources.request.response")}>
      <h4>{t("dataSources.request.response")}</h4>
      <dl>
        <div>
          <dt>{t("dataSources.request.response.status")}</dt>
          <dd>{response.status}</dd>
        </div>
        <div>
          <dt>{t("dataSources.request.response.contentType")}</dt>
          <dd>{response.contentType ?? t("dataSources.request.summary.none")}</dd>
        </div>
      </dl>
      {response.bodyKind === "empty" ? (
        <p>{t("dataSources.request.response.empty")}</p>
      ) : (
        <>
          <h5>{t("dataSources.request.response.raw")}</h5>
          <pre className="ek-workbench__request-payload" aria-label={t("dataSources.request.response.rawLabel")}>
            {response.bodyText}
          </pre>
        </>
      )}
      {response.bodyKind === "json" ? (
        <>
          <h5>{t("dataSources.request.response.json")}</h5>
          <pre className="ek-workbench__request-payload" aria-label={t("dataSources.request.response.jsonLabel")}>
            {JSON.stringify(response.json, null, 2)}
          </pre>
        </>
      ) : null}
    </section>
  );
}

function formatRecord(values: Readonly<Record<string, DataParameterValue | string>>): string {
  return JSON.stringify(values, null, 2);
}
