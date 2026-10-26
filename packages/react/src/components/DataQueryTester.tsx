import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent
} from "react";
import {
  buildDataGetRequest,
  type DataParameterType,
  type DataParameterValue,
  type DataQueryParameterDraft,
  type DataQueryParameterOverrides,
  type DataQueryProblem,
  type DataQueryProblemCode,
  type DataQueryRunState,
  type DataQueryRunStatus,
  type DataServiceState
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchI18n, WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";

interface RequestParameterForm {
  id: string;
  name: string;
  type: DataParameterType;
  useDefault: boolean;
  defaultText: string;
  override: boolean;
  overrideText: string;
}

export interface DataQueryTesterProps {
  context: ResolvedWorkbenchContext;
  connectionId: string;
  onClose(): void;
}

const EMPTY_SERVICE_STATE: DataServiceState = Object.freeze({
  executorAvailable: false,
  configRevision: 0,
  run: null
});

const PROBLEM_MESSAGE_KEYS = {
  "connection-not-found": "dataSources.request.problem.connectionNotFound",
  "credential-unavailable": "dataSources.request.problem.credentialUnavailable",
  "executor-unavailable": "dataSources.request.problem.executorUnavailable",
  "parameter-definition-invalid": "dataSources.request.problem.parameterDefinitionInvalid",
  "parameter-duplicate": "dataSources.request.problem.parameterDuplicate",
  "parameter-missing": "dataSources.request.problem.parameterMissing",
  "parameter-type": "dataSources.request.problem.parameterType",
  "path-absolute": "dataSources.request.problem.pathAbsolute",
  "path-invalid": "dataSources.request.problem.pathInvalid",
  "path-parameter-missing": "dataSources.request.problem.pathParameterMissing",
  "path-protocol-relative": "dataSources.request.problem.pathProtocolRelative",
  "path-required": "dataSources.request.problem.pathRequired",
  "path-traversal": "dataSources.request.problem.pathTraversal",
  "request-aborted": "dataSources.request.problem.requestAborted",
  "request-failed": "dataSources.request.problem.requestFailed",
  "request-timeout": "dataSources.request.problem.requestTimeout",
  "response-http": "dataSources.request.problem.responseHttp",
  "response-invalid": "dataSources.request.problem.responseInvalid",
  "response-json-invalid": "dataSources.request.problem.responseJsonInvalid",
  "service-disposed": "dataSources.request.problem.serviceDisposed"
} satisfies Record<DataQueryProblemCode, WorkbenchMessageKey>;

const RUN_STATUS_MESSAGE_KEYS = {
  running: "dataSources.request.status.running",
  success: "dataSources.request.status.success",
  error: "dataSources.request.status.error",
  cancelled: "dataSources.request.status.cancelled"
} satisfies Record<Exclude<DataQueryRunStatus, "stale">, WorkbenchMessageKey>;

const PARAMETER_TYPE_MESSAGE_KEYS = {
  string: "dataSources.request.type.string",
  number: "dataSources.request.type.number",
  boolean: "dataSources.request.type.boolean"
} satisfies Record<DataParameterType, WorkbenchMessageKey>;

export function DataQueryTester({ context, connectionId, onClose }: DataQueryTesterProps) {
  const service = context.editor.getDataService?.() ?? null;
  const subscribe = useCallback(
    (listener: () => void) => service?.subscribe(listener) ?? (() => {}),
    [service]
  );
  const getState = useCallback(
    () => service?.getState() ?? EMPTY_SERVICE_STATE,
    [service]
  );
  const dataState = useSyncExternalStore(subscribe, getState, getState);
  const [path, setPath] = useState("");
  const [parameters, setParameters] = useState<RequestParameterForm[]>([]);
  const pathRef = useRef<HTMLInputElement>(null);
  const t = context.i18n.t;
  const connection = context.snapshot.dataSources.connections[connectionId];

  useEffect(() => {
    service?.invalidateQueryRuns();
    return () => {
      service?.invalidateQueryRuns();
    };
  }, [service, connectionId]);

  useEffect(() => {
    pathRef.current?.focus();
  }, []);

  if (!connection) {
    return null;
  }

  const parameterDrafts = parameters.map(toParameterDraft);
  const overrides = collectOverrides(parameters);
  const preview = buildDataGetRequest(context.snapshot, {
    connectionId,
    path,
    parameters: parameterDrafts
  }, { overrides });
  const run = dataState.run?.connectionId === connectionId ? dataState.run : null;
  const running = run?.status === "running";

  function invalidateRuns(): void {
    service?.invalidateQueryRuns();
  }

  function addParameter(): void {
    invalidateRuns();
    setParameters((current) => [...current, createParameterForm()]);
  }

  function updateParameter(id: string, patch: Partial<RequestParameterForm>): void {
    invalidateRuns();
    setParameters((current) => current.map((parameter) =>
      parameter.id === id ? { ...parameter, ...patch } : parameter
    ));
  }

  function removeParameter(id: string): void {
    invalidateRuns();
    setParameters((current) => current.filter((parameter) => parameter.id !== id));
  }

  function changeParameterType(id: string, type: DataParameterType): void {
    const initialText = type === "boolean" ? "false" : "";
    updateParameter(id, { type, defaultText: initialText, overrideText: initialText });
  }

  function updatePath(value: string): void {
    invalidateRuns();
    setPath(value);
  }

  function runRequest(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!service || running) {
      return;
    }
    service.invalidateQueryRuns();
    void service.executeQueryDraft({
      connectionId,
      path,
      parameters: parameterDrafts
    }, { overrides }).result;
  }

  function cancelRequest(): void {
    if (run && service) {
      service.cancelQueryRun(run.id);
    }
  }

  return (
    <section className="ek-workbench__request" aria-label={t("dataSources.request.label")}>
      <div className="ek-workbench__section-header">
        <h3>{t("dataSources.request.title", { name: connection.name })}</h3>
        <button type="button" onClick={onClose}>{t("dataSources.request.close")}</button>
      </div>
      <p className="ek-workbench__request-hint">{t("dataSources.request.draftHint")}</p>
      {!service ? (
        <p className="ek-workbench__request-warning" role="alert">{t("dataSources.request.unavailable")}</p>
      ) : !dataState.executorAvailable ? (
        <p className="ek-workbench__request-warning" role="status">{t("dataSources.request.executorMissing")}</p>
      ) : null}

      <form className="ek-workbench__request-form" aria-label={t("dataSources.request.label")} onSubmit={runRequest} noValidate>
        <label className="ek-workbench__field">
          <span>{t("dataSources.request.path")}</span>
          <input
            ref={pathRef}
            type="text"
            aria-label={t("dataSources.request.path")}
            placeholder={t("dataSources.request.pathPlaceholder")}
            value={path}
            onChange={(event) => updatePath(event.target.value)}
          />
        </label>
        <div className="ek-workbench__request-preview">
          <span>{t("dataSources.request.preview")}</span>
          {preview.ok
            ? <code>{preview.summary.url}</code>
            : <small>{t("dataSources.request.previewPending")}</small>}
        </div>

        <fieldset className="ek-workbench__request-parameters">
          <legend>{t("dataSources.request.parameters")}</legend>
          {parameters.length === 0 ? <small>{t("dataSources.request.parameters.empty")}</small> : null}
          {parameters.map((parameter, index) => {
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
                  <input
                    type="text"
                    aria-label={t("dataSources.request.parameter.name", { index: row })}
                    value={parameter.name}
                    onChange={(event) => updateParameter(parameter.id, { name: event.target.value })}
                  />
                </label>
                <label className="ek-workbench__field">
                  <span>{t("dataSources.request.parameter.type", { index: row })}</span>
                  <select
                    aria-label={t("dataSources.request.parameter.type", { index: row })}
                    value={parameter.type}
                    onChange={(event) => changeParameterType(parameter.id, event.target.value as DataParameterType)}
                  >
                    {(["string", "number", "boolean"] as const).map((type) => (
                      <option key={type} value={type}>{t(PARAMETER_TYPE_MESSAGE_KEYS[type])}</option>
                    ))}
                  </select>
                </label>
                <div className="ek-workbench__request-parameter-value">
                  <label className="ek-workbench__field">
                    <span>{t("dataSources.request.parameter.label.default")}</span>
                    <ParameterValueInput
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
                      <ParameterValueInput
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
                <button
                  type="button"
                  aria-label={t("dataSources.request.parameter.remove", { index: row })}
                  onClick={() => removeParameter(parameter.id)}
                >{t("dataSources.request.parameter.label.remove")}</button>
              </div>
            );
          })}
          <button type="button" onClick={addParameter}>{t("dataSources.request.parameters.add")}</button>
        </fieldset>

        <div className="ek-workbench__request-actions">
          <button type="submit" disabled={!service || running}>{t("dataSources.request.run")}</button>
          {running ? (
            <button type="button" onClick={cancelRequest}>{t("dataSources.request.cancel")}</button>
          ) : null}
        </div>
      </form>

      {running ? <p className="ek-workbench__request-running" role="status">{t("dataSources.request.running")}</p> : null}
      {run ? <RequestRunResult run={run} i18n={context.i18n} /> : null}
    </section>
  );
}

