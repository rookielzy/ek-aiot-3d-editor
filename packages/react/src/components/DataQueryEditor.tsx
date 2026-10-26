import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent
} from "react";
import {
  buildDataGetRequest,
  buildSaveDataQueryCommand,
  formatDataPath,
  mapDataQueryBody,
  validateDataQueryMapping,
  type DataMappedField,
  type DataMappingProblem,
  type DataMappingResult,
  type DataParameterType,
  type DataParameterValue,
  type DataPath,
  type DataQuality,
  type DataQueryDefinition,
  type DataQueryDefinitionProblem,
  type DataQueryMapping,
  type DataQueryParameterOverrides,
  type DataQueryRunState,
  type DataServiceState,
  type DataTimeFormat,
  type JsonValue
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchI18n, WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import {
  collectQueryOverrides,
  createQueryParameterForm,
  hasQueryOverrides,
  toQueryParameterDrafts,
  type QueryParameterForm
} from "./data-query-form";
import {
  buildMappingFromForm,
  buildQueryDefinitionFromForm,
  createQueryFormState,
  createQueryMapEntryForm,
  createQueryPropertyForm,
  createQueryQualityEntryForm,
  queryDraftSignature,
  queryFormFromQuery,
  resolvedParametersForForm,
  serializeQueryForm,
  type QueryFormProblem,
  type QueryFormState,
  type QueryMapEntryForm,
  type QueryPropertyForm,
  type QueryQualityEntryForm
} from "./data-query-mapping-form";
import { DataParameterValueInput } from "./DataParameterValueInput";
import {
  DATA_QUERY_DEFINITION_PROBLEM_MESSAGE_KEYS,
  DATA_QUERY_PROBLEM_MESSAGE_KEYS,
  DATA_QUERY_RUN_STATUS_MESSAGE_KEYS,
  formatDataQueryProblem,
  PARAMETER_TYPE_MESSAGE_KEYS
} from "./data-query-problem-messages";

export interface DataQueryEditorProps {
  context: ResolvedWorkbenchContext;
  connectionId: string;
  queryId: string | null;
  onClose(): void;
  onSaved(queryId: string, created: boolean): void;
}

interface QuerySample {
  source: "request" | "example";
  body: JsonValue;
  receivedAt: number;
  executionId: string;
  signature: string;
  parameters: Readonly<Record<string, DataParameterValue>>;
  usedOverrides: boolean;
  status: number | null;
}

const EMPTY_SERVICE_STATE: DataServiceState = Object.freeze({
  executorAvailable: false,
  configRevision: 0,
  run: null
});

const MAPPING_PROBLEM_MESSAGE_KEYS = {
  "display-name-invalid": "dataSources.mappingProblem.displayNameInvalid",
  "entity-id-duplicate": "dataSources.mappingProblem.entityIdDuplicate",
  "entity-id-invalid": "dataSources.mappingProblem.entityIdInvalid",
  "entity-id-missing": "dataSources.mappingProblem.entityIdMissing",
  "observed-at-future": "dataSources.mappingProblem.observedAtFuture",
  "observed-at-invalid": "dataSources.mappingProblem.observedAtInvalid",
  "observed-at-missing": "dataSources.mappingProblem.observedAtMissing",
  "property-allowed": "dataSources.mappingProblem.propertyAllowed",
  "property-conversion": "dataSources.mappingProblem.propertyConversion",
  "property-missing": "dataSources.mappingProblem.propertyMissing",
  "property-null": "dataSources.mappingProblem.propertyNull",
  "property-range": "dataSources.mappingProblem.propertyRange",
  "property-type": "dataSources.mappingProblem.propertyType",
  "root-missing": "dataSources.mappingProblem.rootMissing",
  "root-type": "dataSources.mappingProblem.rootType",
  "source-quality-invalid": "dataSources.mappingProblem.sourceQualityInvalid"
} satisfies Record<DataMappingProblem["code"], WorkbenchMessageKey>;

const QUALITY_MESSAGE_KEYS = {
  good: "dataSources.mapping.quality.good",
  uncertain: "dataSources.mapping.quality.uncertain",
  bad: "dataSources.mapping.quality.bad",
  unknown: "dataSources.mapping.quality.unknown"
} satisfies Record<DataQuality, WorkbenchMessageKey>;

const PROPERTY_TYPE_MESSAGE_KEYS = {
  number: "dataSources.mapping.type.number",
  string: "dataSources.mapping.type.string",
  boolean: "dataSources.mapping.type.boolean"
} satisfies Record<QueryPropertyForm["type"], WorkbenchMessageKey>;

const TRANSFORM_MESSAGE_KEYS = {
  raw: "dataSources.mapping.transform.raw",
  number: "dataSources.mapping.transform.number",
  scale: "dataSources.mapping.transform.scale",
  map: "dataSources.mapping.transform.map"
} satisfies Record<QueryPropertyForm["transformKind"], WorkbenchMessageKey>;

const MODE_MESSAGE_KEYS = {
  array: "dataSources.mapping.mode.array",
  single: "dataSources.mapping.mode.single"
} satisfies Record<QueryFormState["mode"], WorkbenchMessageKey>;

const IDENTITY_KIND_MESSAGE_KEYS = {
  path: "dataSources.mapping.identity.path",
  parameter: "dataSources.mapping.identity.parameter",
  literal: "dataSources.mapping.identity.literal"
} satisfies Record<QueryFormState["identityKind"], WorkbenchMessageKey>;

const VALUE_TYPE_MESSAGE_KEYS = {
  string: "dataSources.mapping.identity.valueType.string",
  number: "dataSources.mapping.identity.valueType.number"
} satisfies Record<QueryFormState["identityValueType"], WorkbenchMessageKey>;

const TIME_FORMAT_MESSAGE_KEYS = {
  iso: "dataSources.mapping.observedAt.format.iso",
  "unix-seconds": "dataSources.mapping.observedAt.format.unixSeconds",
  "unix-milliseconds": "dataSources.mapping.observedAt.format.unixMilliseconds"
} satisfies Record<DataTimeFormat, WorkbenchMessageKey>;

export function DataQueryEditor({
  context,
  connectionId,
  queryId,
  onClose,
  onSaved
}: DataQueryEditorProps) {
  const connection = context.snapshot.dataSources.connections[connectionId];
  const storedQuery = queryId ? context.snapshot.dataSources.queries[queryId] ?? null : null;
  const [form, setForm] = useState<QueryFormState>(() =>
    storedQuery ? queryFormFromQuery(storedQuery) : createQueryFormState()
  );
  const [problems, setProblems] = useState<DataQueryDefinitionProblem[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const [sample, setSample] = useState<QuerySample | null>(null);
  const [sampleText, setSampleText] = useState("");
  const [sampleError, setSampleError] = useState<WorkbenchMessageKey | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const t = context.i18n.t;
  const discardId = useId();
  const suggestionListId = useId();

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
  const run = runId && dataState.run?.id === runId ? dataState.run : null;
  const running = run?.status === "running";

  const parameterDrafts = useMemo(() => toQueryParameterDrafts(form.parameters), [form.parameters]);
  const overrides = useMemo(() => collectQueryOverrides(form.parameters), [form.parameters]);
  const mappingBuild = useMemo(() => buildMappingFromForm(form), [form]);
  const mappingValidation = useMemo(
    () => mappingBuild.mapping
      ? validateDataQueryMapping(mappingBuild.mapping, { parameters: parameterDrafts })
      : null,
    [mappingBuild, parameterDrafts]
  );
  const mapping = mappingBuild.problems.length === 0 && mappingValidation?.ok
    ? mappingValidation.value ?? null
    : null;
  const signature = useMemo(() => queryDraftSignature(form, overrides), [form, overrides]);
  const sampleStale = sample !== null && sample.signature !== signature;
  const preview = useMemo(
    () => sample && mapping
      ? mapDataQueryBody(mapping, sample.body, {
          connectionId,
          queryId,
          executionId: sample.executionId,
          receivedAt: sample.receivedAt,
          parameters: sample.parameters
        })
      : null,
    [sample, mapping, connectionId, queryId]
  );
  const suggestions = useMemo(() => collectPathSuggestions(sample?.body), [sample?.body]);
  const dirty = serializeQueryForm(form) !== form.baseline;

  useEffect(() => {
    service?.invalidateQueryRuns();
    return () => {
      service?.invalidateQueryRuns();
    };
  }, [service]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    if (discardOpen) {
      keepEditingRef.current?.focus();
    }
  }, [discardOpen]);

  function updateForm(patch: Partial<QueryFormState>): void {
    setProblems([]);
    setForm((current) => ({ ...current, ...patch }));
  }

  function updateRequestForm(patch: Partial<QueryFormState>): void {
    service?.invalidateQueryRuns();
    setRunId(null);
    updateForm(patch);
  }

  function updateParameter(id: string, patch: Partial<QueryParameterForm>): void {
    updateRequestForm({
      parameters: form.parameters.map((parameter) =>
        parameter.id === id ? { ...parameter, ...patch } : parameter
      )
    });
  }

  function addParameter(): void {
    updateRequestForm({ parameters: [...form.parameters, createQueryParameterForm()] });
  }

  function removeParameter(id: string): void {
    updateRequestForm({ parameters: form.parameters.filter((parameter) => parameter.id !== id) });
  }

  function changeParameterType(id: string, type: DataParameterType): void {
    const initialText = type === "boolean" ? "false" : "";
    updateParameter(id, { type, defaultText: initialText, overrideText: initialText });
  }

  function updateProperty(index: number, patch: Partial<QueryPropertyForm>): void {
    updateForm({
      properties: form.properties.map((property, propertyIndex) =>
        propertyIndex === index ? { ...property, ...patch } : property
      )
    });
  }

  function changePropertyType(index: number, type: QueryPropertyForm["type"]): void {
    const current = form.properties[index];
    const transformKind = (type === "number" || current.transformKind === "raw" || current.transformKind === "map")
      ? current.transformKind
      : "raw";
    updateProperty(index, { type, transformKind });
  }

  function changePropertyTransform(index: number, transformKind: QueryPropertyForm["transformKind"]): void {
    const current = form.properties[index];
    updateProperty(index, {
      transformKind,
      mapEntries: transformKind === "map" && current.mapEntries.length === 0
        ? [createQueryMapEntryForm()]
        : current.mapEntries
    });
  }

  function updateMapEntry(propertyIndex: number, entryId: string, patch: Partial<QueryMapEntryForm>): void {
    const property = form.properties[propertyIndex];
    updateProperty(propertyIndex, {
      mapEntries: property.mapEntries.map((entry) =>
        entry.id === entryId ? { ...entry, ...patch } : entry
      )
    });
  }

  function updateQualityEntry(entryId: string, patch: Partial<QueryQualityEntryForm>): void {
    updateForm({
      qualityEntries: form.qualityEntries.map((entry) =>
        entry.id === entryId ? { ...entry, ...patch } : entry
      )
    });
  }

  function changeMode(mode: QueryFormState["mode"]): void {
    updateForm({
      mode,
      identityKind: mode === "array" && form.identityKind !== "path" ? "path" : form.identityKind
    });
  }

  async function runRequest(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!service || running) {
      return;
    }
    service.invalidateQueryRuns();
    setSampleError(null);
    setRunId(null);
    const requestSignature = queryDraftSignature(form, overrides);
    const requestOverrides = overrides;
    const usedOverrides = hasQueryOverrides(form.parameters);
    const handle = service.executeQueryDraft({
      connectionId,
      path: form.path,
      parameters: parameterDrafts
    }, { overrides: requestOverrides });
    setRunId(handle.id);
    const result = await handle.result;
    if (!result.current || result.status !== "success" || !result.response) {
      return;
    }
    if (result.response.bodyKind !== "json" || result.response.json === undefined) {
      setSampleError(
        result.response.bodyKind === "empty"
          ? "dataSources.sample.emptyBody"
          : "dataSources.sample.invalidJson"
      );
      return;
    }
    const body = result.response.json;
    setSample({
      source: "request",
      body,
      receivedAt: result.response.receivedAt,
      executionId: result.id,
      signature: requestSignature,
      parameters: result.request?.parameters ?? resolvedParametersForForm(form, requestOverrides),
      usedOverrides,
      status: result.response.status
    });
    setSampleText(JSON.stringify(body, null, 2));
  }

  function applyExample(): void {
    let body: JsonValue;
    try {
      body = JSON.parse(sampleText) as JsonValue;
    } catch {
      setSampleError("dataSources.sample.invalidJson");
      return;
    }
    setSampleError(null);
    setSample({
      source: "example",
      body,
      receivedAt: Date.now(),
      executionId: `example-${Date.now()}`,
      signature,
      parameters: resolvedParametersForForm(form, overrides),
      usedOverrides: false,
      status: null
    });
  }

  function cancelRun(): void {
    if (run && service) {
      service.cancelQueryRun(run.id);
    }
  }

  function requestClose(): void {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  }

  function discardChanges(): void {
    setDiscardOpen(false);
    onClose();
  }

  function save(): void {
    setShowValidation(true);
    setProblems([]);
    if (mappingBuild.problems.length > 0 || !mapping) {
      return;
    }
    const definition = buildQueryDefinitionFromForm(form, connectionId, mapping);
    const result = buildSaveDataQueryCommand(context.snapshot, definition, { queryId });
    if (!result.ok) {
      setProblems(result.problems);
      return;
    }
    const previousIds = new Set(Object.keys(context.snapshot.dataSources.queries));
    const dispatched = context.dispatch(result.command);
    if (!dispatched.ok) {
      setProblems([{
        field: "query",
        code: "command-failed",
        message: dispatched.error ?? ""
      }]);
      return;
    }
    const savedId = queryId ?? Object.keys(dispatched.snapshot.dataSources.queries).find((id) => !previousIds.has(id));
    if (savedId) {
      onSaved(savedId, queryId === null);
    }
  }

  const title = queryId
    ? t("dataSources.queryEditor.editTitle", { name: storedQuery?.name ?? "" })
    : t("dataSources.queryEditor.newTitle", { connection: connection?.name ?? "" });

  return (
    <section
      className="ek-workbench__query-editor"
      role="dialog"
      aria-modal="true"
      aria-label={t("dataSources.queryEditor.label")}
    >
      <div className="ek-workbench__query-editor-header">
        <h3>{title}</h3>
        <button type="button" onClick={requestClose}>{t("dataSources.queryEditor.close")}</button>
      </div>

      {!connection ? (
        <p className="ek-workbench__request-warning" role="alert">
          {t("dataSources.queryEditor.connectionMissing")}
        </p>
      ) : (
        <div className="ek-workbench__query-editor-form">
          <label className="ek-workbench__field">
            <span>{t("dataSources.queryEditor.name")}</span>
            <input
              ref={nameRef}
              type="text"
              aria-label={t("dataSources.queryEditor.name")}
              value={form.name}
              onChange={(event) => updateForm({ name: event.target.value })}
            />
          </label>

          <form
            className="ek-workbench__query-section"
            aria-label={t("dataSources.queryEditor.requestSection")}
            onSubmit={runRequest}
            noValidate
          >
            <h4>{t("dataSources.queryEditor.requestSection")}</h4>
            <p className="ek-workbench__request-hint">{t("dataSources.request.draftHint")}</p>
            {!service ? (
              <p className="ek-workbench__request-warning" role="alert">{t("dataSources.request.unavailable")}</p>
            ) : !dataState.executorAvailable ? (
              <p className="ek-workbench__request-warning" role="status">{t("dataSources.request.executorMissing")}</p>
            ) : null}

            <label className="ek-workbench__field">
              <span>{t("dataSources.request.path")}</span>
              <input
                type="text"
                list={suggestionListId}
                aria-label={t("dataSources.request.path")}
                placeholder={t("dataSources.request.pathPlaceholder")}
                value={form.path}
                onChange={(event) => updateRequestForm({ path: event.target.value })}
              />
            </label>
            <div className="ek-workbench__request-preview">
              <span>{t("dataSources.request.preview")}</span>
              {requestUrlPreview(context, connectionId, form, parameterDrafts, overrides)}
            </div>

            <fieldset className="ek-workbench__request-parameters">
              <legend>{t("dataSources.request.parameters")}</legend>
              {form.parameters.length === 0 ? <small>{t("dataSources.request.parameters.empty")}</small> : null}
              {form.parameters.map((parameter, index) => (
                <ParameterRow
                  key={parameter.id}
                  parameter={parameter}
                  index={index + 1}
                  i18n={context.i18n}
                  onChange={(patch) => updateParameter(parameter.id, patch)}
                  onChangeType={(type) => changeParameterType(parameter.id, type)}
                  onRemove={() => removeParameter(parameter.id)}
                />
              ))}
              <button type="button" onClick={addParameter}>{t("dataSources.request.parameters.add")}</button>
            </fieldset>

            <div className="ek-workbench__request-actions">
              <button type="submit" disabled={!service || running}>{t("dataSources.request.run")}</button>
              {running ? <button type="button" onClick={cancelRun}>{t("dataSources.request.cancel")}</button> : null}
            </div>
            {run ? <RunSummary run={run} i18n={context.i18n} /> : null}
          </form>

          <section className="ek-workbench__query-section" aria-label={t("dataSources.queryEditor.mappingSection")}>
            <h4>{t("dataSources.queryEditor.mappingSection")}</h4>
            <PathField
              label={t("dataSources.mapping.root")}
              value={form.rootPath}
              onChange={(value) => updateForm({ rootPath: value })}
              hint={t("dataSources.mapping.rootHint")}
              suggestionListId={suggestionListId}
            />

            <div className="ek-workbench__query-inline">
              <label className="ek-workbench__field">
                <span>{t("dataSources.mapping.mode")}</span>
                <select
                  aria-label={t("dataSources.mapping.mode")}
                  value={form.mode}
                  onChange={(event) => changeMode(event.target.value as QueryFormState["mode"])}
                >
                  <option value="array">{t(MODE_MESSAGE_KEYS.array)}</option>
                  <option value="single">{t(MODE_MESSAGE_KEYS.single)}</option>
                </select>
              </label>
              {form.mode === "single" ? (
                <label className="ek-workbench__field">
                  <span>{t("dataSources.mapping.identity.kind")}</span>
                  <select
                    aria-label={t("dataSources.mapping.identity.kind")}
                    value={form.identityKind}
                    onChange={(event) => updateForm({
                      identityKind: event.target.value as QueryFormState["identityKind"]
                    })}
                  >
                    <option value="path">{t(IDENTITY_KIND_MESSAGE_KEYS.path)}</option>
                    <option value="parameter">{t(IDENTITY_KIND_MESSAGE_KEYS.parameter)}</option>
                    <option value="literal">{t(IDENTITY_KIND_MESSAGE_KEYS.literal)}</option>
                  </select>
                </label>
              ) : null}
            </div>

            {form.identityKind === "path" ? (
              <div className="ek-workbench__query-inline">
                <PathField
                  label={t("dataSources.mapping.identity.pathLabel")}
                  value={form.identityPath}
                  onChange={(value) => updateForm({ identityPath: value })}
                  suggestionListId={suggestionListId}
                />
                <label className="ek-workbench__field">
                  <span>{t("dataSources.mapping.identity.valueType")}</span>
                  <select
                    aria-label={t("dataSources.mapping.identity.valueType")}
                    value={form.identityValueType}
                    onChange={(event) => updateForm({
                      identityValueType: event.target.value as QueryFormState["identityValueType"]
                    })}
                  >
                    <option value="string">{t(VALUE_TYPE_MESSAGE_KEYS.string)}</option>
                    <option value="number">{t(VALUE_TYPE_MESSAGE_KEYS.number)}</option>
                  </select>
                </label>
              </div>
            ) : form.identityKind === "parameter" ? (
              <label className="ek-workbench__field">
                <span>{t("dataSources.mapping.identity.parameterField")}</span>
                <select
                  aria-label={t("dataSources.mapping.identity.parameterField")}
                  value={form.identityParameter}
                  onChange={(event) => updateForm({ identityParameter: event.target.value })}
                >
                  <option value="">{t("dataSources.mapping.identity.parameterEmpty")}</option>
                  {form.parameters
                    .filter((parameter) => parameter.name.trim() && parameter.type !== "boolean")
                    .map((parameter) => (
                      <option key={parameter.id} value={parameter.name.trim()}>{parameter.name.trim()}</option>
                    ))}
                </select>
              </label>
            ) : (
              <label className="ek-workbench__field">
                <span>{t("dataSources.mapping.identity.literalField")}</span>
                <input
                  type="text"
                  aria-label={t("dataSources.mapping.identity.literalField")}
                  value={form.identityLiteral}
                  onChange={(event) => updateForm({ identityLiteral: event.target.value })}
                />
              </label>
            )}

            <PathField
              label={t("dataSources.mapping.displayName")}
              value={form.displayNamePath}
              onChange={(value) => updateForm({ displayNamePath: value })}
              suggestionListId={suggestionListId}
            />

            <fieldset className="ek-workbench__query-properties">
              <legend>{t("dataSources.mapping.properties")}</legend>
              <small>{t("dataSources.mapping.properties.hint")}</small>
              {form.properties.map((property, index) => (
                <PropertyRow
                  key={property.id}
                  property={property}
                  index={index + 1}
                  i18n={context.i18n}
                  suggestionListId={suggestionListId}
                  onChange={(patch) => updateProperty(index, patch)}
                  onChangeType={(type) => changePropertyType(index, type)}
                  onChangeTransform={(kind) => changePropertyTransform(index, kind)}
                  onUpdateEntry={(entryId, patch) => updateMapEntry(index, entryId, patch)}
                  onAddEntry={() => updateProperty(index, {
                    mapEntries: [...property.mapEntries, createQueryMapEntryForm()]
                  })}
                  onRemoveEntry={(entryId) => updateProperty(index, {
                    mapEntries: property.mapEntries.filter((entry) => entry.id !== entryId)
                  })}
                  onRemove={() => updateForm({
                    properties: form.properties.filter((_, propertyIndex) => propertyIndex !== index)
                  })}
                />
              ))}
              <button type="button" onClick={() => updateForm({
                properties: [...form.properties, createQueryPropertyForm()]
              })}>{t("dataSources.mapping.property.add")}</button>
            </fieldset>

            <fieldset className="ek-workbench__query-observed">
              <legend>{t("dataSources.mapping.observedAt")}</legend>
              <p className="ek-workbench__request-hint">{t("dataSources.mapping.observedAt.hint")}</p>
              <div className="ek-workbench__query-inline">
                <PathField
                  label={t("dataSources.mapping.observedAt.path")}
                  value={form.observedPath}
                  onChange={(value) => updateForm({ observedPath: value })}
                  suggestionListId={suggestionListId}
                />
                <label className="ek-workbench__field">
                  <span>{t("dataSources.mapping.observedAt.format")}</span>
                  <select
                    aria-label={t("dataSources.mapping.observedAt.format")}
                    value={form.observedFormat}
                    onChange={(event) => updateForm({
                      observedFormat: event.target.value as DataTimeFormat
                    })}
                  >
                    {(["iso", "unix-seconds", "unix-milliseconds"] as const).map((format) => (
                      <option key={format} value={format}>{t(TIME_FORMAT_MESSAGE_KEYS[format])}</option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="ek-workbench__query-quality">
              <legend>{t("dataSources.mapping.quality")}</legend>
              <p className="ek-workbench__request-hint">{t("dataSources.mapping.quality.hint")}</p>
              <PathField
                label={t("dataSources.mapping.quality.path")}
                value={form.qualityPath}
                onChange={(value) => updateForm({ qualityPath: value })}
                suggestionListId={suggestionListId}
              />
              {form.qualityEntries.map((entry, index) => (
                <div key={entry.id} className="ek-workbench__query-map-entry">
                  <input
                    type="text"
                    aria-label={t("dataSources.mapping.quality.from", { index: index + 1 })}
                    placeholder={t("dataSources.mapping.mapValueError")}
                    value={entry.from}
                    onChange={(event) => updateQualityEntry(entry.id, { from: event.target.value })}
                  />
                  <select
                    aria-label={t("dataSources.mapping.quality.value", { index: index + 1 })}
                    value={entry.quality}
                    onChange={(event) => updateQualityEntry(entry.id, {
                      quality: event.target.value as DataQuality
                    })}
                  >
                    {(["good", "uncertain", "bad", "unknown"] as const).map((quality) => (
                      <option key={quality} value={quality}>{t(QUALITY_MESSAGE_KEYS[quality])}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={t("dataSources.mapping.quality.remove", { index: index + 1 })}
                    onClick={() => updateForm({
                      qualityEntries: form.qualityEntries.filter((candidate) => candidate.id !== entry.id)
                    })}
                  >{t("dataSources.mapping.property.removeLabel")}</button>
                </div>
              ))}
              <button type="button" onClick={() => updateForm({
                qualityEntries: [...form.qualityEntries, createQueryQualityEntryForm()]
              })}>{t("dataSources.mapping.quality.add")}</button>
            </fieldset>
          </section>

          <section className="ek-workbench__query-section" aria-label={t("dataSources.queryEditor.previewSection")}>
            <h4>{t("dataSources.queryEditor.previewSection")}</h4>
            <SampleStatus
              sample={sample}
              stale={sampleStale}
              i18n={context.i18n}
            />
            <label className="ek-workbench__field">
              <span>{t("dataSources.sample.exampleLabel")}</span>
              <textarea
                aria-label={t("dataSources.sample.exampleLabel")}
                placeholder={t("dataSources.sample.hint")}
                value={sampleText}
                onChange={(event) => {
                  setSampleText(event.target.value);
                  setSampleError(null);
                }}
              />
            </label>
            <div className="ek-workbench__request-actions">
              <button type="button" onClick={applyExample}>{t("dataSources.sample.apply")}</button>
            </div>
            {sampleError ? <p className="ek-workbench__request-warning" role="alert">{t(sampleError)}</p> : null}

            <MappingPreview
              sample={sample}
              stale={sampleStale}
              mapping={mapping}
              mappingBuildProblems={mappingBuild.problems}
              mappingValidationProblems={mappingValidation?.ok === false ? mappingValidation.problems : []}
              preview={preview}
              showValidation={showValidation}
              i18n={context.i18n}
            />
          </section>

          {showValidation && (mappingBuild.problems.length > 0 || (mappingValidation && !mappingValidation.ok)) ? (
            <div className="ek-workbench__connection-problems" role="alert" aria-label={t("dataSources.queryEditor.problems")}>
              <strong>{t("dataSources.queryEditor.problems")}</strong>
              <ul>
                {mappingBuild.problems.map((problem, index) => (
                  <li key={`${problem.field}-${index}`}>{t(problem.messageKey)}</li>
                ))}
                {mappingValidation && !mappingValidation.ok
                  ? mappingValidation.problems.map((problem, index) => (
                      <li key={`${problem.code}-${index}`}>
                        {t(DATA_QUERY_DEFINITION_PROBLEM_MESSAGE_KEYS[problem.code], { detail: problem.message })}
                      </li>
                    ))
                  : null}
              </ul>
            </div>
          ) : null}

          {problems.length > 0 ? (
            <div className="ek-workbench__connection-problems" role="alert" aria-label={t("dataSources.queryEditor.problems")}>
              <strong>{t("dataSources.queryEditor.problems")}</strong>
              <ul>
                {problems.map((problem, index) => (
                  <li key={`${problem.field}-${problem.code}-${index}`}>
                    {t(DATA_QUERY_DEFINITION_PROBLEM_MESSAGE_KEYS[problem.code], {
                      detail: problem.message,
                      parameterName: problem.parameterName ?? "",
                      propertyKey: problem.propertyKey ?? ""
                    })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="ek-workbench__connection-form-actions">
            <button type="button" onClick={save}>{t("dataSources.queryEditor.save")}</button>
            <button type="button" onClick={requestClose}>{t("dataSources.queryEditor.cancel")}</button>
          </div>
        </div>
      )}

      {discardOpen ? (
        <div
          className="ek-workbench__connection-discard"
          role="alertdialog"
          aria-label={t("dataSources.queryEditor.discard.title")}
          aria-describedby={`${discardId}-description`}
        >
          <strong>{t("dataSources.queryEditor.discard.title")}</strong>
          <p id={`${discardId}-description`}>{t("dataSources.queryEditor.discard.description")}</p>
          <div className="ek-workbench__connection-discard-actions">
            <button ref={keepEditingRef} type="button" onClick={() => {
              setDiscardOpen(false);
              nameRef.current?.focus();
            }}>{t("dataSources.queryEditor.discard.keep")}</button>
            <button type="button" onClick={discardChanges}>{t("dataSources.queryEditor.discard.confirm")}</button>
          </div>
        </div>
      ) : null}
      <datalist id={suggestionListId}>
        {suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}
      </datalist>
    </section>
  );
}

function requestUrlPreview(
  context: ResolvedWorkbenchContext,
  connectionId: string,
  form: QueryFormState,
  parameters: ReturnType<typeof toQueryParameterDrafts>,
  overrides: DataQueryParameterOverrides
) {
  const preview = buildDataGetRequest(context.snapshot, {
    connectionId,
    path: form.path,
    parameters
  }, { overrides });
  return preview.ok
    ? <code>{preview.summary.url}</code>
    : <small>{context.i18n.t("dataSources.request.previewPending")}</small>;
}

function ParameterRow({
  parameter,
  index,
  i18n,
  onChange,
  onChangeType,
  onRemove
}: {
  parameter: QueryParameterForm;
  index: number;
  i18n: WorkbenchI18n;
  onChange(patch: Partial<QueryParameterForm>): void;
  onChangeType(type: DataParameterType): void;
  onRemove(): void;
}) {
  const t = i18n.t;
  return (
    <div className="ek-workbench__request-parameter" role="group" aria-label={t("dataSources.request.parameter.group", { index })}>
      <label className="ek-workbench__field">
        <span>{t("dataSources.request.parameter.name", { index })}</span>
        <input
          type="text"
          aria-label={t("dataSources.request.parameter.name", { index })}
          value={parameter.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </label>
      <label className="ek-workbench__field">
        <span>{t("dataSources.request.parameter.type", { index })}</span>
        <select
          aria-label={t("dataSources.request.parameter.type", { index })}
          value={parameter.type}
          onChange={(event) => onChangeType(event.target.value as DataParameterType)}
        >
          {(["string", "number", "boolean"] as const).map((type) => (
            <option key={type} value={type}>{t(PARAMETER_TYPE_MESSAGE_KEYS[type])}</option>
          ))}
        </select>
      </label>
      <div className="ek-workbench__request-parameter-value">
        <label className="ek-workbench__field">
          <span>{t("dataSources.request.parameter.label.default")}</span>
          <DataParameterValueInput
            id={`${parameter.id}-default`}
            type={parameter.type}
            value={parameter.defaultText}
            disabled={!parameter.useDefault}
            label={t("dataSources.request.parameter.default", { index })}
            trueLabel={t("dataSources.request.boolean.true")}
            falseLabel={t("dataSources.request.boolean.false")}
            onChange={(value) => onChange({ defaultText: value })}
          />
        </label>
        <label className="ek-workbench__request-check">
          <input
            type="checkbox"
            aria-label={t("dataSources.request.parameter.useDefault", { index })}
            checked={parameter.useDefault}
            onChange={(event) => onChange({ useDefault: event.target.checked })}
          />
          <span>{t("dataSources.request.parameter.useDefault", { index })}</span>
        </label>
      </div>
      <div className="ek-workbench__request-parameter-value">
        <label className="ek-workbench__request-check">
          <input
            type="checkbox"
            aria-label={t("dataSources.request.parameter.override", { index })}
            checked={parameter.override}
            onChange={(event) => onChange({
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
            <span>{t("dataSources.request.parameter.testValue", { index })}</span>
            <DataParameterValueInput
              id={`${parameter.id}-override`}
              type={parameter.type}
              value={parameter.overrideText}
              disabled={false}
              label={t("dataSources.request.parameter.testValue", { index })}
              trueLabel={t("dataSources.request.boolean.true")}
              falseLabel={t("dataSources.request.boolean.false")}
              onChange={(value) => onChange({ overrideText: value })}
            />
          </label>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={t("dataSources.request.parameter.remove", { index })}
        onClick={onRemove}
      >{t("dataSources.request.parameter.label.remove")}</button>
    </div>
  );
}

function PropertyRow({
  property,
  index,
  i18n,
  suggestionListId,
  onChange,
  onChangeType,
  onChangeTransform,
  onUpdateEntry,
  onAddEntry,
  onRemoveEntry,
  onRemove
}: {
  property: QueryPropertyForm;
  index: number;
  i18n: WorkbenchI18n;
  suggestionListId: string;
  onChange(patch: Partial<QueryPropertyForm>): void;
  onChangeType(type: QueryPropertyForm["type"]): void;
  onChangeTransform(kind: QueryPropertyForm["transformKind"]): void;
  onUpdateEntry(entryId: string, patch: Partial<QueryMapEntryForm>): void;
  onAddEntry(): void;
  onRemoveEntry(entryId: string): void;
  onRemove(): void;
}) {
  const t = i18n.t;
  return (
    <div className="ek-workbench__query-property" role="group" aria-label={t("dataSources.mapping.property.group", { index })}>
      <div className="ek-workbench__query-inline">
        <label className="ek-workbench__field">
          <span>{t("dataSources.mapping.property.key", { index })}</span>
          <input
            type="text"
            aria-label={t("dataSources.mapping.property.key", { index })}
            value={property.key}
            onChange={(event) => onChange({ key: event.target.value })}
          />
        </label>
        <label className="ek-workbench__field">
          <span>{t("dataSources.mapping.property.label", { index })}</span>
          <input
            type="text"
            aria-label={t("dataSources.mapping.property.label", { index })}
            value={property.label}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </label>
        <label className="ek-workbench__field">
          <span>{t("dataSources.mapping.property.type", { index })}</span>
          <select
            aria-label={t("dataSources.mapping.property.type", { index })}
            value={property.type}
            onChange={(event) => onChangeType(event.target.value as QueryPropertyForm["type"])}
          >
            {(["number", "string", "boolean"] as const).map((type) => (
              <option key={type} value={type}>{t(PROPERTY_TYPE_MESSAGE_KEYS[type])}</option>
            ))}
          </select>
        </label>
      </div>
      <PathField
        label={t("dataSources.mapping.property.source", { index })}
        value={property.source}
        onChange={(value) => onChange({ source: value })}
        suggestionListId={suggestionListId}
      />
      <div className="ek-workbench__query-inline">
        <label className="ek-workbench__field">
          <span>{t("dataSources.mapping.property.transform", { index })}</span>
          <select
            aria-label={t("dataSources.mapping.property.transform", { index })}
            value={property.transformKind}
            onChange={(event) => onChangeTransform(event.target.value as QueryPropertyForm["transformKind"])}
          >
            {(["raw", "number", "scale", "map"] as const).map((kind) => (
              <option key={kind} value={kind}>{t(TRANSFORM_MESSAGE_KEYS[kind])}</option>
            ))}
          </select>
        </label>
        <label className="ek-workbench__field">
          <span>{t("dataSources.mapping.property.unit", { index })}</span>
          <input
            type="text"
            aria-label={t("dataSources.mapping.property.unit", { index })}
            value={property.unit}
            onChange={(event) => onChange({ unit: event.target.value })}
          />
        </label>
        <label className="ek-workbench__request-check">
          <input
            type="checkbox"
            aria-label={t("dataSources.mapping.property.nullable", { index })}
            checked={property.nullable}
            onChange={(event) => onChange({ nullable: event.target.checked })}
          />
          <span>{t("dataSources.mapping.property.nullable", { index })}</span>
        </label>
      </div>
      <div className="ek-workbench__query-inline">
        {property.type === "number" ? (
          <>
            <label className="ek-workbench__field">
              <span>{t("dataSources.mapping.property.rangeMin", { index })}</span>
              <input
                type="number"
                step="any"
                aria-label={t("dataSources.mapping.property.rangeMin", { index })}
                value={property.rangeMin}
                onChange={(event) => onChange({ rangeMin: event.target.value })}
              />
            </label>
            <label className="ek-workbench__field">
              <span>{t("dataSources.mapping.property.rangeMax", { index })}</span>
              <input
                type="number"
                step="any"
                aria-label={t("dataSources.mapping.property.rangeMax", { index })}
                value={property.rangeMax}
                onChange={(event) => onChange({ rangeMax: event.target.value })}
              />
            </label>
          </>
        ) : null}
        <label className="ek-workbench__field">
          <span>{t("dataSources.mapping.property.allowed", { index })}</span>
          <input
            type="text"
            aria-label={t("dataSources.mapping.property.allowed", { index })}
            value={property.allowedText}
            onChange={(event) => onChange({ allowedText: event.target.value })}
          />
          <small>{t("dataSources.mapping.property.allowedHint")}</small>
        </label>
      </div>
      {property.transformKind === "scale" ? (
        <div className="ek-workbench__query-inline">
          <label className="ek-workbench__field">
            <span>{t("dataSources.mapping.property.factor", { index })}</span>
            <input
              type="number"
              step="any"
              aria-label={t("dataSources.mapping.property.factor", { index })}
              value={property.factor}
              onChange={(event) => onChange({ factor: event.target.value })}
            />
          </label>
          <label className="ek-workbench__field">
            <span>{t("dataSources.mapping.property.offset", { index })}</span>
            <input
              type="number"
              step="any"
              aria-label={t("dataSources.mapping.property.offset", { index })}
              value={property.offset}
              onChange={(event) => onChange({ offset: event.target.value })}
            />
          </label>
        </div>
      ) : null}
      {property.transformKind === "map" ? (
        <fieldset className="ek-workbench__query-map">
          <legend>{t("dataSources.mapping.map.entries")}</legend>
          {property.mapEntries.map((entry, entryIndex) => (
            <div key={entry.id} className="ek-workbench__query-map-entry">
              <input
                type="text"
                aria-label={t("dataSources.mapping.map.from", { index: entryIndex + 1 })}
                placeholder={t("dataSources.mapping.mapValueError")}
                value={entry.from}
                onChange={(event) => onUpdateEntry(entry.id, { from: event.target.value })}
              />
              <MapOutputInput
                entry={entry}
                index={entryIndex + 1}
                type={property.type}
                i18n={i18n}
                onChange={(value) => onUpdateEntry(entry.id, { to: value })}
              />
              <button
                type="button"
                aria-label={t("dataSources.mapping.map.remove", { index: entryIndex + 1 })}
                onClick={() => onRemoveEntry(entry.id)}
              >{t("dataSources.mapping.property.removeLabel")}</button>
            </div>
          ))}
          <button type="button" onClick={onAddEntry}>{t("dataSources.mapping.map.add")}</button>
        </fieldset>
      ) : null}
      <button type="button" aria-label={t("dataSources.mapping.property.remove", { index })} onClick={onRemove}>
        {t("dataSources.mapping.property.removeLabel")}
      </button>
    </div>
  );
}

function MapOutputInput({
  entry,
  index,
  type,
  i18n,
  onChange
}: {
  entry: QueryMapEntryForm;
  index: number;
  type: QueryPropertyForm["type"];
  i18n: WorkbenchI18n;
  onChange(value: string): void;
}) {
  const t = i18n.t;
  if (type === "boolean") {
    return (
      <select
        aria-label={t("dataSources.mapping.map.to", { index })}
        value={entry.to === "true" ? "true" : "false"}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="true">{t("dataSources.request.boolean.true")}</option>
        <option value="false">{t("dataSources.request.boolean.false")}</option>
      </select>
    );
  }
  return (
    <input
      type={type === "number" ? "number" : "text"}
      step={type === "number" ? "any" : undefined}
      aria-label={t("dataSources.mapping.map.to", { index })}
      value={entry.to}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function PathField({
  label,
  value,
  onChange,
  hint,
  suggestionListId
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  hint?: string;
  suggestionListId: string;
}) {
  return (
    <label className="ek-workbench__field">
      <span>{label}</span>
      <input
        type="text"
        list={suggestionListId}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function RunSummary({ run, i18n }: { run: DataQueryRunState; i18n: WorkbenchI18n }) {
  const t = i18n.t;
  return (
    <section className="ek-workbench__request-result" aria-label={t("dataSources.request.result")} data-status={run.status}>
      <div className="ek-workbench__request-result-header">
        <span className="ek-workbench__request-status" data-status={run.status}>
          {t(DATA_QUERY_RUN_STATUS_MESSAGE_KEYS[run.status])}
        </span>
        {run.elapsedMs !== null ? (
          <small>{t("dataSources.request.response.durationValue", { milliseconds: run.elapsedMs })}</small>
        ) : null}
      </div>
      {run.problems.length > 0 ? (
        <ul className="ek-workbench__request-problems" aria-label={t("dataSources.request.problems")}>
          {run.problems.map((problem, index) => (
            <li key={`${problem.code}-${index}`}>{formatDataQueryProblem(i18n, problem)}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SampleStatus({
  sample,
  stale,
  i18n
}: {
  sample: QuerySample | null;
  stale: boolean;
  i18n: WorkbenchI18n;
}) {
  const t = i18n.t;
  if (!sample) {
    return <p className="ek-workbench__request-hint" role="status">{t("dataSources.queryEditor.notTested")}</p>;
  }
  const sourceKey = sample.source === "example"
    ? "dataSources.queryEditor.exampleSource"
    : sample.usedOverrides
      ? "dataSources.queryEditor.testedOverrides"
      : "dataSources.queryEditor.tested";
  return (
    <div className="ek-workbench__query-sample-status">
      <span data-state={sample.source}>{t(sourceKey)}</span>
      {sample.status !== null ? <span>{t("dataSources.request.response.status")}: {sample.status}</span> : null}
      {stale ? <span data-state="stale">{t("dataSources.queryEditor.stale")}</span> : null}
    </div>
  );
}

function MappingPreview({
  sample,
  stale,
  mapping,
  mappingBuildProblems,
  mappingValidationProblems,
  preview,
  showValidation,
  i18n
}: {
  sample: QuerySample | null;
  stale: boolean;
  mapping: DataQueryMapping | null;
  mappingBuildProblems: readonly QueryFormProblem[];
  mappingValidationProblems: readonly DataQueryDefinitionProblem[];
  preview: DataMappingResult | null;
  showValidation: boolean;
  i18n: WorkbenchI18n;
}) {
  const t = i18n.t;
  if (!sample) {
    return <p className="ek-workbench__request-hint">{t("dataSources.preview.empty")}</p>;
  }
  if (!mapping) {
    return (
      <div className="ek-workbench__query-preview" data-state="invalid">
        <p>{t("dataSources.preview.invalidMapping")}</p>
        {showValidation && mappingBuildProblems.length > 0 ? (
          <ul className="ek-workbench__request-problems">
            {mappingBuildProblems.map((problem, index) => (
              <li key={`${problem.field}-${index}`}>{t(problem.messageKey)}</li>
            ))}
          </ul>
        ) : null}
        {mappingValidationProblems.length > 0 ? (
          <ul className="ek-workbench__request-problems">
            {mappingValidationProblems.map((problem, index) => (
              <li key={`${problem.code}-${index}`}>
                {t(DATA_QUERY_DEFINITION_PROBLEM_MESSAGE_KEYS[problem.code], { detail: problem.message })}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }
  if (!preview) {
    return <p className="ek-workbench__request-hint">{t("dataSources.preview.invalidMapping")}</p>;
  }
  if (!preview.ok) {
    return (
      <div className="ek-workbench__query-preview" data-state="invalid">
        <h5>{t("dataSources.preview.errors")}</h5>
        <MappingProblems problems={preview.errors} i18n={i18n} />
      </div>
    );
  }
  return (
    <div className="ek-workbench__query-preview" data-state={stale ? "stale" : "ok"}>
      {preview.problems.length > 0 ? (
        <>
          <h5>{t("dataSources.preview.problems")}</h5>
          <MappingProblems problems={preview.problems} i18n={i18n} />
        </>
      ) : null}
      <h5>{t("dataSources.preview.entities")}</h5>
      {preview.entities.length === 0 ? (
        <p>{t("dataSources.preview.emptyEntities")}</p>
      ) : (
        <ul className="ek-workbench__query-entities">
          {preview.entities.map((entity) => (
            <li key={entity.entityId} aria-label={t("dataSources.preview.entityLabel", { entityId: entity.entityId })}>
              <div className="ek-workbench__query-entity-header">
                <strong>{entity.entityId}</strong>
                {entity.displayName ? <span>{entity.displayName}</span> : null}
              </div>
              <dl className="ek-workbench__query-entity-meta">
                <div>
                  <dt>{t("dataSources.preview.observedAt")}</dt>
                  <dd>{formatTimestamp(entity.observedAt, i18n)}</dd>
                </div>
                <div>
                  <dt>{t("dataSources.preview.receivedAt")}</dt>
                  <dd>{formatTimestamp(entity.receivedAt, i18n)}</dd>
                </div>
                <div>
                  <dt>{t("dataSources.preview.quality")}</dt>
                  <dd>{t(QUALITY_MESSAGE_KEYS[entity.sourceQuality])}</dd>
                </div>
              </dl>
              {entity.observedAtProblem ? <MappingProblems problems={[entity.observedAtProblem]} i18n={i18n} /> : null}
              {entity.qualityProblem ? <MappingProblems problems={[entity.qualityProblem]} i18n={i18n} /> : null}
              <table aria-label={`${t("dataSources.preview.fieldsLabel")} ${entity.entityId}`}>
                <thead>
                  <tr>
                    <th>{t("dataSources.preview.property")}</th>
                    <th>{t("dataSources.preview.raw")}</th>
                    <th>{t("dataSources.preview.value")}</th>
                    <th>{t("dataSources.preview.statusLabel")}</th>
                    <th>{t("dataSources.preview.problemsLabel")}</th>
                  </tr>
                </thead>
                <tbody>
                  {entity.fields.map((field) => (
                    <tr key={field.key}>
                      <th scope="row">{field.label} <small>{field.key}</small></th>
                      <td><code>{formatRawValue(field, i18n)}</code></td>
                      <td>{field.value === null ? t("dataSources.preview.unknown") : String(field.value)}{field.unit ? ` ${field.unit}` : ""}</td>
                      <td>{t(FIELD_STATUS_MESSAGE_KEYS[field.status])}</td>
                      <td>
                        {field.problems.length > 0
                          ? <MappingProblems problems={field.problems} i18n={i18n} />
                          : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </li>
          ))}
        </ul>
      )}
      <h5>{t("dataSources.preview.standard")}</h5>
      <pre className="ek-workbench__request-payload" aria-label={t("dataSources.preview.standard")}>
        {JSON.stringify(preview.samples, null, 2)}
      </pre>
    </div>
  );
}

const FIELD_STATUS_MESSAGE_KEYS = {
  ok: "dataSources.preview.status.ok",
  missing: "dataSources.preview.status.missing",
  null: "dataSources.preview.status.null",
  invalid: "dataSources.preview.status.invalid"
} satisfies Record<DataMappedField["status"], WorkbenchMessageKey>;

function MappingProblems({
  problems,
  i18n
}: {
  problems: readonly DataMappingProblem[];
  i18n: WorkbenchI18n;
}) {
  return (
    <ul className="ek-workbench__request-problems">
      {problems.map((problem, index) => (
        <li key={`${problem.code}-${problem.propertyKey ?? ""}-${index}`}>
          {i18n.t(MAPPING_PROBLEM_MESSAGE_KEYS[problem.code], {
            propertyKey: problem.propertyKey ?? "",
            entityId: problem.entityId ?? ""
          } satisfies WorkbenchMessageValues)}
        </li>
      ))}
    </ul>
  );
}

function formatTimestamp(value: number | null, i18n: WorkbenchI18n): string {
  return value === null ? i18n.t("dataSources.preview.unknown") : new Date(value).toISOString();
}

function formatRawValue(field: DataMappedField, i18n: WorkbenchI18n): string {
  if (field.raw === undefined) {
    return i18n.t("dataSources.preview.missingRaw");
  }
  return JSON.stringify(field.raw);
}

function collectPathSuggestions(body: JsonValue | undefined): string[] {
  const suggestions: string[] = [];
  const seen = new Set<string>();
  const walk = (value: JsonValue, path: DataPath, depth: number): void => {
    if (suggestions.length >= 120 || depth > 8) {
      return;
    }
    if (path.length > 0) {
      const text = formatDataPath(path);
      if (!seen.has(text)) {
        seen.add(text);
        suggestions.push(text);
      }
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < Math.min(value.length, 20); index += 1) {
        walk(value[index], [...path, { kind: "index", index }], depth + 1);
      }
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const [key, entry] of Object.entries(value)) {
        walk(entry, [...path, { kind: "key", key }], depth + 1);
        if (suggestions.length >= 120) {
          return;
        }
      }
    }
  };
  if (body !== undefined) {
    walk(body, [], 0);
  }
  return suggestions;
}
