import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import {
  buildDataConnectionReferenceModel,
  buildDeleteDataConnectionCommand,
  buildDeleteDataQueryCommand,
  buildDuplicateDataConnectionCommand,
  buildDuplicateDataQueryCommand,
  buildSaveDataConnectionCommand,
  createUniqueDataConnectionName,
  DEFAULT_API_KEY_HEADER_NAME,
  DATA_DEVICE_ENDPOINT_KINDS,
  DEFAULT_DATA_CONNECTION_TIMEOUT_MS,
  filterDataConnectionItems,
  type DataConnectionAuth,
  type DataConnectionDraft,
  type DataConnectionListItem,
  type DataConnectionProblem,
  type DataConnectionProblemCode,
  type DataCredentialDescriptor,
  type DataDeviceEndpointKind,
  type DataQueryListItem
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchI18n, WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { DataQueryEditor } from "./DataQueryEditor";
import { DataQueryBindingsDialog } from "./DataQueryBindingsDialog";
import { DataQueryTester } from "./DataQueryTester";
import { DATA_QUERY_DEFINITION_PROBLEM_MESSAGE_KEYS } from "./data-query-problem-messages";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { WorkbenchSelect } from "./ui/WorkbenchSelect";

type DataFormMode =
  | { kind: "create" }
  | { kind: "edit"; connectionId: string };

interface DataFormHeader {
  id: string;
  name: string;
  value: string;
}

interface DataFormState {
  mode: DataFormMode;
  name: string;
  baseUrl: string;
  authKind: DataConnectionAuth["kind"];
  credentialRef: string;
  apiKeyHeader: string;
  timeoutSeconds: string;
  headers: DataFormHeader[];
  baseline: string;
}

interface StatusMessage {
  key: WorkbenchMessageKey;
  values?: WorkbenchMessageValues;
}

type FocusTarget =
  | { kind: "new" }
  | { kind: "connection"; connectionId: string }
  | { kind: "request"; connectionId: string; endpointKind?: DataDeviceEndpointKind }
  | { kind: "query"; queryId: string; bindings?: boolean }
  | { kind: "newQuery"; connectionId: string };

const PROBLEM_MESSAGE_KEYS = {
  "auth-invalid": "dataSources.problem.authInvalid",
  "base-url-credentials": "dataSources.problem.baseUrlCredentials",
  "base-url-invalid": "dataSources.problem.baseUrlInvalid",
  "base-url-query": "dataSources.problem.baseUrlQuery",
  "base-url-required": "dataSources.problem.baseUrlRequired",
  "command-failed": "dataSources.problem.commandFailed",
  "connection-in-use": "dataSources.problem.connectionInUse",
  "connection-not-found": "dataSources.problem.connectionNotFound",
  "credential-required": "dataSources.problem.credentialRequired",
  "endpoint-invalid": "dataSources.problem.endpointInvalid",
  "header-reserved": "dataSources.problem.headerReserved",
  "headers-invalid": "dataSources.problem.headersInvalid",
  "name-duplicate": "dataSources.problem.nameDuplicate",
  "name-required": "dataSources.problem.nameRequired",
  "timeout-invalid": "dataSources.problem.timeoutInvalid"
} satisfies Record<DataConnectionProblemCode, WorkbenchMessageKey>;

export function DataSourcesPanel({
  context,
  locate,
  onLocateHandled,
  onLocateObject
}: {
  context: ResolvedWorkbenchContext;
  locate?: { connectionId: string; queryId: string } | null;
  onLocateHandled?(): void;
  onLocateObject?(nodeId: string): void;
}) {
  // Drafts and response samples belong to the editor that opened the panel.
  const [session, setSession] = useState({ editor: context.editor, key: 0 });
  if (session.editor !== context.editor) {
    setSession({ editor: context.editor, key: session.key + 1 });
    return null;
  }
  return <DataSourcesSession key={session.key} context={context} locate={locate} onLocateHandled={onLocateHandled} onLocateObject={onLocateObject} />;
}

function DataSourcesSession({
  context,
  locate,
  onLocateHandled,
  onLocateObject
}: {
  context: ResolvedWorkbenchContext;
  locate?: { connectionId: string; queryId: string } | null;
  onLocateHandled?(): void;
  onLocateObject?(nodeId: string): void;
}) {
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<DataFormState | null>(null);
  const [requestEditor, setRequestEditor] = useState<{ connectionId: string; endpointKind?: DataDeviceEndpointKind } | null>(null);
  const requestConnectionId = requestEditor?.connectionId ?? null;
  const [queryEditor, setQueryEditor] = useState<{ connectionId: string; queryId: string | null } | null>(null);
  const [bindingsQueryId, setBindingsQueryId] = useState<string | null>(null);
  const [problems, setProblems] = useState<DataConnectionProblem[]>([]);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [requestDirty, setRequestDirty] = useState(false);
  const pendingCloseRef = useRef<(() => void) | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const baseUrlRef = useRef<HTMLInputElement>(null);
  const authRef = useRef<HTMLButtonElement>(null);
  const credentialRef = useRef<HTMLButtonElement>(null);
  const timeoutRef = useRef<HTMLInputElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const requestButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const newQueryButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const queryButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const t = context.i18n.t;
  const model = context.model.dataSources;
  const credentials = context.editor.getDataCredentials?.() ?? [];
  const visibleConnections = filterDataConnectionItems(model.connections, { query });
  const boundObjectNames = new Map(visibleConnections.map((connection) => [
    connection.id,
    buildDataConnectionReferenceModel(context.snapshot, connection.id).bindings.map((binding) => binding.objectName)
  ]));
  useEffect(() => {
    if (!focusTarget) {
      return;
    }
    if (focusTarget.kind === "connection") {
      editButtonRefs.current.get(focusTarget.connectionId)?.focus();
    } else if (focusTarget.kind === "request") {
      requestButtonRefs.current.get(`${focusTarget.connectionId}:${focusTarget.endpointKind ?? ""}`)?.focus();
    } else if (focusTarget.kind === "query") {
      // The ref belongs to the row's bindings button; the row's first button edits.
      const bindingsButton = queryButtonRefs.current.get(focusTarget.queryId);
      const target = focusTarget.bindings
        ? bindingsButton
        : bindingsButton?.parentElement?.querySelector<HTMLButtonElement>("button");
      (target ?? bindingsButton)?.focus();
    } else if (focusTarget.kind === "newQuery") {
      newQueryButtonRefs.current.get(focusTarget.connectionId)?.focus();
    } else {
      newButtonRef.current?.focus();
    }
    setFocusTarget(null);
  }, [focusTarget]);

  useEffect(() => {
    const field = problems[0]?.field;
    if (!field) {
      return;
    }
    switch (field) {
      case "baseUrl":
        baseUrlRef.current?.focus();
        break;
      case "auth":
        authRef.current?.focus();
        break;
      case "timeoutMs":
        timeoutRef.current?.focus();
        break;
      default:
        nameRef.current?.focus();
        break;
    }
  }, [problems]);

  useEffect(() => {
    if (requestConnectionId && !context.snapshot.dataSources.connections[requestConnectionId]) {
      const missingId = requestConnectionId;
      setRequestEditor(null);
      setFocusTarget({ kind: "request", connectionId: missingId });
    }
  }, [context.snapshot.dataSources.connections, requestConnectionId]);

  useEffect(() => {
    if (!queryEditor) {
      return;
    }
    const connection = context.snapshot.dataSources.connections[queryEditor.connectionId];
    const query = queryEditor.queryId
      ? context.snapshot.dataSources.queries[queryEditor.queryId]
      : null;
    if (!connection || (queryEditor.queryId !== null && !query)) {
      setQueryEditor(null);
      setFocusTarget(
        connection
          ? { kind: "newQuery", connectionId: connection.id }
          : { kind: "new" }
      );
    }
  }, [context.snapshot.dataSources.connections, context.snapshot.dataSources.queries, queryEditor]);

  useEffect(() => {
    if (!bindingsQueryId) {
      return;
    }
    if (!context.snapshot.dataSources.queries[bindingsQueryId]) {
      // The query vanished under the dialog, so its row is gone with it.
      setBindingsQueryId(null);
      setFocusTarget({ kind: "new" });
    }
  }, [bindingsQueryId, context.snapshot]);

  useEffect(() => {
    if (!locate) {
      return;
    }
    // Keep the request pending until the open draft closes instead of
    // silently dropping the user's Locate action.
    if (form || requestConnectionId || queryEditor || bindingsQueryId) {
      return;
    }
    onLocateHandled?.();
    const connection = context.snapshot.dataSources.connections[locate.connectionId];
    const query = context.snapshot.dataSources.queries[locate.queryId];
    if (connection && query?.connectionId === connection.id) {
      openQuery(connection.id, query.id);
    }
  }, [locate, form, requestConnectionId, queryEditor, bindingsQueryId]);

  function openCreate() {
    setRequestEditor(null);
    setQueryEditor(null);
    setProblems([]);
    setStatus(null);
    const next: DataFormState = {
      mode: { kind: "create" },
      name: "",
      baseUrl: "",
      authKind: "none",
      credentialRef: "",
      apiKeyHeader: DEFAULT_API_KEY_HEADER_NAME,
      timeoutSeconds: formatSeconds(DEFAULT_DATA_CONNECTION_TIMEOUT_MS),
      headers: [],
      baseline: ""
    };
    setForm({ ...next, baseline: serializeFormDraft(next) });
  }

  function openEdit(connection: DataConnectionListItem) {
    const stored = context.snapshot.dataSources.connections[connection.id];
    if (!stored) {
      setStatus({ key: PROBLEM_MESSAGE_KEYS["connection-not-found"] });
      return;
    }
    setRequestEditor(null);
    setQueryEditor(null);
    setProblems([]);
    setStatus(null);
    const next: DataFormState = {
      mode: { kind: "edit", connectionId: connection.id },
      name: stored.name,
      baseUrl: stored.baseUrl,
      authKind: stored.auth.kind,
      credentialRef: stored.auth.kind === "none" ? "" : stored.auth.credentialRef,
      apiKeyHeader: stored.auth.kind === "api-key" ? stored.auth.headerName : DEFAULT_API_KEY_HEADER_NAME,
      timeoutSeconds: formatSeconds(stored.timeoutMs),
      headers: Object.entries(stored.headers).map(([name, value]) => createFormHeader(name, value)),
      baseline: ""
    };
    setForm({ ...next, baseline: serializeFormDraft(next) });
  }

  function closeForm() {
    const editing = form?.mode.kind === "edit" ? form.mode.connectionId : null;
    pendingCloseRef.current = null;
    setDiscardOpen(false);
    setForm(null);
    setProblems([]);
    setStatus(null);
    setFocusTarget(editing ? { kind: "connection", connectionId: editing } : { kind: "new" });
  }

  function openRequest(connection: DataConnectionListItem, endpointKind?: DataDeviceEndpointKind) {
    setForm(null);
    setQueryEditor(null);
    setProblems([]);
    setStatus(null);
    setRequestDirty(false);
    setRequestEditor({ connectionId: connection.id, endpointKind });
  }

  function closeRequest() {
    const connectionId = requestConnectionId;
    pendingCloseRef.current = null;
    setDiscardOpen(false);
    setRequestDirty(false);
    setRequestEditor(null);
    if (connectionId) {
      setFocusTarget({ kind: "request", connectionId, endpointKind: requestEditor?.endpointKind });
    }
  }

  function requestClose(action: () => void) {
    const dirty = form ? isFormDirty(form) : requestConnectionId ? requestDirty : false;
    if (dirty) {
      pendingCloseRef.current = action;
      setDiscardOpen(true);
      return;
    }
    action();
  }

  function keepEditing() {
    pendingCloseRef.current = null;
    setDiscardOpen(false);
  }

  function discardChanges() {
    const action = pendingCloseRef.current;
    pendingCloseRef.current = null;
    setDiscardOpen(false);
    action?.();
  }

  function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) {
      return;
    }
    const timeoutSeconds = Number(form.timeoutSeconds);
    const draft: DataConnectionDraft = {
      name: form.name,
      baseUrl: form.baseUrl,
      auth: form.authKind === "bearer"
        ? { kind: "bearer", credentialRef: form.credentialRef }
        : form.authKind === "api-key"
          ? { kind: "api-key", credentialRef: form.credentialRef, headerName: form.apiKeyHeader }
          : { kind: "none" },
      headers: formToHeaders(form.headers),
      timeoutMs: Number.isFinite(timeoutSeconds) ? Math.round(timeoutSeconds * 1000) : Number.NaN
    };
    const result = buildSaveDataConnectionCommand(context.snapshot, draft, {
      connectionId: form.mode.kind === "edit" ? form.mode.connectionId : null
    });
    if (!result.ok) {
      setProblems(result.problems);
      return;
    }

    const previousIds = new Set(Object.keys(context.snapshot.dataSources.connections));
    const dispatched = context.dispatch(result.command);
    if (!dispatched.ok) {
      setProblems([{ field: "connection", code: "command-failed", message: dispatched.error ?? "" }]);
      return;
    }

    const createdId = form.mode.kind === "create"
      ? findCreatedConnectionId(previousIds, dispatched.snapshot.dataSources.connections)
      : form.mode.connectionId;
    setForm(null);
    setProblems([]);
    pendingCloseRef.current = null;
    setDiscardOpen(false);
    setStatus({ key: form.mode.kind === "create" ? "dataSources.status.saved" : "dataSources.status.updated" });
    setFocusTarget(createdId ? { kind: "connection", connectionId: createdId } : { kind: "new" });
  }

  function duplicateConnection(connection: DataConnectionListItem) {
    const name = createUniqueDataConnectionName(
      Object.values(context.snapshot.dataSources.connections).map((item) => item.name),
      t("dataSources.copySuffix", { name: connection.name })
    );
    const result = buildDuplicateDataConnectionCommand(context.snapshot, connection.id, { name });
    if (!result.ok) {
      const problem = result.problems[0];
      setStatus({ key: PROBLEM_MESSAGE_KEYS[problem.code], values: { detail: problem.message } });
      return;
    }

    const previousIds = new Set(Object.keys(context.snapshot.dataSources.connections));
    const dispatched = context.dispatch(result.command);
    if (!dispatched.ok) {
      setStatus({ key: "dataSources.problem.commandFailed", values: { detail: dispatched.error ?? "" } });
      return;
    }

    const createdId = findCreatedConnectionId(previousIds, dispatched.snapshot.dataSources.connections);
    setForm(null);
    setProblems([]);
    setStatus({ key: "dataSources.status.duplicated", values: { name } });
    setFocusTarget(createdId ? { kind: "connection", connectionId: createdId } : { kind: "new" });
  }

  function deleteConnection(connection: DataConnectionListItem) {
    const result = buildDeleteDataConnectionCommand(context.snapshot, connection.id);
    if (!result.ok) {
      const problem = result.problems[0];
      setStatus({ key: PROBLEM_MESSAGE_KEYS[problem.code], values: { detail: problem.message } });
      return;
    }

    const remaining = Object.keys(context.snapshot.dataSources.connections).filter((id) => id !== connection.id);
    const dispatched = context.dispatch(result.command);
    if (!dispatched.ok) {
      setStatus({ key: "dataSources.problem.commandFailed", values: { detail: dispatched.error ?? "" } });
      return;
    }

    setForm(null);
    setProblems([]);
    setStatus({ key: "dataSources.status.deleted" });
    setFocusTarget(remaining[0] ? { kind: "connection", connectionId: remaining[0] } : { kind: "new" });
    if (requestConnectionId === connection.id) {
      setRequestEditor(null);
    }
  }

  function openQuery(connectionId: string, queryId: string | null) {
    setForm(null);
    setRequestEditor(null);
    setBindingsQueryId(null);
    setProblems([]);
    setStatus(null);
    setQueryEditor({ connectionId, queryId });
  }

  function openBindings(queryId: string) {
    setForm(null);
    setRequestEditor(null);
    setQueryEditor(null);
    setProblems([]);
    setStatus(null);
    setBindingsQueryId(queryId);
  }

  function handleBindingLocated(node: { nodeId: string; name: string }) {
    setBindingsQueryId(null);
    onLocateObject?.(node.nodeId);
    setStatus({ key: "dataBinding.queryDialog.locateDone", values: { name: node.name } });
  }

  function closeBindings() {
    const queryId = bindingsQueryId;
    setBindingsQueryId(null);
    if (queryId) {
      setFocusTarget({ kind: "query", queryId, bindings: true });
    }
  }

  function closeQueryEditor() {
    const closing = queryEditor;
    setQueryEditor(null);
    if (closing) {
      setFocusTarget(
        closing.queryId
          ? { kind: "query", queryId: closing.queryId }
          : { kind: "newQuery", connectionId: closing.connectionId }
      );
    }
  }

  function handleQuerySaved(savedId: string, created: boolean) {
    setQueryEditor(null);
    setProblems([]);
    setStatus({
      key: created ? "dataSources.status.querySaved" : "dataSources.status.queryUpdated"
    });
    setFocusTarget({ kind: "query", queryId: savedId });
  }

  function duplicateQuery(query: DataQueryListItem) {
    const result = buildDuplicateDataQueryCommand(context.snapshot, query.id);
    if (!result.ok) {
      const problem = result.problems[0];
      setStatus({ key: DATA_QUERY_DEFINITION_PROBLEM_MESSAGE_KEYS[problem.code], values: { detail: problem.message } });
      return;
    }
    const previousIds = new Set(Object.keys(context.snapshot.dataSources.queries));
    const dispatched = context.dispatch(result.command);
    if (!dispatched.ok) {
      setStatus({ key: "dataSources.queryProblem.commandFailed", values: { detail: dispatched.error ?? "" } });
      return;
    }
    const createdId = Object.keys(dispatched.snapshot.dataSources.queries).find((id) => !previousIds.has(id));
    setStatus({
      key: "dataSources.status.queryDuplicated",
      values: {
        name: result.command.type === "duplicate-data-query" ? result.command.name ?? "" : ""
      }
    });
    setFocusTarget(createdId ? { kind: "query", queryId: createdId } : { kind: "newQuery", connectionId: query.connectionId });
  }

  function deleteQuery(query: DataQueryListItem) {
    const result = buildDeleteDataQueryCommand(context.snapshot, query.id);
    if (!result.ok) {
      const problem = result.problems[0];
      setStatus({ key: DATA_QUERY_DEFINITION_PROBLEM_MESSAGE_KEYS[problem.code], values: { detail: problem.message } });
      return;
    }
    const dispatched = context.dispatch(result.command);
    if (!dispatched.ok) {
      setStatus({ key: "dataSources.queryProblem.commandFailed", values: { detail: dispatched.error ?? "" } });
      return;
    }
    setStatus({ key: "dataSources.status.queryDeleted" });
    setFocusTarget({ kind: "newQuery", connectionId: query.connectionId });
  }

  const dialogOpen = Boolean(form || requestConnectionId || queryEditor || bindingsQueryId);

  return (
    <div className="ek-workbench__data-panel">
      <div className="ek-workbench__section-header">
        <h2>{t("dataSources.panel.label")}</h2>
        <span>{t("dataSources.panel.count", { visibleCount: visibleConnections.length, totalCount: model.totalCount })}</span>
      </div>
      <button ref={newButtonRef} type="button" inert={dialogOpen ? true : undefined} onClick={() => requestClose(openCreate)}>{t("dataSources.new")}</button>
      <label className="ek-workbench__field ek-workbench__field--search">
        <span>{t("dataSources.search.label")}</span>
        <input
          type="search"
          aria-label={t("dataSources.search.label")}
          placeholder={t("dataSources.search.placeholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          inert={dialogOpen ? true : undefined}
        />
      </label>
      {form ? (
        <DataConnectionForm
          key={form.mode.kind === "edit" ? form.mode.connectionId : undefined}
          form={form}
          credentials={credentials}
          problems={problems}
          nameRef={nameRef}
          baseUrlRef={baseUrlRef}
          authRef={authRef}
          credentialRef={credentialRef}
          timeoutRef={timeoutRef}
          discardOpen={discardOpen}
          onChange={(patch) => setForm((current) => current ? { ...current, ...patch } : current)}
          onSubmit={saveForm}
          onCancel={() => requestClose(closeForm)}
          onKeepEditing={keepEditing}
          onDiscard={discardChanges}
          i18n={context.i18n}
        />
      ) : requestConnectionId ? (
        <DataQueryTester
          key={`${requestConnectionId}:${requestEditor?.endpointKind ?? ""}`}
          context={context}
          connectionId={requestConnectionId}
          endpointKind={requestEditor?.endpointKind}
          onRequestClose={() => requestClose(closeRequest)}
          onClose={closeRequest}
          discardRequested={discardOpen}
          onKeepEditing={keepEditing}
          onDraftChange={setRequestDirty}
        />
      ) : null}
      {status ? (
        <p className="ek-workbench__data-status" role="status">{t(status.key, status.values)}</p>
      ) : null}
      {model.empty ? (
        <div className="ek-workbench__empty">
          <strong>{t("dataSources.empty.title")}</strong>
          <p>{t("dataSources.empty.description")}</p>
        </div>
      ) : visibleConnections.length === 0 ? (
        <p className="ek-workbench__empty" role="status">{t("dataSources.noMatches")}</p>
      ) : (
        <ul className="ek-workbench__connection-list" aria-label={t("dataSources.list.label")} inert={dialogOpen ? true : undefined}>
          {visibleConnections.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              boundObjectNames={boundObjectNames.get(connection.id) ?? []}
              i18n={context.i18n}
              editButtonRef={(element) => {
                if (element) {
                  editButtonRefs.current.set(connection.id, element);
                } else {
                  editButtonRefs.current.delete(connection.id);
                }
              }}
              requestButtonRef={(element, kind) => {
                const key = `${connection.id}:${kind ?? ""}`;
                if (element) {
                  requestButtonRefs.current.set(key, element);
                } else {
                  requestButtonRefs.current.delete(key);
                }
              }}
              newQueryButtonRef={(element) => {
                if (element) {
                  newQueryButtonRefs.current.set(connection.id, element);
                } else {
                  newQueryButtonRefs.current.delete(connection.id);
                }
              }}
              queryButtonRef={(queryId, element) => {
                if (element) {
                  queryButtonRefs.current.set(queryId, element);
                } else {
                  queryButtonRefs.current.delete(queryId);
                }
              }}
              onEdit={() => requestClose(() => openEdit(connection))}
              onTest={(kind) => requestClose(() => openRequest(connection, kind))}
              onDuplicate={() => requestClose(() => duplicateConnection(connection))}
              onDelete={() => requestClose(() => deleteConnection(connection))}
              onNewQuery={() => openQuery(connection.id, null)}
              onEditQuery={(query) => openQuery(connection.id, query.id)}
              onManageBindings={(query) => openBindings(query.id)}
              onDuplicateQuery={duplicateQuery}
              onDeleteQuery={deleteQuery}
            />
          ))}
        </ul>
      )}
      {queryEditor ? (
        <DataQueryEditor
          key={`${queryEditor.connectionId}:${queryEditor.queryId ?? "new"}`}
          context={context}
          connectionId={queryEditor.connectionId}
          queryId={queryEditor.queryId}
          onClose={closeQueryEditor}
          onSaved={handleQuerySaved}
        />
      ) : null}
      {bindingsQueryId ? (
        <DataQueryBindingsDialog
          key={bindingsQueryId}
          context={context}
          queryId={bindingsQueryId}
          onClose={closeBindings}
          onLocated={handleBindingLocated}
        />
      ) : null}
    </div>
  );
}