function RequestRunResult({ run, i18n }: { run: DataQueryRunState; i18n: WorkbenchI18n }) {
  const t = i18n.t;
  return (
    <section
      className="ek-workbench__request-result"
      aria-label={t("dataSources.request.result")}
      data-status={run.status}
      data-config-revision={run.configRevision}
    >
      <div className="ek-workbench__request-result-header">
        <span className="ek-workbench__request-status" data-status={run.status}>
          {t(RUN_STATUS_MESSAGE_KEYS[run.status])}
        </span>
        {run.elapsedMs !== null ? (
          <small>{t("dataSources.request.response.durationValue", { milliseconds: run.elapsedMs })}</small>
        ) : null}
        <small data-config-revision={run.configRevision}>
          {t("dataSources.request.resultRevision", { revision: run.configRevision })}
        </small>
        <small>{t("dataSources.request.sessionOnly")}</small>
      </div>
      {run.problems.length > 0 ? (
        <ul className="ek-workbench__request-problems" aria-label={t("dataSources.request.problems")}>
          {run.problems.map((problem, index) => (
            <li key={`${problem.code}-${problem.parameterName ?? ""}-${index}`}>
              {formatProblem(i18n, problem)}
            </li>
          ))}
        </ul>
      ) : null}
      {run.request ? <RequestSummary run={run} i18n={i18n} /> : null}
      {run.response ? <ResponseDetails run={run} i18n={i18n} /> : null}
    </section>
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

function ParameterValueInput({
  id,
  type,
  value,
  disabled,
  label,
  trueLabel,
  falseLabel,
  onChange
}: {
  id: string;
  type: DataParameterType;
  value: string;
  disabled: boolean;
  label: string;
  trueLabel: string;
  falseLabel: string;
  onChange(value: string): void;
}) {
  if (type === "boolean") {
    return (
      <select
        id={id}
        aria-label={label}
        value={value === "true" ? "true" : "false"}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="true">{trueLabel}</option>
        <option value="false">{falseLabel}</option>
      </select>
    );
  }
  return (
    <input
      id={id}
      type={type === "number" ? "number" : "text"}
      step={type === "number" ? "any" : undefined}
      inputMode={type === "number" ? "decimal" : undefined}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function formatProblem(i18n: WorkbenchI18n, problem: DataQueryProblem): string {
  const values: WorkbenchMessageValues = {
    parameterName: problem.parameterName ?? "",
    status: problem.status ?? "",
    credentialRef: problem.credentialRef ?? "",
    detail: problem.message
  };
  return i18n.t(PROBLEM_MESSAGE_KEYS[problem.code], values);
}

function formatRecord(values: Readonly<Record<string, DataParameterValue | string>>): string {
  return JSON.stringify(values, null, 2);
}

let nextParameterId = 0;

function createParameterForm(): RequestParameterForm {
  nextParameterId += 1;
  return {
    id: `data-parameter-${nextParameterId}`,
    name: "",
    type: "string",
    useDefault: true,
    defaultText: "",
    override: false,
    overrideText: ""
  };
}

function toParameterDraft(parameter: RequestParameterForm): DataQueryParameterDraft {
  return {
    name: parameter.name.trim(),
    type: parameter.type,
    ...(parameter.useDefault
      ? { defaultValue: parseParameterText(parameter.type, parameter.defaultText) }
      : {})
  };
}

function collectOverrides(parameters: readonly RequestParameterForm[]): DataQueryParameterOverrides {
  const overrides: Record<string, DataParameterValue | undefined> = {};
  for (const parameter of parameters) {
    if (!parameter.override) {
      continue;
    }
    overrides[parameter.name.trim()] = parseParameterText(parameter.type, parameter.overrideText);
  }
  return overrides;
}

function parseParameterText(type: DataParameterType, text: string): DataParameterValue {
  if (type === "string") {
    return text;
  }
  if (type === "boolean") {
    return text === "true";
  }
  return text.trim() === "" ? Number.NaN : Number(text);
}
