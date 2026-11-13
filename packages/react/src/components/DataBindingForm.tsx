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
  dataColorOperatorsForType,
  DATA_DETAIL_MAX_PRECISION,
  mapDataQueryBody,
  normalizeDataColorHex,
  parseParameterText,
  type DataBindingColor,
  type DataBindingProblem,
  type DataBindingProblemCode,
  type DataColorObjectCapability,
  type DataColorOperator,
  type DataColorRule,
  type DataColorTrialProblemCode,
  type DataMappedEntity,
  type DataObjectBindingInput,
  type DataParameterValue,
  type DataPropertyMapping,
  type DataQuery,
  type DataQueryProblem
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchI18n, WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { DataParameterValueInput } from "./DataParameterValueInput";
import { DataQueryEditor } from "./DataQueryEditor";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { WorkbenchSelect } from "./ui/WorkbenchSelect";
import {
  DATA_MAPPING_PROBLEM_MESSAGE_KEYS,
  formatDataQueryProblem,
  PARAMETER_TYPE_MESSAGE_KEYS
} from "./data-query-problem-messages";

export interface DataBindingFormProps {
  context: ResolvedWorkbenchContext;
  objectNodeId: string;
  fixedQueryId?: string | null;
  onDirtyChange?(dirty: boolean): void;
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

interface ColorRuleDraft {
  operator: DataColorOperator;
  value: string;
  max: string;
  color: string;
}

interface ColorDraft {
  propertyKey: string;
  rules: ColorRuleDraft[];
}

interface BindingDraft {
  queryId: string;
  overrides: Record<string, OverrideDraft>;
  deviceId: string;
  enabled: boolean;
  details: DetailDraft[];
  color: ColorDraft | null;
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
  "color-invalid": "dataBinding.problem.colorInvalid",
  "color-operator": "dataBinding.problem.colorOperator",
  "color-property-unknown": "dataBinding.problem.colorPropertyUnknown",
  "color-rules-required": "dataBinding.problem.colorRulesRequired",
  "color-value": "dataBinding.problem.colorValue",
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

const COLOR_TRIAL_PROBLEM_MESSAGE_KEYS = {
  "color-required": "dataBinding.colors.trial.problem.color-required",
  "preview-active": "dataBinding.colors.trial.problem.preview-active",
  "target-not-found": "dataBinding.colors.trial.problem.target-not-found"
} satisfies Record<DataColorTrialProblemCode, WorkbenchMessageKey>;

const COLOR_PALETTE = ["#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7"] as const;

export function DataBindingForm({
  context,
  objectNodeId,
  fixedQueryId = null,
  onDirtyChange
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
  const [trialProblem, setTrialProblem] = useState<WorkbenchMessageKey | null>(null);
  const candidateRunRef = useRef<string | null>(null);
  const lastSavedSignatureRef = useRef(savedSignature);
  const id = useId();
  const t = context.i18n.t;

  const query = draft.queryId ? snapshot.dataSources.queries[draft.queryId] ?? null : null;
  const connection = query ? snapshot.dataSources.connections[query.connectionId] ?? null : null;
  const connections = Object.values(snapshot.dataSources.connections);
  const queryConnectionId = connections.some((connection) => connection.id === newQueryConnectionId)
    ? newQueryConnectionId
    : connections[0]?.id ?? "";
  const queries = Object.values(snapshot.dataSources.queries);
  const service = context.editor.getDataService?.() ?? null;
  const signature = useMemo(
    () => JSON.stringify([draft.queryId, draft.overrides, query, connection]),
    [draft.queryId, draft.overrides, query, connection]
  );
  const dirty = serializeDraft(draft) !== baseline;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

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

  useEffect(() => () => {
    const colorService = context.editor.getDataColorService?.();
    if (colorService?.getTrial()?.objectNodeId === objectNodeId) {
      colorService.endTrial();
    }
  }, [context.editor, objectNodeId]);

  const candidatesStale = candidates.status === "ready" && candidates.signature !== signature;
  const currentCandidates = candidates.status === "ready" && !candidatesStale ? candidates.entities : [];
  const unavailableProperties = query
    ? query.mapping.properties.filter((property) => !draft.details.some((detail) => detail.key === property.key))
    : [];
  const colorProperties = query?.mapping.properties ?? [];
  const colorProperty = draft.color
    ? colorProperties.find((property) => property.key === draft.color?.propertyKey) ?? null
    : null;
  const dataColorService = context.editor.getDataColorService?.() ?? null;
  const colorCapability = context.dataColorState.objects[objectNodeId]?.capabilities ?? null;
  const trialActive = context.dataColorState.trial?.objectNodeId === objectNodeId;
  const previewEnabled = context.dataState.preview.enabled;
  const trialEntity = currentCandidates.find((entity) => entity.entityId === draft.deviceId) ?? null;
  const trialField = draft.color && trialEntity
    ? trialEntity.fields.find((field) => field.key === draft.color?.propertyKey) ?? null
    : null;
  const trialValue = trialField?.status === "ok" ? trialField.value : null;
  const trialHint = previewEnabled
    ? "dataBinding.colors.trial.previewActive" as const
    : trialValue === null
      ? "dataBinding.colors.trial.noValue" as const
      : null;

  function updateDraft(patch: Partial<BindingDraft>): void {
    setProblems([]);
    setDraft((current) => ({ ...current, ...patch }));
  }

  function changeQuery(queryId: string): void {
    const nextQuery = queryId ? snapshot.dataSources.queries[queryId] ?? null : null;
    endTrialForThisObject();
    setProblems([]);
    setCandidates({ status: "idle", signature: "" });
    setDraft((current) => ({
      ...current,
      queryId,
      overrides: draftOverridesForQuery(current.overrides, nextQuery),
      details: detailsForQuery(current.details, nextQuery),
      color: colorForQuery(current.color, nextQuery)
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

  function endTrialForThisObject(): void {
    if (dataColorService?.getTrial()?.objectNodeId === objectNodeId) {
      dataColorService.endTrial();
    }
    setTrialProblem(null);
  }

  function toggleColor(enabled: boolean): void {
    endTrialForThisObject();
    setProblems([]);
    setDraft((current) => ({
      ...current,
      color: enabled && query ? createDefaultColorDraft(query.mapping.properties) : null
    }));
  }

  function changeColorProperty(propertyKey: string): void {
    const property = colorProperties.find((candidate) => candidate.key === propertyKey) ?? null;
    endTrialForThisObject();
    setProblems([]);
    setDraft((current) => ({
      ...current,
      color: property
        ? { propertyKey, rules: [createDefaultColorRule(property, 0)] }
        : null
    }));
  }

  function updateColorRule(index: number, patch: Partial<ColorRuleDraft>): void {
    endTrialForThisObject();
    setProblems([]);
    setDraft((current) => current.color
      ? {
          ...current,
          color: {
            ...current.color,
            rules: current.color.rules.map((rule, ruleIndex) =>
              ruleIndex === index ? { ...rule, ...patch } : rule)
          }
        }
      : current);
  }

  function addColorRule(): void {
    if (!colorProperty || !draft.color) {
      return;
    }
    endTrialForThisObject();
    setProblems([]);
    setDraft((current) => current.color
      ? {
          ...current,
          color: {
            ...current.color,
            rules: [...current.color.rules, createDefaultColorRule(colorProperty, current.color.rules.length)]
          }
        }
      : current);
  }

  function moveColorRule(index: number, direction: -1 | 1): void {
    endTrialForThisObject();
    setProblems([]);
    setDraft((current) => {
      if (!current.color) {
        return current;
      }
      const target = index + direction;
      if (target < 0 || target >= current.color.rules.length) {
        return current;
      }
      const rules = [...current.color.rules];
      [rules[index], rules[target]] = [rules[target], rules[index]];
      return { ...current, color: { ...current.color, rules } };
    });
  }

  function removeColorRule(index: number): void {
    endTrialForThisObject();
    setProblems([]);
    setDraft((current) => current.color
      ? { ...current, color: { ...current.color, rules: current.color.rules.filter((_, ruleIndex) => ruleIndex !== index) } }
      : current);
  }

  function startDraftTrial(): void {
    if (!dataColorService || !draft.color || trialValue === null) {
      return;
    }
    setTrialProblem(null);
    const result = dataColorService.startTrial({
      objectNodeId,
      color: collectColor(draft, query),
      value: trialValue,
      source: "test"
    });
    if (!result.ok) {
      const problem = result.problems[0];
      setTrialProblem(problem ? COLOR_TRIAL_PROBLEM_MESSAGE_KEYS[problem.code] : "dataBinding.colors.trial.failed");
    }
  }

  function endDraftTrial(): void {
    dataColorService?.endTrial();
    setTrialProblem(null);
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
      method: query.method,
      readOnly: query.readOnly,
      path: query.path,
      headers: query.headers,
      parameters: query.parameters,
      successCondition: query.successCondition
    }, { overrides });
    candidateRunRef.current = handle.id;
    const result = await handle.result;
    if (candidateRunRef.current !== handle.id) {
      return;
    }
    candidateRunRef.current = null;
    if (!result.current) {
      setCandidates({ status: "idle", signature: requestSignature });
      return;
    }
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
    endTrialForThisObject();
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
      })),
      color: collectColor(draft, query)
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

  /** Restores the saved binding; also what "Discard changes" leaves behind. */
  function resetDraft(): void {
    endTrialForThisObject();
    const next = createDraft(snapshot, objectNodeId, fixedQueryId);
    setDraft(next);
    setBaseline(serializeDraft(next));
    setProblems([]);
    setCandidates({ status: "idle", signature: "" });
    setStatus({ key: "dataBinding.form.status.reset" });
  }

  function removeBinding(): void {
    endTrialForThisObject();
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
    endTrialForThisObject();
    const freshSnapshot = context.editor.getSnapshot();
    const savedQuery = freshSnapshot.dataSources.queries[savedQueryId] ?? null;
    setDraft((current) => ({
      ...current,
      queryId: savedQueryId,
      overrides: draftOverridesForQuery({}, savedQuery),
      details: detailsForQuery([], savedQuery),
      color: colorForQuery(current.color, savedQuery)
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

        {fixedQueryId ? null : (
          <section className="ek-workbench__form-section" aria-label={t("dataBinding.form.section.query")}>
            <label className="ek-workbench__field">
              <span>{t("dataBinding.form.section.query")}</span>
              <WorkbenchSelect
                aria-label={t("dataBinding.form.query")}
                value={draft.queryId}
                options={[
                  { value: "", label: t("dataBinding.form.query.placeholder") },
                  ...queries.map((item) => ({ value: item.id, label: queryOptionLabel(item, snapshot) }))
                ]}
                onChange={changeQuery}
              />
            </label>
            {queries.length === 0 ? (
              <p className="ek-workbench__binding-hint">{t("dataBinding.form.query.empty")}</p>
            ) : null}
            {connections.length === 0 ? (
              <p className="ek-workbench__binding-hint">{t("dataBinding.form.query.noConnections")}</p>
            ) : (
              <div className="ek-workbench__binding-query-create">
                {connections.length > 1 ? (
                  <label className="ek-workbench__field">
                    <span>{t("dataBinding.form.query.connection")}</span>
                    <WorkbenchSelect
                      aria-label={t("dataBinding.form.query.connection")}
                      value={queryConnectionId}
                      options={connections.map((connection) => ({
                        value: connection.id,
                        label: connection.name
                      }))}
                      onChange={setNewQueryConnectionId}
                    />
                  </label>
                ) : null}
                <Button
                  className="ek-ui-button--quiet"
                  disabled={!queryConnectionId}
                  onClick={() => setQueryEditorOpen(true)}
                >{t("dataBinding.form.query.create")}</Button>
              </div>
            )}
          </section>
        )}

        <section className="ek-workbench__form-section" aria-label={t("dataBinding.form.section.device")}>
          <label className="ek-workbench__field">
            <span>{t("dataBinding.form.device")}</span>
            <Input
              type="text"
              aria-label={t("dataBinding.form.device")}
              placeholder={t("dataBinding.form.device.placeholder")}
              value={draft.deviceId}
              onChange={(event) => updateDraft({ deviceId: event.target.value })}
            />
          </label>
          <div className="ek-workbench__binding-candidates">
            <Button
              className="ek-ui-button--quiet"
              disabled={!service || !query || candidates.status === "loading"}
              onClick={() => { void loadCandidates(); }}
            >{candidates.status === "loading"
                ? t("dataBinding.form.device.loading")
                : t("dataBinding.form.device.load")}</Button>
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
                  <WorkbenchSelect
                    aria-label={t("dataBinding.form.device.candidates")}
                    value={currentCandidates.some((entity) => entity.entityId === draft.deviceId) ? draft.deviceId : ""}
                    options={[
                      { value: "", label: t("dataBinding.form.device.placeholder") },
                      ...currentCandidates.map((entity) => ({
                        value: entity.entityId,
                        label: entity.displayName ? `${entity.displayName} (${entity.entityId})` : entity.entityId
                      }))
                    ]}
                    onChange={(entityId) => updateDraft({ deviceId: entityId })}
                  />
                </label>
              )
            ) : null}
          </div>
        </section>

        <section className="ek-workbench__form-section" aria-label={t("dataBinding.form.parameters")}>
          <h4>{t("dataBinding.form.section.parameters")}</h4>
          {query && query.parameters.length > 0 ? (
            <p className="ek-workbench__binding-hint">{t("dataBinding.form.parameters.note")}</p>
          ) : null}
          {!query || query.parameters.length === 0 ? (
            <small>{t("dataBinding.form.parameters.empty")}</small>
          ) : (
            <div className="ek-workbench__binding-parameters" role="group" aria-label={t("dataBinding.form.parameters")}>
              {query.parameters.map((parameter) => {
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
            </div>
          )}
        </section>

        <section className="ek-workbench__form-section" aria-label={t("dataBinding.form.section.details")}>
          <h4>{t("dataBinding.form.section.details")}</h4>
          <p className="ek-workbench__binding-hint">{t("dataBinding.form.details.hint")}</p>
          {draft.details.length > 0 ? (
            <div className="ek-workbench__binding-details">
              {draft.details.map((detail, index) => {
                const property = query?.mapping.properties.find((item) => item.key === detail.key);
                const name = property?.label ?? detail.key;
                return (
                  <div
                    key={detail.key}
                    className="ek-workbench__binding-detail-row"
                    role="group"
                    aria-label={name}
                  >
                    <div className="ek-workbench__binding-detail-name">
                      <strong>{name}</strong>
                      <small>{property?.unit || detail.key}</small>
                      {index > 0 ? (
                        <Button
                          className="ek-ui-button--quiet"
                          aria-label={t("dataBinding.form.details.moveUpAria", { name })}
                          onClick={() => moveDetail(detail.key, -1)}
                        >{t("dataBinding.form.details.moveUp")}</Button>
                      ) : null}
                      {index < draft.details.length - 1 ? (
                        <Button
                          className="ek-ui-button--quiet"
                          aria-label={t("dataBinding.form.details.moveDownAria", { name })}
                          onClick={() => moveDetail(detail.key, 1)}
                        >{t("dataBinding.form.details.moveDown")}</Button>
                      ) : null}
                      {draft.details.length > 1 ? (
                        <Button
                          className="ek-ui-button--quiet"
                          aria-label={t("dataBinding.form.details.removeAria", { name })}
                          onClick={() => removeDetail(detail.key)}
                        >{t("dataBinding.form.details.remove")}</Button>
                      ) : null}
                    </div>
                    <label className="ek-workbench__field">
                      <span>{t("dataBinding.form.details.label")}</span>
                      <Input
                        type="text"
                        aria-label={t("dataBinding.form.details.labelAria", { name })}
                        value={detail.label}
                        placeholder={t("dataBinding.form.details.labelPlaceholder")}
                        onChange={(event) => updateDetail(detail.key, { label: event.target.value })}
                      />
                    </label>
                    {property?.type === "number" ? (
                      <label className="ek-workbench__field">
                        <span>{t("dataBinding.form.details.precision")}</span>
                        <Input
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
                  </div>
                );
              })}
            </div>
          ) : (
            <small className="ek-workbench__binding-hint">{t("dataBinding.form.details.empty")}</small>
          )}
          {unavailableProperties.length > 0 ? (
            <div className="ek-workbench__binding-add-details">
              <span>{t("dataBinding.form.details.add")}</span>
              {unavailableProperties.map((property) => (
                <Button
                  key={property.key}
                  className="ek-ui-button--quiet"
                  aria-label={t("dataBinding.form.details.addAria", { name: property.label })}
                  onClick={() => addDetail(property.key)}
                >{property.label}</Button>
              ))}
            </div>
          ) : null}
        </section>

        <section
          className="ek-workbench__form-section ek-workbench__binding-colors"
          role="group"
          aria-label={t("dataBinding.form.section.colors")}
        >
          <h4>{t("dataBinding.form.section.colors")}</h4>
          <div className="ek-workbench__binding-colors-fields">
            <label className="ek-workbench__request-check">
              <input
                type="checkbox"
                aria-label={t("dataBinding.form.colors.enable")}
                checked={draft.color !== null}
                onChange={(event) => toggleColor(event.target.checked)}
              />
              <span>{t("dataBinding.form.colors.enable")}</span>
            </label>
            {draft.color ? (
              <>
                <p className="ek-workbench__binding-hint">{t("dataBinding.form.colors.hint")}</p>
                <label className="ek-workbench__field">
                  <span>{t("dataBinding.form.colors.property")}</span>
                  <WorkbenchSelect
                    aria-label={t("dataBinding.form.colors.property")}
                    value={draft.color.propertyKey}
                    options={[
                      { value: "", label: t("dataBinding.form.colors.propertyPlaceholder") },
                      ...colorProperties.map((property) => ({ value: property.key, label: property.label }))
                    ]}
                    onChange={changeColorProperty}
                  />
                </label>
                <div
                  className="ek-workbench__binding-color-rules"
                  role="group"
                  aria-label={t("dataBinding.form.colors.rules")}
                >
                  {draft.color.rules.length === 0 ? (
                    <small>{t("dataBinding.problem.colorRulesRequired")}</small>
                  ) : draft.color.rules.map((rule, index) => {
                    const rulePropertyType = colorProperty?.type ?? "string";
                    const operators = dataColorOperatorsForType(rulePropertyType);
                    const label = t("dataBinding.form.colors.rule", { index: index + 1 });
                    return (
                      <div
                        key={index}
                        className="ek-workbench__binding-color-rule"
                        role="group"
                        aria-label={label}
                      >
                        <span className="ek-workbench__binding-color-order" aria-hidden="true">{index + 1}</span>
                        <label className="ek-workbench__field">
                          <span>{t("dataBinding.form.colors.operator")}</span>
                          <select
                            aria-label={`${label} · ${t("dataBinding.form.colors.operator")}`}
                            value={rule.operator}
                            onChange={(event) => updateColorRule(index, {
                              operator: event.target.value as DataColorOperator
                            })}
                          >
                            {operators.map((operator) => (
                              <option key={operator} value={operator}>
                                {t(`dataBinding.color.operator.${operator}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="ek-workbench__field">
                          <span>{t("dataBinding.form.colors.value")}</span>
                          {rulePropertyType === "boolean" ? (
                            <select
                              aria-label={`${label} · ${t("dataBinding.form.colors.value")}`}
                              value={rule.value === "false" ? "false" : "true"}
                              onChange={(event) => updateColorRule(index, { value: event.target.value })}
                            >
                              <option value="true">{t("dataSources.request.boolean.true")}</option>
                              <option value="false">{t("dataSources.request.boolean.false")}</option>
                            </select>
                          ) : (
                            <input
                              type={rulePropertyType === "number" ? "number" : "text"}
                              step={rulePropertyType === "number" ? "any" : undefined}
                              aria-label={`${label} · ${t("dataBinding.form.colors.value")}`}
                              value={rule.value}
                              onChange={(event) => updateColorRule(index, { value: event.target.value })}
                            />
                          )}
                        </label>
                        {rule.operator === "between" ? (
                          <label className="ek-workbench__field">
                            <span>{t("dataBinding.form.colors.max")}</span>
                            <input
                              type="number"
                              step="any"
                              aria-label={`${label} · ${t("dataBinding.form.colors.max")}`}
                              value={rule.max}
                              onChange={(event) => updateColorRule(index, { max: event.target.value })}
                            />
                          </label>
                        ) : null}
                        <label className="ek-workbench__field ek-workbench__binding-color-swatch">
                          <span>{t("dataBinding.form.colors.color")}</span>
                          <input
                            type="color"
                            aria-label={`${label} · ${t("dataBinding.form.colors.color")}`}
                            value={normalizeDataColorHex(rule.color) ?? "#22c55e"}
                            onChange={(event) => updateColorRule(index, { color: event.target.value })}
                          />
                        </label>
                        <div
                          className="ek-workbench__binding-color-palette"
                          role="group"
                          aria-label={t("dataBinding.form.colors.palette")}
                        >
                          {COLOR_PALETTE.map((swatch) => (
                            <button
                              key={swatch}
                              type="button"
                              className="ek-workbench__binding-color-chip"
                              style={{ backgroundColor: swatch }}
                              aria-label={t("dataBinding.form.colors.swatch", { color: swatch })}
                              aria-pressed={normalizeDataColorHex(rule.color) === swatch}
                              onClick={() => updateColorRule(index, { color: swatch })}
                            />
                          ))}
                        </div>
                        <div className="ek-workbench__binding-color-actions">
                          <button
                            type="button"
                            aria-label={t("dataBinding.form.colors.moveUpAria", { index: index + 1 })}
                            disabled={index === 0}
                            onClick={() => moveColorRule(index, -1)}
                          >{t("dataBinding.form.colors.moveUp")}</button>
                          <button
                            type="button"
                            aria-label={t("dataBinding.form.colors.moveDownAria", { index: index + 1 })}
                            disabled={index === draft.color!.rules.length - 1}
                            onClick={() => moveColorRule(index, 1)}
                          >{t("dataBinding.form.colors.moveDown")}</button>
                          <button
                            type="button"
                            aria-label={t("dataBinding.form.colors.removeAria", { index: index + 1 })}
                            onClick={() => removeColorRule(index)}
                          >{t("dataBinding.form.colors.remove")}</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={addColorRule}>{t("dataBinding.form.colors.addRule")}</button>
                <small className="ek-workbench__binding-hint">{t("dataBinding.form.colors.default")}</small>
                {colorCapability ? (
                  <div
                    className="ek-workbench__binding-color-capability"
                    data-status={colorCapability.status}
                    role="status"
                  >
                    <span>{colorCapabilityLabel(colorCapability, t)}</span>
                    {colorCapability.problems.length > 0 ? (
                      <ul>
                        {colorCapability.problems.map((problem, index) => (
                          <li key={`${problem.meshName}-${problem.slotIndex}-${index}`}>
                            {t("dataBinding.colors.capability.problem", {
                              materialType: problem.materialType,
                              meshName: problem.meshName
                            })}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                <div className="ek-workbench__binding-color-trial">
                  {trialActive ? (
                    <>
                      <span role="status">{t("dataBinding.colors.trial.active")}</span>
                      <button type="button" onClick={endDraftTrial}>{t("dataBinding.colors.trial.end")}</button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={!dataColorService || trialHint !== null}
                        onClick={startDraftTrial}
                      >{t("dataBinding.colors.trial.start")}</button>
                      {trialHint ? <small>{t(trialHint)}</small> : null}
                    </>
                  )}
                  {trialProblem ? <small role="alert">{t(trialProblem)}</small> : null}
                </div>
              </>
            ) : null}
          </div>
        </section>

        <section className="ek-workbench__form-section" aria-label={t("dataBinding.form.section.state")}>
          <h4>{t("dataBinding.form.section.state")}</h4>
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
        </section>

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
          <Button type="submit">{savedBinding
            ? t("dataBinding.form.save")
            : t("dataBinding.form.create")}</Button>
          <Button
            className="ek-ui-button--quiet"
            disabled={!dirty && !savedBinding}
            onClick={resetDraft}
          >
            {t("dataBinding.form.cancel")}
          </Button>
          {savedBinding ? (
            <Button
              className="ek-ui-button--quiet"
              onClick={removeBinding}
            >{t("dataBinding.form.unbind")}</Button>
          ) : null}
        </div>
      </form>
      {queryEditorOpen ? (
        <DataQueryEditor
          key={`binding-query:${queryConnectionId}`}
          context={context}
          connectionId={queryConnectionId}
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
        })),
    color: saved?.color
      ? {
          propertyKey: saved.color.propertyKey,
          rules: saved.color.rules.map((rule) => ({
            operator: rule.operator,
            value: String(rule.value),
            max: rule.max === null ? "" : String(rule.max),
            color: rule.color
          }))
        }
      : null
  };
}

function createDefaultColorDraft(properties: readonly DataPropertyMapping[]): ColorDraft | null {
  const property = properties[0];
  return property
    ? { propertyKey: property.key, rules: [createDefaultColorRule(property, 0)] }
    : null;
}

function createDefaultColorRule(property: DataPropertyMapping, index: number): ColorRuleDraft {
  return {
    operator: property.type === "number" ? "gte" : "eq",
    value: property.type === "boolean" ? "true" : property.type === "number" ? "0" : "",
    max: "",
    color: COLOR_PALETTE[index % COLOR_PALETTE.length]!
  };
}

function collectColor(draft: BindingDraft, query: DataQuery | null): DataBindingColor | null {
  if (!draft.color) {
    return null;
  }
  const property = query?.mapping.properties.find((candidate) => candidate.key === draft.color?.propertyKey) ?? null;
  const type = property?.type ?? "string";
  return {
    propertyKey: draft.color.propertyKey,
    rules: draft.color.rules.map((rule): DataColorRule => ({
      operator: rule.operator,
      value: parseColorRuleValue(type, rule.value),
      max: rule.operator === "between" ? parseColorRuleNumber(rule.max) : null,
      color: rule.color
    }))
  };
}

function parseColorRuleValue(type: "number" | "string" | "boolean", text: string): DataParameterValue {
  if (type === "boolean") {
    return text === "true";
  }
  if (type === "number") {
    return parseColorRuleNumber(text);
  }
  return text;
}

function parseColorRuleNumber(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text);
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

function colorForQuery(color: ColorDraft | null, query: DataQuery | null): ColorDraft | null {
  if (!color) {
    return null;
  }
  return query?.mapping.properties.some((property) => property.key === color.propertyKey)
    ? color
    : null;
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
    })),
    color: draft.color
      ? {
          propertyKey: draft.color.propertyKey,
          rules: draft.color.rules.map((rule) => ({
            operator: rule.operator,
            value: rule.value,
            max: rule.max,
            color: rule.color
          }))
        }
      : null
  });
}

function colorCapabilityLabel(
  capability: DataColorObjectCapability,
  t: WorkbenchI18n["t"]
): string {
  switch (capability.status) {
    case "unavailable":
      return t("dataBinding.colors.capability.unavailable");
    case "unsupported":
      return t("dataBinding.colors.capability.unsupported");
    case "partial":
      return t("dataBinding.colors.capability.partial", {
        count: capability.slotCount - capability.supportedSlotCount,
        total: capability.slotCount
      });
    default:
      return t("dataBinding.colors.capability.applied");
  }
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