function ConnectionRow({
  connection,
  boundObjectNames,
  i18n,
  editButtonRef,
  requestButtonRef,
  newQueryButtonRef,
  queryButtonRef,
  onEdit,
  onTest,
  onDuplicate,
  onDelete,
  onNewQuery,
  onEditQuery,
  onManageBindings,
  onDuplicateQuery,
  onDeleteQuery
}: {
  connection: DataConnectionListItem;
  boundObjectNames: readonly string[];
  i18n: WorkbenchI18n;
  editButtonRef(element: HTMLButtonElement | null): void;
  requestButtonRef(element: HTMLButtonElement | null, kind?: DataDeviceEndpointKind): void;
  newQueryButtonRef(element: HTMLButtonElement | null): void;
  queryButtonRef(queryId: string, element: HTMLButtonElement | null): void;
  onEdit(): void;
  onTest(kind?: DataDeviceEndpointKind): void;
  onDuplicate(): void;
  onDelete(): void;
  onNewQuery(): void;
  onEditQuery(query: DataQueryListItem): void;
  onManageBindings(query: DataQueryListItem): void;
  onDuplicateQuery(query: DataQueryListItem): void;
  onDeleteQuery(query: DataQueryListItem): void;
}) {
  const t = i18n.t;
  const credentialText = connection.authKind === "none"
    ? null
    : connection.credentialLabel
      ? t("dataSources.list.credential", { label: connection.credentialLabel })
      : t("dataSources.form.credential.missing", { ref: connection.credentialRef ?? "" });

  return (
    <li className="ek-workbench__connection-row" aria-label={t("dataSources.list.rowLabel", { name: connection.name })}>
      <div className="ek-workbench__connection-main">
        <strong>{connection.name}</strong>
        <small>{connection.baseUrl}</small>
      </div>
      <div className="ek-workbench__connection-badges">
        <span>{connection.authKind === "bearer"
          ? t("dataSources.list.auth.bearer")
          : connection.authKind === "api-key"
            ? t("dataSources.list.auth.apiKey")
            : t("dataSources.list.auth.none")}</span>
        {connection.credentialHeaderName
          ? <span>{t("dataSources.list.authHeader", { name: connection.credentialHeaderName })}</span>
          : null}
        {credentialText ? <span data-state={connection.missingCredential ? "missing" : undefined}>{credentialText}</span> : null}
        {connection.missingCredential ? <span data-state="missing">{t("dataSources.list.credentialMissing")}</span> : null}
        <span>{t("dataSources.list.timeout", { seconds: formatSeconds(connection.timeoutMs) })}</span>
        {connection.headerCount > 0 ? <span>{t("dataSources.list.headers", { count: connection.headerCount })}</span> : null}
        <span>{connection.referenced ? t("dataSources.list.referenced") : t("dataSources.list.unreferenced")}</span>
      </div>
      <small className="ek-workbench__connection-usage">{t("dataSources.list.queries", { count: connection.queryCount })} · {boundObjectLabel(t, connection.bindingCount)}</small>
      {boundObjectNames.length > 0 ? (
        <small className="ek-workbench__connection-usage">
          {t("dataSources.list.appliedTo", { names: boundObjectNames.join(", ") })}
        </small>
      ) : null}
      <div className="ek-workbench__connection-actions">
        <button ref={editButtonRef} type="button" aria-label={t("dataSources.actions.editAria", { name: connection.name })} onClick={onEdit}>{t("dataSources.actions.edit")}</button>
        <button ref={(element) => requestButtonRef(element)} type="button" aria-label={t("dataSources.actions.testAria", { name: connection.name })} onClick={() => onTest()}>{t("dataSources.actions.test")}</button>
        <button type="button" aria-label={t("dataSources.actions.duplicateAria", { name: connection.name })} onClick={onDuplicate}>{t("dataSources.actions.duplicate")}</button>
        <button
          type="button"
          aria-label={t("dataSources.actions.deleteAria", { name: connection.name })}
          title={connection.referenced ? t("dataSources.delete.referencedReason") : undefined}
          disabled={connection.referenced}
          onClick={onDelete}
        >{t("dataSources.actions.delete")}</button>
      </div>
      {connection.referenced ? <small>{t("dataSources.delete.referencedReason")}</small> : null}
      <div className="ek-workbench__connection-actions">
        {DATA_DEVICE_ENDPOINT_KINDS.map((kind) => (
          <button
            key={kind}
            ref={(element) => requestButtonRef(element, kind)}
            type="button"
            aria-label={t(`dataSources.endpoints.${kind}Aria`, { name: connection.name })}
            onClick={() => onTest(kind)}
          >{t(`dataSources.endpoints.${kind}`)}</button>
        ))}
      </div>

      <div className="ek-workbench__query-list">
        <div className="ek-workbench__query-list-header">
          <span>{t("dataSources.queries.label")}</span>
          <button
            ref={newQueryButtonRef}
            type="button"
            aria-label={t("dataSources.queries.newAria", { name: connection.name })}
            onClick={onNewQuery}
          >{t("dataSources.queries.new")}</button>
        </div>
        {connection.queries.length === 0 ? (
          <small>{t("dataSources.queries.empty")}</small>
        ) : (
          <ul aria-label={t("dataSources.queries.listAria", { name: connection.name })}>
            {connection.queries.map((query) => (
              <li key={query.id} className="ek-workbench__query-row" aria-label={t("dataSources.queries.rowLabel", { name: query.name })}>
                <div className="ek-workbench__query-main">
                  <strong>{query.name}</strong>
                  <small>{query.method} · {query.path}</small>
                  <small>{t("dataSources.queries.summary", {
                    count: query.propertyCount,
                    mode: t(query.mode === "array"
                      ? "dataSources.queries.mode.array"
                      : "dataSources.queries.mode.single")
                  })}</small>
                  {query.method === "POST" ? <small>{t("dataSources.queries.manual")}</small> : null}
                  {query.bindingCount > 0 ? <small>{boundObjectLabel(t, query.bindingCount)}</small> : null}
                </div>
                <div className="ek-workbench__query-actions">
                  <button
                    type="button"
                    aria-label={t("dataSources.queries.editAria", { name: query.name })}
                    onClick={() => onEditQuery(query)}
                  >{t("dataSources.queries.edit")}</button>
                  <button
                    ref={(element) => queryButtonRef(query.id, element)}
                    type="button"
                    aria-label={t("dataBinding.queryDialog.openAria", { name: query.name })}
                    onClick={() => onManageBindings(query)}
                  >{t("dataBinding.queryDialog.open")}</button>
                  <button
                    type="button"
                    aria-label={t("dataSources.queries.duplicateAria", { name: query.name })}
                    onClick={() => onDuplicateQuery(query)}
                  >{t("dataSources.queries.duplicate")}</button>
                  <button
                    type="button"
                    aria-label={t("dataSources.queries.deleteAria", { name: query.name })}
                    title={query.referenced ? t("dataSources.queries.deleteReferenced") : undefined}
                    disabled={query.referenced}
                    onClick={() => onDeleteQuery(query)}
                  >{t("dataSources.queries.delete")}</button>
                </div>
                {query.referenced ? <small>{t("dataSources.queries.deleteReferenced")}</small> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function DataConnectionForm({
  form,
  credentials,
  problems,
  nameRef,
  baseUrlRef,
  authRef,
  credentialRef,
  timeoutRef,
  discardOpen,
  onChange,
  onSubmit,
  onCancel,
  onKeepEditing,
  onDiscard,
  i18n
}: {
  form: DataFormState;
  credentials: readonly DataCredentialDescriptor[];
  problems: readonly DataConnectionProblem[];
  nameRef: RefObject<HTMLInputElement | null>;
  baseUrlRef: RefObject<HTMLInputElement | null>;
  authRef: RefObject<HTMLButtonElement | null>;
  credentialRef: RefObject<HTMLButtonElement | null>;
  timeoutRef: RefObject<HTMLInputElement | null>;
  discardOpen: boolean;
  onChange(patch: Partial<DataFormState>): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onCancel(): void;
  onKeepEditing(): void;
  onDiscard(): void;
  i18n: WorkbenchI18n;
}) {
  const t = i18n.t;
  const id = useId();
  const selectedCredential = credentials.find((credential) => credential.ref === form.credentialRef);
  const missingCredential = form.credentialRef.length > 0 && !selectedCredential;
  const unavailableCredential = selectedCredential && !selectedCredential.available;
  const title = form.mode.kind === "create" ? t("dataSources.form.newTitle") : t("dataSources.form.editTitle");
  const fieldProblems = (field: DataConnectionProblem["field"]) =>
    problems.filter((problem) => problem.field === field);
  const fieldError = (field: DataConnectionProblem["field"]) => {
    const entries = fieldProblems(field);
    return entries.length > 0 ? entries.map((problem) => t(PROBLEM_MESSAGE_KEYS[problem.code], { detail: problem.message })).join(" ") : null;
  };
  const describedBy = (field: DataConnectionProblem["field"]) =>
    fieldProblems(field).length > 0 ? `${id}-${field}-error` : undefined;
  const summaryProblems = problems.filter((problem) => problem.field === "connection" || problem.field === "headers");

  return (
    <Dialog
      className="ek-workbench__connection-dialog"
      label={title}
      title={title}
      onDismiss={onCancel}
      initialFocus={nameRef}
      discard={discardOpen ? {
        title: t("dataSources.form.discard.title"),
        description: t("dataSources.form.discard.description"),
        keepLabel: t("dataSources.form.discard.keep"),
        discardLabel: t("dataSources.form.discard.confirm"),
        onKeepEditing,
        onDiscard
      } : undefined}
    >
      <form className="ek-workbench__connection-form" aria-label={title} onSubmit={onSubmit} noValidate>
        <div className="ek-workbench__dialog-content">
          <fieldset className="ek-workbench__form-section" aria-label={t("dataSources.form.section.connection")}>
            <legend>{t("dataSources.form.section.connection")}</legend>
            <label className="ek-workbench__field">
              <span>{t("dataSources.form.name")}</span>
              <Input
                ref={nameRef}
                type="text"
                required
                aria-label={t("dataSources.form.name")}
                aria-required="true"
                aria-invalid={fieldProblems("name").length > 0}
                aria-describedby={describedBy("name")}
                value={form.name}
                onChange={(event) => onChange({ name: event.target.value })}
              />
            </label>
            {fieldError("name") ? <small id={`${id}-name-error`} role="alert">{fieldError("name")}</small> : null}

            <label className="ek-workbench__field">
              <span>{t("dataSources.form.baseUrl")}</span>
              <Input
                ref={baseUrlRef}
                type="text"
                required
                aria-label={t("dataSources.form.baseUrl")}
                aria-required="true"
                aria-invalid={fieldProblems("baseUrl").length > 0}
                aria-describedby={describedBy("baseUrl")}
                value={form.baseUrl}
                onChange={(event) => onChange({ baseUrl: event.target.value })}
              />
              <small>{t("dataSources.form.baseUrlHint")}</small>
            </label>
            {fieldError("baseUrl") ? <small id={`${id}-baseUrl-error`} role="alert">{fieldError("baseUrl")}</small> : null}

            <label className="ek-workbench__field">
              <span>{t("dataSources.form.timeout")}</span>
              <Input
                ref={timeoutRef}
                type="number"
                min="0.001"
                step="0.001"
                inputMode="decimal"
                required
                aria-label={t("dataSources.form.timeout")}
                aria-required="true"
                aria-invalid={fieldProblems("timeoutMs").length > 0}
                aria-describedby={describedBy("timeoutMs")}
                value={form.timeoutSeconds}
                onChange={(event) => onChange({ timeoutSeconds: event.target.value })}
              />
            </label>
            {fieldError("timeoutMs") ? <small id={`${id}-timeoutMs-error`} role="alert">{fieldError("timeoutMs")}</small> : null}
          </fieldset>

          <fieldset className="ek-workbench__form-section" aria-label={t("dataSources.form.section.authentication")}>
            <legend>{t("dataSources.form.section.authentication")}</legend>
            <label className="ek-workbench__field">
              <span>{t("dataSources.form.auth")}</span>
              <WorkbenchSelect
                ref={authRef}
                aria-label={t("dataSources.form.auth")}
                aria-invalid={fieldProblems("auth").length > 0}
                aria-describedby={describedBy("auth")}
                value={form.authKind}
                options={[
                  { value: "none", label: t("dataSources.form.auth.none") },
                  { value: "bearer", label: t("dataSources.form.auth.bearer") },
                  { value: "api-key", label: t("dataSources.form.auth.apiKey") }
                ]}
                onChange={(next) => onChange({ authKind: next })}
              />
            </label>

            {form.authKind === "api-key" ? (
              <label className="ek-workbench__field">
                <span>{t("dataSources.form.apiKeyHeader")}</span>
                <Input
                  type="text"
                  aria-label={t("dataSources.form.apiKeyHeader")}
                  aria-invalid={fieldProblems("auth").length > 0}
                  aria-describedby={describedBy("auth")}
                  value={form.apiKeyHeader}
                  onChange={(event) => onChange({ apiKeyHeader: event.target.value })}
                />
                <small>{t("dataSources.form.apiKeyHeaderHint")}</small>
              </label>
            ) : null}

            {form.authKind !== "none" ? (
              <label className="ek-workbench__field">
                <span>{t("dataSources.form.credential")}</span>
                <WorkbenchSelect
                  ref={credentialRef}
                  aria-label={t("dataSources.form.credential")}
                  aria-invalid={fieldProblems("auth").length > 0}
                  aria-describedby={describedBy("auth")}
                  value={form.credentialRef}
                  options={[
                    { value: "", label: t("dataSources.form.credential.placeholder") },
                    ...credentials.map((credential) => ({
                      value: credential.ref,
                      label: credential.available
                        ? credential.label
                        : t("dataSources.form.credential.unavailable", { label: credential.label })
                    })),
                    ...(missingCredential
                      ? [{ value: form.credentialRef, label: t("dataSources.form.credential.missing", { ref: form.credentialRef }) }]
                      : [])
                  ]}
                  onChange={(next) => onChange({ credentialRef: next })}
                />
                {credentials.length === 0 ? <small>{t("dataSources.form.credential.empty")}</small> : null}
                {missingCredential ? <small data-state="missing">{t("dataSources.form.credential.missing", { ref: form.credentialRef })}</small> : null}
                {unavailableCredential ? <small data-state="missing">{t("dataSources.form.credential.unavailable", { label: selectedCredential?.label ?? "" })}</small> : null}
              </label>
            ) : null}
            {fieldError("auth") ? <small id={`${id}-auth-error`} role="alert">{fieldError("auth")}</small> : null}
          </fieldset>

          <fieldset className="ek-workbench__form-section" aria-label={t("dataSources.form.section.headers")}>
            <legend>{t("dataSources.form.section.headers")}</legend>
            <div className="ek-workbench__connection-headers">
              {form.headers.length === 0 ? <small>{t("dataSources.form.headers.empty")}</small> : null}
              {form.headers.map((header, index) => {
                const row = index + 1;
                const updateHeader = (patch: Partial<DataFormHeader>) => onChange({
                  headers: form.headers.map((entry) => entry.id === header.id ? { ...entry, ...patch } : entry)
                });
                return (
                  <div key={header.id} className="ek-workbench__connection-header-row">
                    <Input
                      type="text"
                      aria-label={`${t("dataSources.form.headers.name")} ${row}`}
                      placeholder={t("dataSources.form.headers.name")}
                      value={header.name}
                      onChange={(event) => updateHeader({ name: event.target.value })}
                    />
                    <Input
                      type="text"
                      aria-label={`${t("dataSources.form.headers.value")} ${row}`}
                      placeholder={t("dataSources.form.headers.value")}
                      value={header.value}
                      onChange={(event) => updateHeader({ value: event.target.value })}
                    />
                    <Button
                      aria-label={t("dataSources.form.headers.removeAria", { index: row })}
                      onClick={() => onChange({ headers: form.headers.filter((entry) => entry.id !== header.id) })}
                    >{t("dataSources.form.headers.remove")}</Button>
                  </div>
                );
              })}
              <Button onClick={() => onChange({ headers: [...form.headers, createFormHeader()] })}>
                {t("dataSources.form.headers.add")}
              </Button>
              <small>{t("dataSources.form.headers.hint")}</small>
            </div>
          </fieldset>

          {summaryProblems.length > 0 ? (
            <div className="ek-workbench__connection-problems" role="alert" aria-label={t("dataSources.form.problems")}>
              <strong>{t("dataSources.form.problems")}</strong>
              <ul>
                {summaryProblems.map((problem, index) => (
                  <li key={`${problem.field}-${problem.code}-${index}`}>
                    {t(PROBLEM_MESSAGE_KEYS[problem.code], { detail: problem.message })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="ek-workbench__connection-form-actions">
            <Button type="submit">{t("dataSources.form.save")}</Button>
            <Button data-dialog-dismiss className="ek-ui-button--quiet" onClick={onCancel}>{t("dataSources.form.cancel")}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

let nextHeaderId = 0;

function findCreatedConnectionId(
  previousIds: ReadonlySet<string>,
  connections: Record<string, unknown>
): string | undefined {
  return Object.keys(connections).find((id) => !previousIds.has(id));
}

function createFormHeader(name = "", value = ""): DataFormHeader {
  nextHeaderId += 1;
  return { id: `header-${nextHeaderId}`, name, value };
}

function formToHeaders(headers: readonly DataFormHeader[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const header of headers) {
    if (!header.name && !header.value) {
      continue;
    }
    result[header.name] = header.value;
  }
  return result;
}

function serializeFormDraft(form: Omit<DataFormState, "baseline">): string {
  return JSON.stringify({
    name: form.name,
    baseUrl: form.baseUrl,
    authKind: form.authKind,
    credentialRef: form.credentialRef,
    apiKeyHeader: form.apiKeyHeader,
    timeoutSeconds: form.timeoutSeconds,
    headers: form.headers.map(({ name, value }) => ({ name, value }))
  });
}

function isFormDirty(form: DataFormState): boolean {
  return serializeFormDraft(form) !== form.baseline;
}

function formatSeconds(milliseconds: number): string {
  return String(milliseconds / 1000);
}

function boundObjectLabel(t: WorkbenchI18n["t"], count: number): string {
  return t(count === 1
    ? "dataSources.list.boundObjects.one"
    : "dataSources.list.boundObjects.other", { count });
}
