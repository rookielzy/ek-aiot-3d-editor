import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react";
import {
  buildDeleteDataObjectBindingCommand,
  buildSaveDataObjectBindingCommand,
  DATA_DETAIL_MAX_PRECISION,
  mapDataQueryBody,
  type DataBindingProblem,
  type DataBindingProblemCode,
  type DataMappedEntity,
  type DataObjectBindingInput,
  type DataParameterValue,
  type DataQuery,
  type DataQueryProblem
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchI18n, WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { DataParameterValueInput } from "./DataParameterValueInput";
import { DataQueryEditor } from "./DataQueryEditor";
import { parseParameterText } from "./data-query-form";
import {
  DATA_MAPPING_PROBLEM_MESSAGE_KEYS,
  formatDataQueryProblem,
  PARAMETER_TYPE_MESSAGE_KEYS
} from "./data-query-problem-messages";

export interface DataBindingFormProps {
  context: ResolvedWorkbenchContext;
  objectNodeId: string;
  fixedQueryId?: string | null;
}

interface DetailDraft {
  key: string;
  label: string;
  precision: string;
}

interface OverrideDraft {
  enabled: boolean;
  text: string;
}

interface BindingDraft {
  queryId: string;
  overrides: Record<string, OverrideDraft>;
  deviceId: string;
  enabled: boolean;
  details: DetailDraft[];
}

type CandidateState =
  | { status: "idle"; signature: string }
  | { status: "loading"; signature: string }
  | { status: "ready"; signature: string; entities: readonly DataMappedEntity[] }
  | { status: "error"; signature: string; problems: readonly DataQueryProblem[]; message: string | null };

interface StatusMessage {
  key: WorkbenchMessageKey;
  values?: WorkbenchMessageValues;
}

const BINDING_PROBLEM_MESSAGE_KEYS = {
  "binding-invalid": "dataBinding.problem.bindingInvalid",
  "binding-not-found": "dataBinding.problem.bindingNotFound",
  "command-failed": "dataBinding.problem.commandFailed",
  "device-required": "dataBinding.problem.deviceRequired",
  "detail-duplicate": "dataBinding.problem.detailDuplicate",
  "detail-precision": "dataBinding.problem.detailPrecision",
  "detail-required": "dataBinding.problem.detailRequired",
  "detail-unknown": "dataBinding.problem.detailUnknown",
  "parameter-missing": "dataBinding.problem.parameterMissing",
  "parameter-type": "dataBinding.problem.parameterType",
  "parameter-unknown": "dataBinding.problem.parameterUnknown",
  "query-not-found": "dataBinding.problem.queryNotFound",
  "target-imported": "dataBinding.problem.targetImported",
  "target-not-found": "dataBinding.problem.targetNotFound",
  "target-unsupported": "dataBinding.problem.targetUnsupported"
} satisfies Record<DataBindingProblemCode, WorkbenchMessageKey>;

export function DataBindingForm({
  context,
  objectNodeId,
  fixedQueryId = null
}: DataBindingFormProps) {
  const snapshot = context.snapshot;
  const savedBinding = snapshot.dataSources.bindings[objectNodeId] ?? null;
  const savedSignature = savedBinding ? JSON.stringify(savedBinding) : "";
  const [draft, setDraft] = useState<BindingDraft>(() =>
    createDraft(snapshot, objectNodeId, fixedQueryId)
  );
  const [baseline, setBaseline] = useState(() =>
    serializeDraft(createDraft(snapshot, objectNodeId, fixedQueryId))
  );
  const [problems, setProblems] = useState<DataBindingProblem[]>([]);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [candidates, setCandidates] = useState<CandidateState>(() => ({
    status: "idle",
    signature: ""
  }));
  const [newQueryConnectionId, setNewQueryConnectionId] = useState(
    () => Object.values(snapshot.dataSources.connections)[0]?.id ?? ""
  );
  const [queryEditorOpen, setQueryEditorOpen] = useState(false);
  const candidateRunRef = useRef<string | null>(null);
  const lastSavedSignatureRef = useRef(savedSignature);
  const id = useId();
  const t = context.i18n.t;

  const query = draft.queryId ? snapshot.dataSources.queries[draft.queryId] ?? null : null;
  const connection = query ? snapshot.dataSources.connections[query.connectionId] ?? null : null;
  const connections = Object.values(snapshot.dataSources.connections);
  const queries = Object.values(snapshot.dataSources.queries);
  const service = context.editor.getDataService?.() ?? null;
  const signature = useMemo(
    () => JSON.stringify([draft.queryId, draft.overrides, query, connection]),
    [draft.queryId, draft.overrides, query, connection]
  );
  const dirty = serializeDraft(draft) !== baseline;

  useEffect(() => {
    if (lastSavedSignatureRef.current === savedSignature) {
      return;
    }
    lastSavedSignatureRef.current = savedSignature;
    const next = createDraft(snapshot, objectNodeId, fixedQueryId);
    setDraft(next);
    setBaseline(serializeDraft(next));
    setProblems([]);
  }, [savedSignature, snapshot, objectNodeId, fixedQueryId]);

  useEffect(() => {
    if (candidates.status !== "loading" || candidates.signature === signature) {
      return;
    }
    if (candidateRunRef.current) {
      service?.cancelQueryRun(candidateRunRef.current);
      candidateRunRef.current = null;
    }
    setCandidates({ status: "idle", signature });
  }, [candidates, service, signature]);

  useEffect(() => () => {
    if (candidateRunRef.current) {
      service?.cancelQueryRun(candidateRunRef.current);
      candidateRunRef.current = null;
    }
  }, [service]);

  const candidatesStale = candidates.status === "ready" && candidates.signature !== signature;
  const currentCandidates = candidates.status === "ready" && !candidatesStale ? candidates.entities : [];
  const unavailableProperties = query
    ? query.mapping.properties.filter((property) => !draft.details.some((detail) => detail.key === property.key))
    : [];

  function updateDraft(patch: Partial<BindingDraft>): void {
    setProblems([]);
    setDraft((current) => ({ ...current, ...patch }));
  }

  function changeQuery(queryId: string): void {
    const nextQuery = queryId ? snapshot.dataSources.queries[queryId] ?? null : null;
    setProblems([]);
    setCandidates({ status: "idle", signature: "" });
    setDraft((current) => ({
      ...current,
      queryId,
      overrides: draftOverridesForQuery(current.overrides, nextQuery),
      details: detailsForQuery(current.details, nextQuery)
    }));
  }

  function updateOverride(name: string, patch: Partial<OverrideDraft>): void {
    setProblems([]);
    setDraft((current) => ({
      ...current,
      overrides: {
        ...current.overrides,
        [name]: {
          enabled: current.overrides[name]?.enabled ?? false,
          text: current.overrides[name]?.text ?? "",
          ...patch
        }
      }
    }));
  }

  function updateDetail(key: string, patch: Partial<DetailDraft>): void {
    setProblems([]);
    setDraft((current) => ({
      ...current,
      details: current.details.map((detail) => detail.key === key ? { ...detail, ...patch } : detail)
    }));
  }

  function moveDetail(key: string, direction: -1 | 1): void {
    setProblems([]);
    setDraft((current) => {
      const index = current.details.findIndex((detail) => detail.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.details.length) {
        return current;
      }
      const details = [...current.details];
      [details[index], details[target]] = [details[target], details[index]];
      return { ...current, details };
    });
  }

  function addDetail(key: string): void {
    if (!key) {
      return;
    }
    setProblems([]);
    setDraft((current) => current.details.some((detail) => detail.key === key)
      ? current
      : { ...current, details: [...current.details, { key, label: "", precision: "" }] });
  }

  function removeDetail(key: string): void {
    setProblems([]);
    setDraft((current) => ({
      ...current,
      details: current.details.filter((detail) => detail.key !== key)
    }));
  }

  async function loadCandidates(): Promise<void> {
    if (!service || !query) {
      return;
    }
    const requestSignature = signature;
    const overrides = collectOverrides(draft, query);
    setProblems([]);
    setCandidates({ status: "loading", signature: requestSignature });
    const handle = service.executeQueryDraft({
      connectionId: query.connectionId,
      path: query.path,
      parameters: query.parameters
    }, { overrides });
    candidateRunRef.current = handle.id;
    const result = await handle.result;
    if (candidateRunRef.current !== handle.id || !result.current) {
      return;
    }
    candidateRunRef.current = null;
    if (result.status !== "success" || !result.response) {
      setCandidates({
        status: "error",
        signature: requestSignature,
        problems: result.problems,
        message: null
      });
      return;
    }
    if (result.response.bodyKind !== "json" || result.response.json === undefined) {
      setCandidates({
        status: "error",
        signature: requestSignature,
        problems: [],
        message: result.response.bodyKind === "empty"
          ? t("dataSources.sample.emptyBody")
          : t("dataSources.sample.invalidJson")
      });
      return;
    }
    const mapped = mapDataQueryBody(query.mapping, result.response.json, {
      connectionId: query.connectionId,
      queryId: query.id,
      executionId: result.id,
      receivedAt: result.response.receivedAt,
      parameters: result.request?.parameters ?? overrides
    });
    if (!mapped.ok) {
      setCandidates({
        status: "error",
        signature: requestSignature,
        problems: [],
        message: mapped.errors.length > 0
          ? mapped.errors
              .map((problem) => t(DATA_MAPPING_PROBLEM_MESSAGE_KEYS[problem.code], {
                propertyKey: problem.propertyKey ?? ""
              }))
              .join(" ")
          : t("dataBinding.problem.candidatesFailed")
      });
      return;
    }
    setCandidates({
      status: "ready",
      signature: requestSignature,
      entities: mapped.entities
    });
  }

  function saveBinding(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!query) {
      setProblems([{
        field: "query",
        code: "query-not-found",
        message: "Select a saved query."
      }]);
      return;
    }
    const input: DataObjectBindingInput = {
      objectNodeId,
      queryId: query.id,
      parameterOverrides: collectOverrides(draft, query),
      deviceId: draft.deviceId,
      enabled: draft.enabled,
      details: draft.details.map((detail) => ({
        key: detail.key,
        label: detail.label.trim() || null,
        precision: detail.precision.trim() === "" ? null : Number(detail.precision)
      }))
    };
    const result = buildSaveDataObjectBindingCommand(snapshot, input);
    if (!result.ok) {
      setProblems(result.problems);
      return;
    }
    const dispatched = context.dispatch(result.command);
    if (!dispatched.ok) {
      setProblems([{
        field: "binding",
        code: "command-failed",
        message: dispatched.error ?? ""
      }]);
      return;
    }
    const next = createDraft(dispatched.snapshot, objectNodeId, fixedQueryId);
    setDraft(next);
    setBaseline(serializeDraft(next));
    setProblems([]);
    setStatus({
      key: savedBinding ? "dataBinding.form.status.updated" : "dataBinding.form.status.saved"
    });
    setCandidates((current) => current.status === "ready"
      ? { status: "idle", signature: "" }
      : current);
  }

  function resetDraft(): void {
    const next = createDraft(snapshot, objectNodeId, fixedQueryId);
    setDraft(next);
    setBaseline(serializeDraft(next));
    setProblems([]);
    setCandidates({ status: "idle", signature: "" });
    setStatus({ key: "dataBinding.form.status.reset" });
  }

  function removeBinding(): void {
    const result = buildDeleteDataObjectBindingCommand(snapshot, objectNodeId);
    if (!result.ok) {
      setProblems(result.problems);
      return;
    }
    const dispatched = context.dispatch(result.command);
    if (!dispatched.ok) {
      setProblems([{
        field: "binding",
        code: "command-failed",
        message: dispatched.error ?? ""
      }]);
      return;
    }
    const next = createDraft(dispatched.snapshot, objectNodeId, fixedQueryId);
    setDraft(next);
    setBaseline(serializeDraft(next));
    setProblems([]);
    setCandidates({ status: "idle", signature: "" });
    setStatus({ key: "dataBinding.form.status.removed" });
  }

  function handleQuerySaved(savedQueryId: string): void {
    const freshSnapshot = context.editor.getSnapshot();
    const savedQuery = freshSnapshot.dataSources.queries[savedQueryId] ?? null;
    setDraft((current) => ({
      ...current,
      queryId: savedQueryId,
      overrides: draftOverridesForQuery({}, savedQuery),
      details: detailsForQuery([], savedQuery)
    }));
    setProblems([]);
    setCandidates({ status: "idle", signature: "" });
    setQueryEditorOpen(false);
  }

  return (
    <>
      <form
        className="ek-workbench__binding-form"
        aria-label={t("dataBinding.section.label")}
        onSubmit={saveBinding}
        noValidate
      >
        <p className="ek-workbench__binding-description">{t("dataBinding.section.description")}</p>

        {fixedQueryId ? (
          <p className="ek-workbench__binding-fixed-query">
            <span>{t("dataBinding.form.query")}</span>
            <strong>{query?.name ?? fixedQueryId}</strong>
          </p>
        ) : (
          <label className="ek-workbench__field">
            <span>{t("dataBinding.form.query")}</span>
            <select
              aria-label={t("dataBinding.form.query")}
              value={draft.queryId}
              onChange={(event) => changeQuery(event.target.value)}
            >
              <option value="">{t("dataBinding.form.query.placeholder")}</option>
              {queries.map((item) => (
                <option key={item.id} value={item.id}>{queryOptionLabel(item, snapshot)}</option>
              ))}
            </select>
          </label>
        )}
        {!fixedQueryId && queries.length === 0 ? (
          <p className="ek-workbench__binding-hint">{t("dataBinding.form.query.empty")}</p>
        ) : null}
        {!fixedQueryId ? (
          connections.length === 0 ? (
            <p className="ek-workbench__binding-hint">{t("dataBinding.form.query.noConnections")}</p>
          ) : (
            <div className="ek-workbench__binding-query-create">
              {connections.length > 1 ? (
                <label className="ek-workbench__field">
                  <span>{t("dataBinding.form.query.connection")}</span>
                  <select
                    aria-label={t("dataBinding.form.query.connection")}
                    value={newQueryConnectionId}
                    onChange={(event) => setNewQueryConnectionId(event.target.value)}
                  >
                    {connections.map((connection) => (
                      <option key={connection.id} value={connection.id}>{connection.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                disabled={!newQueryConnectionId}
                onClick={() => setQueryEditorOpen(true)}
              >{t("dataBinding.form.query.create")}</button>
            </div>
          )
        ) : null}

        <label className="ek-workbench__field">
          <span>{t("dataBinding.form.device")}</span>
          <input
            type="text"
            aria-label={t("dataBinding.form.device")}
            placeholder={t("dataBinding.form.device.placeholder")}
            value={draft.deviceId}
            onChange={(event) => updateDraft({ deviceId: event.target.value })}
          />
        </label>
        <div className="ek-workbench__binding-candidates">
          <button
            type="button"
            disabled={!service || !query || candidates.status === "loading"}
            onClick={() => { void loadCandidates(); }}
          >{candidates.status === "loading"
              ? t("dataBinding.form.device.loading")
              : t("dataBinding.form.device.load")}</button>
          {candidatesStale ? (
            <small role="status">{t("dataBinding.form.device.stale")}</small>
          ) : candidates.status === "error" ? (
            <small role="alert">
              {candidates.problems.length > 0
                ? candidates.problems.map((problem) => formatDataQueryProblem(context.i18n, problem)).join(" ")
                : candidates.message ?? t("dataBinding.problem.candidatesFailed")}
            </small>
          ) : candidates.status === "ready" ? (
            currentCandidates.length === 0 ? (
              <small role="status">{t("dataBinding.form.device.none")}</small>
            ) : (
              <label className="ek-workbench__field">
                <span>{t("dataBinding.form.device.candidates")}</span>
                <select
                  aria-label={t("dataBinding.form.device.candidates")}
                  value={currentCandidates.some((entity) => entity.entityId === draft.deviceId) ? draft.deviceId : ""}
                  onChange={(event) => updateDraft({ deviceId: event.target.value })}
                >
                  <option value="">{t("dataBinding.form.device.placeholder")}</option>
                  {currentCandidates.map((entity) => (
                    <option key={entity.entityId} value={entity.entityId}>
                      {entity.displayName ? `${entity.displayName} (${entity.entityId})` : entity.entityId}
                    </option>
                  ))}
                </select>
              </label>
            )
          ) : null}
        </div>

        <fieldset className="ek-workbench__binding-parameters">
          <legend>{t("dataBinding.form.parameters")}</legend>
          {query && query.parameters.length > 0 ? (
            <p className="ek-workbench__binding-hint">{t("dataBinding.form.parameters.note")}</p>
          ) : null}
          {!query || query.parameters.length === 0 ? (
            <small>{t("dataBinding.form.parameters.empty")}</small>
          ) : query.parameters.map((parameter) => {
            const entry = draft.overrides[parameter.name] ?? { enabled: false, text: "" };
            return (
              <div
                key={parameter.name}
                className="ek-workbench__binding-parameter"
                role="group"
                aria-label={parameter.name}
              >
                <div className="ek-workbench__binding-parameter-main">
                  <strong>{parameter.name}</strong>
                  <small>{t(PARAMETER_TYPE_MESSAGE_KEYS[parameter.type])}</small>
                  <small>
                    {t("dataBinding.form.parameters.default")}: {
                      Object.prototype.hasOwnProperty.call(parameter, "defaultValue")
                        ? formatParameterValue(parameter.defaultValue as DataParameterValue)
                        : t("dataBinding.form.parameters.noValue")
                    }
                  </small>
                </div>
                <label className="ek-workbench__request-check">
                  <input
                    type="checkbox"
                    aria-label={t("dataBinding.form.parameters.overrideAria", { name: parameter.name })}
                    checked={entry.enabled}
                    onChange={(event) => updateOverride(parameter.name, {
                      enabled: event.target.checked,
                      ...(event.target.checked && parameter.type === "boolean" && entry.text === ""
                        ? { text: "false" }
                        : {})
                    })}
                  />
                  <span>{t("dataBinding.form.parameters.override")}</span>
                </label>
                {entry.enabled ? (
                  <DataParameterValueInput
                    id={`${id}-${parameter.name}-override`}
                    type={parameter.type}
                    value={entry.text}
                    disabled={false}
                    label={t("dataBinding.form.parameters.overrideValueAria", { name: parameter.name })}
                    trueLabel={t("dataSources.request.boolean.true")}
                    falseLabel={t("dataSources.request.boolean.false")}
                    onChange={(value) => updateOverride(parameter.name, { text: value })}
                  />
                ) : null}
              </div>
            );
          })}
        </fieldset>

        <fieldset className="ek-workbench__binding-details">
          <legend>{t("dataBinding.form.details")}</legend>
          <p className="ek-workbench__binding-hint">{t("dataBinding.form.details.hint")}</p>
          {draft.details.length === 0 ? (
            <small>{t("dataBinding.form.details.required")}</small>
          ) : draft.details.map((detail, index) => {
            const property = query?.mapping.properties.find((candidate) => candidate.key === detail.key) ?? null;
            const name = property?.label ?? detail.key;
            return (
              <div key={detail.key} className="ek-workbench__binding-detail-row">
                <div className="ek-workbench__binding-detail-name">
                  <strong>{name}</strong>
                  <small>{property?.unit ?? ""}</small>
                </div>
                <button
                  type="button"
                  aria-label={t("dataBinding.form.details.moveUpAria", { name })}
                  disabled={index === 0}
                  onClick={() => moveDetail(detail.key, -1)}
                >{t("dataBinding.form.details.moveUp")}</button>
                <button
                  type="button"
                  aria-label={t("dataBinding.form.details.moveDownAria", { name })}
                  disabled={index === draft.details.length - 1}
                  onClick={() => moveDetail(detail.key, 1)}
                >{t("dataBinding.form.details.moveDown")}</button>
                <label className="ek-workbench__field">
                  <span>{t("dataBinding.form.details.label")}</span>
                  <input
                    type="text"
                    aria-label={t("dataBinding.form.details.labelAria", { name })}
                    placeholder={t("dataBinding.form.details.labelPlaceholder")}
                    value={detail.label}
                    onChange={(event) => updateDetail(detail.key, { label: event.target.value })}
                  />
                </label>
                {property?.type === "number" ? (
                  <label className="ek-workbench__field">
                    <span>{t("dataBinding.form.details.precision")}</span>
                    <input
                      type="number"
                      min="0"
                      max={DATA_DETAIL_MAX_PRECISION}
                      step="1"
                      aria-label={t("dataBinding.form.details.precisionAria", { name })}
                      value={detail.precision}
                      onChange={(event) => updateDetail(detail.key, { precision: event.target.value })}
                    />
                  </label>
                ) : null}
                <button
                  type="button"
                  aria-label={t("dataBinding.form.details.removeAria", { name })}
                  onClick={() => removeDetail(detail.key)}
                >{t("dataBinding.form.details.remove")}</button>
              </div>
            );
          })}
          {unavailableProperties.length > 0 ? (
            <div className="ek-workbench__binding-add-details">
              <span>{t("dataBinding.form.details.add")}</span>
              {unavailableProperties.map((property) => (
                <button
                  key={property.key}
                  type="button"
                  aria-label={t("dataBinding.form.details.addAria", { name: property.label })}
                  onClick={() => addDetail(property.key)}
                >{property.label}</button>
              ))}
            </div>
          ) : null}
        </fieldset>

        <label className="ek-workbench__request-check">
          <input
            type="checkbox"
            aria-label={t("dataBinding.form.enabled")}
            checked={draft.enabled}
            onChange={(event) => updateDraft({ enabled: event.target.checked })}
          />
          <span>{t("dataBinding.form.enabled")}</span>
        </label>
        <small className="ek-workbench__binding-hint">{t("dataBinding.form.enabledHint")}</small>

        {problems.length > 0 ? (
          <div className="ek-workbench__binding-problems" role="alert" aria-label={t("dataBinding.form.problems")}>
            <strong>{t("dataBinding.form.problems")}</strong>
            <ul>
              {problems.map((problem, index) => (
                <li key={`${problem.code}-${problem.parameterName ?? ""}-${problem.propertyKey ?? ""}-${index}`}>
                  {formatBindingProblem(context.i18n, problem)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {status ? <p className="ek-workbench__data-status" role="status">{t(status.key, status.values)}</p> : null}

        <div className="ek-workbench__binding-actions">
          <button type="submit">{savedBinding
            ? t("dataBinding.form.save")
            : t("dataBinding.form.create")}</button>
          <button type="button" disabled={!dirty && !savedBinding} onClick={resetDraft}>
            {t("dataBinding.form.cancel")}
          </button>
          {savedBinding ? (
            <button type="button" onClick={removeBinding}>{t("dataBinding.form.unbind")}</button>
          ) : null}
        </div>
      </form>
      {queryEditorOpen ? (
        <DataQueryEditor
          key={`binding-query:${newQueryConnectionId}`}
          context={context}
          connectionId={newQueryConnectionId}
          queryId={null}
          onClose={() => setQueryEditorOpen(false)}
          onSaved={handleQuerySaved}
        />
      ) : null}
    </>
  );
}

function createDraft(
  snapshot: ResolvedWorkbenchContext["snapshot"],
  objectNodeId: string,
  fixedQueryId: string | null
): BindingDraft {
  const saved = snapshot.dataSources.bindings[objectNodeId] ?? null;
  const queries = Object.values(snapshot.dataSources.queries);
  const queryId = fixedQueryId ?? saved?.queryId ?? (queries.length === 1 ? queries[0].id : "");
  const query = queryId ? snapshot.dataSources.queries[queryId] ?? null : null;
  const overrides: Record<string, OverrideDraft> = {};
  for (const parameter of query?.parameters ?? []) {
    const stored = saved?.parameterOverrides[parameter.name];
    overrides[parameter.name] = {
      enabled: stored !== undefined,
      text: stored === undefined ? "" : formatParameterValue(stored)
    };
  }
  return {
    queryId,
    overrides,
    deviceId: saved?.deviceId ?? "",
    enabled: saved?.enabled ?? true,
    details: saved
      ? saved.details
          .filter((detail) => query?.mapping.properties.some((property) => property.key === detail.key))
          .map((detail) => ({
            key: detail.key,
            label: detail.label ?? "",
            precision: detail.precision === null ? "" : String(detail.precision)
          }))
      : (query?.mapping.properties ?? []).map((property) => ({
          key: property.key,
          label: "",
          precision: ""
        }))
  };
}

function draftOverridesForQuery(
  current: Record<string, OverrideDraft>,
  query: DataQuery | null
): Record<string, OverrideDraft> {
  const overrides: Record<string, OverrideDraft> = {};
  for (const parameter of query?.parameters ?? []) {
    overrides[parameter.name] = current[parameter.name] ?? { enabled: false, text: "" };
  }
  return overrides;
}

function detailsForQuery(details: readonly DetailDraft[], query: DataQuery | null): DetailDraft[] {
  if (!query) {
    return [];
  }
  const matching = details.filter((detail) =>
    query.mapping.properties.some((property) => property.key === detail.key)
  );
  if (matching.length > 0) {
    return matching;
  }
  return query.mapping.properties.map((property) => ({
    key: property.key,
    label: "",
    precision: ""
  }));
}

function collectOverrides(
  draft: BindingDraft,
  query: DataQuery
): Record<string, DataParameterValue> {
  const overrides: Record<string, DataParameterValue> = {};
  for (const parameter of query.parameters) {
    const entry = draft.overrides[parameter.name];
    if (!entry?.enabled) {
      continue;
    }
    overrides[parameter.name] = parseParameterText(parameter.type, entry.text);
  }
  return overrides;
}

function serializeDraft(draft: BindingDraft): string {
  return JSON.stringify({
    queryId: draft.queryId,
    overrides: draft.overrides,
    deviceId: draft.deviceId,
    enabled: draft.enabled,
    details: draft.details.map((detail) => ({
      key: detail.key,
      label: detail.label,
      precision: detail.precision
    }))
  });
}

function formatParameterValue(value: DataParameterValue): string {
  return String(value);
}

function queryOptionLabel(
  query: DataQuery,
  snapshot: ResolvedWorkbenchContext["snapshot"]
): string {
  const connection = snapshot.dataSources.connections[query.connectionId];
  return connection ? `${query.name} · ${connection.name}` : query.name;
}

function formatBindingProblem(i18n: WorkbenchI18n, problem: DataBindingProblem): string {
  return i18n.t(BINDING_PROBLEM_MESSAGE_KEYS[problem.code], {
    parameterName: problem.parameterName ?? "",
    propertyKey: problem.propertyKey ?? "",
    detail: problem.message
  });
}
