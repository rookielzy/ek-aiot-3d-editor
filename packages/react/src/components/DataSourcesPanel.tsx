import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import {
  buildDeleteDataConnectionCommand,
  buildDeleteDataQueryCommand,
  buildDuplicateDataConnectionCommand,
  buildDuplicateDataQueryCommand,
  buildSaveDataConnectionCommand,
  createUniqueDataConnectionName,
  DEFAULT_DATA_CONNECTION_TIMEOUT_MS,
  filterDataConnectionItems,
  type DataConnectionAuth,
  type DataConnectionDraft,
  type DataConnectionListItem,
  type DataConnectionProblem,
  type DataConnectionProblemCode,
  type DataCredentialDescriptor,
  type DataQueryListItem
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchI18n, WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { DataQueryEditor } from "./DataQueryEditor";
import { DataQueryBindingsDialog } from "./DataQueryBindingsDialog";
import { DataQueryTester } from "./DataQueryTester";
import { DATA_QUERY_DEFINITION_PROBLEM_MESSAGE_KEYS } from "./data-query-problem-messages";

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
  | { kind: "request"; connectionId: string }
  | { kind: "query"; queryId: string }
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
  "header-reserved": "dataSources.problem.headerReserved",
  "headers-invalid": "dataSources.problem.headersInvalid",
  "name-duplicate": "dataSources.problem.nameDuplicate",
  "name-required": "dataSources.problem.nameRequired",
  "timeout-invalid": "dataSources.problem.timeoutInvalid"
} satisfies Record<DataConnectionProblemCode, WorkbenchMessageKey>;

export function DataSourcesPanel({
  context,
  locate,
  onLocateHandled
}: {
  context: ResolvedWorkbenchContext;
  locate?: { connectionId: string; queryId: string } | null;
  onLocateHandled?(): void;
}) {
  // Drafts and response samples belong to the editor that opened the panel.
  const [session, setSession] = useState({ editor: context.editor, key: 0 });
  if (session.editor !== context.editor) {
    setSession({ editor: context.editor, key: session.key + 1 });
    return null;
  }
  return <DataSourcesSession key={session.key} context={context} locate={locate} onLocateHandled={onLocateHandled} />;
}

function DataSourcesSession({
  context,
  locate,
  onLocateHandled
}: {
  context: ResolvedWorkbenchContext;
  locate?: { connectionId: string; queryId: string } | null;
  onLocateHandled?(): void;
}) {
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<DataFormState | null>(null);
  const [requestConnectionId, setRequestConnectionId] = useState<string | null>(null);
  const [queryEditor, setQueryEditor] = useState<{ connectionId: string; queryId: string | null } | null>(null);
  const [bindingsQueryId, setBindingsQueryId] = useState<string | null>(null);
  const [problems, setProblems] = useState<DataConnectionProblem[]>([]);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pendingCloseRef = useRef<(() => void) | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const baseUrlRef = useRef<HTMLInputElement>(null);
  const authRef = useRef<HTMLSelectElement>(null);
  const credentialRef = useRef<HTMLSelectElement>(null);
  const timeoutRef = useRef<HTMLInputElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const requestButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const newQueryButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const queryButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const discardId = useId();
  const t = context.i18n.t;
  const model = context.model.dataSources;
  const credentials = context.editor.getDataCredentials?.() ?? [];
  const visibleConnections = filterDataConnectionItems(model.connections, { query });
  const formKey = form
    ? `${form.mode.kind}:${form.mode.kind === "edit" ? form.mode.connectionId : ""}`
    : null;

  useEffect(() => {
    if (formKey && !discardOpen) {
      nameRef.current?.focus();
    }
  }, [formKey, discardOpen]);

  useEffect(() => {
    if (!focusTarget) {
      return;
    }
    if (focusTarget.kind === "connection") {
      editButtonRefs.current.get(focusTarget.connectionId)?.focus();
    } else if (focusTarget.kind === "request") {
      requestButtonRefs.current.get(focusTarget.connectionId)?.focus();
    } else if (focusTarget.kind === "query") {
      queryButtonRefs.current.get(focusTarget.queryId)?.focus();
    } else if (focusTarget.kind === "newQuery") {
      newQueryButtonRefs.current.get(focusTarget.connectionId)?.focus();
    } else {
      newButtonRef.current?.focus();
    }
    setFocusTarget(null);
  }, [focusTarget]);

  useEffect(() => {
    if (discardOpen) {
      keepEditingRef.current?.focus();
    }
  }, [discardOpen]);

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
      setRequestConnectionId(null);
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
      setBindingsQueryId(null);
    }
  }, [bindingsQueryId, context.snapshot]);

  useEffect(() => {
    if (!locate) {
      return;
    }
    onLocateHandled?.();
    if (form || requestConnectionId || queryEditor || bindingsQueryId) {
      return;
    }
    const connection = context.snapshot.dataSources.connections[locate.connectionId];
    const query = context.snapshot.dataSources.queries[locate.queryId];
    if (connection && query?.connectionId === connection.id) {
      openQuery(connection.id, query.id);
    }
    // Locate requests are consumed once per identity; openQuery intentionally
    // uses the panel's current draft guards above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locate]);

  function openCreate() {
    setRequestConnectionId(null);
    setQueryEditor(null);
    setProblems([]);
    setStatus(null);
    const next: DataFormState = {
      mode: { kind: "create" },
      name: "",
      baseUrl: "",
      authKind: "none",
      credentialRef: "",
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
    setRequestConnectionId(null);
    setQueryEditor(null);
    setProblems([]);
    setStatus(null);
    const next: DataFormState = {
      mode: { kind: "edit", connectionId: connection.id },
      name: stored.name,
      baseUrl: stored.baseUrl,
      authKind: stored.auth.kind,
      credentialRef: stored.auth.kind === "bearer" ? stored.auth.credentialRef : "",
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

  function openRequest(connection: DataConnectionListItem) {
    setForm(null);
    setQueryEditor(null);
    setProblems([]);
    setStatus(null);
    setRequestConnectionId(connection.id);
  }

  function closeRequest() {
    const connectionId = requestConnectionId;
    setRequestConnectionId(null);
    if (connectionId) {
      setFocusTarget({ kind: "request", connectionId });
    }
  }

  function requestClose(action: () => void) {
    if (form && isFormDirty(form)) {
      pendingCloseRef.current = action;
      setDiscardOpen(true);
      return;
    }
    action();
  }

  function keepEditing() {
    pendingCloseRef.current = null;
    setDiscardOpen(false);
    nameRef.current?.focus();
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
      setRequestConnectionId(null);
    }
  }

  function openQuery(connectionId: string, queryId: string | null) {
    setForm(null);
    setRequestConnectionId(null);
    setBindingsQueryId(null);
    setProblems([]);
    setStatus(null);
    setQueryEditor({ connectionId, queryId });
  }

  function openBindings(queryId: string) {
    setForm(null);
    setRequestConnectionId(null);
    setQueryEditor(null);
    setProblems([]);
    setStatus(null);
    setBindingsQueryId(queryId);
  }

  function closeBindings() {
    const queryId = bindingsQueryId;
    setBindingsQueryId(null);
    if (queryId) {
      setFocusTarget({ kind: "query", queryId });
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

  return (
    <div className="ek-workbench__data-panel">
      <div className="ek-workbench__section-header">
        <h2>{t("dataSources.panel.label")}</h2>
        <span>{t("dataSources.panel.count", { visibleCount: visibleConnections.length, totalCount: model.totalCount })}</span>
      </div>
      <button ref={newButtonRef} type="button" inert={queryEditor || bindingsQueryId ? true : undefined} onClick={() => requestClose(openCreate)}>{t("dataSources.new")}</button>
      <label className="ek-workbench__field ek-workbench__field--search">
        <span>{t("dataSources.search.label")}</span>
        <input
          type="search"
          aria-label={t("dataSources.search.label")}
          placeholder={t("dataSources.search.placeholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          inert={queryEditor || bindingsQueryId ? true : undefined}
        />
      </label>
      {form ? (
        <DataConnectionForm
          form={form}
          credentials={credentials}
          problems={problems}
          nameRef={nameRef}
          baseUrlRef={baseUrlRef}
          authRef={authRef}
          credentialRef={credentialRef}
          timeoutRef={timeoutRef}
          onChange={(patch) => setForm((current) => current ? { ...current, ...patch } : current)}
          onSubmit={saveForm}
          onCancel={() => requestClose(closeForm)}
          i18n={context.i18n}
        />
      ) : requestConnectionId ? (
        <DataQueryTester
          key={requestConnectionId}
          context={context}
          connectionId={requestConnectionId}
          onClose={closeRequest}
        />
      ) : null}
      {discardOpen ? (
        <div
          className="ek-workbench__connection-discard"
          role="alertdialog"
          aria-label={t("dataSources.form.discard.title")}
          aria-describedby={`${discardId}-description`}
        >
          <strong>{t("dataSources.form.discard.title")}</strong>
          <p id={`${discardId}-description`}>{t("dataSources.form.discard.description")}</p>
          <div className="ek-workbench__connection-discard-actions">
            <button ref={keepEditingRef} type="button" onClick={keepEditing}>{t("dataSources.form.discard.keep")}</button>
            <button type="button" onClick={discardChanges}>{t("dataSources.form.discard.confirm")}</button>
          </div>
        </div>
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
        <ul className="ek-workbench__connection-list" aria-label={t("dataSources.list.label")} inert={queryEditor || bindingsQueryId ? true : undefined}>
          {visibleConnections.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              i18n={context.i18n}
              editButtonRef={(element) => {
                if (element) {
                  editButtonRefs.current.set(connection.id, element);
                } else {
                  editButtonRefs.current.delete(connection.id);
                }
              }}
              requestButtonRef={(element) => {
                if (element) {
                  requestButtonRefs.current.set(connection.id, element);
                } else {
                  requestButtonRefs.current.delete(connection.id);
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
              onTest={() => requestClose(() => openRequest(connection))}
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
        />
      ) : null}
    </div>
  );
}

function ConnectionRow({
  connection,
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
  i18n: WorkbenchI18n;
  editButtonRef(element: HTMLButtonElement | null): void;
  requestButtonRef(element: HTMLButtonElement | null): void;
  newQueryButtonRef(element: HTMLButtonElement | null): void;
  queryButtonRef(queryId: string, element: HTMLButtonElement | null): void;
  onEdit(): void;
  onTest(): void;
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
        <span>{connection.authKind === "bearer" ? t("dataSources.list.auth.bearer") : t("dataSources.list.auth.none")}</span>
        {credentialText ? <span data-state={connection.missingCredential ? "missing" : undefined}>{credentialText}</span> : null}
        {connection.missingCredential ? <span data-state="missing">{t("dataSources.list.credentialMissing")}</span> : null}
        <span>{t("dataSources.list.timeout", { seconds: formatSeconds(connection.timeoutMs) })}</span>
        {connection.headerCount > 0 ? <span>{t("dataSources.list.headers", { count: connection.headerCount })}</span> : null}
        <span>{connection.referenced ? t("dataSources.list.referenced") : t("dataSources.list.unreferenced")}</span>
      </div>
      <small className="ek-workbench__connection-usage">{t("dataSources.list.queries", { count: connection.queryCount })}</small>
      <div className="ek-workbench__connection-actions">
        <button ref={editButtonRef} type="button" aria-label={t("dataSources.actions.editAria", { name: connection.name })} onClick={onEdit}>{t("dataSources.actions.edit")}</button>
        <button ref={requestButtonRef} type="button" aria-label={t("dataSources.actions.testAria", { name: connection.name })} onClick={onTest}>{t("dataSources.actions.test")}</button>
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
                  <small>{query.path}</small>
                  <small>{t("dataSources.queries.summary", {
                    count: query.propertyCount,
                    mode: t(query.mode === "array"
                      ? "dataSources.queries.mode.array"
                      : "dataSources.queries.mode.single")
                  })}</small>
                </div>
                <div className="ek-workbench__query-actions">
                  <button
                    ref={(element) => queryButtonRef(query.id, element)}
                    type="button"
                    aria-label={t("dataSources.queries.editAria", { name: query.name })}
                    onClick={() => onEditQuery(query)}
                  >{t("dataSources.queries.edit")}</button>
                  <button
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
  onChange,
  onSubmit,
  onCancel,
  i18n
}: {
  form: DataFormState;
  credentials: readonly DataCredentialDescriptor[];
  problems: readonly DataConnectionProblem[];
  nameRef: RefObject<HTMLInputElement | null>;
  baseUrlRef: RefObject<HTMLInputElement | null>;
  authRef: RefObject<HTMLSelectElement | null>;
  credentialRef: RefObject<HTMLSelectElement | null>;
  timeoutRef: RefObject<HTMLInputElement | null>;
  onChange(patch: Partial<DataFormState>): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onCancel(): void;
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
    <form className="ek-workbench__connection-form" aria-label={title} onSubmit={onSubmit} noValidate>
      <h3>{title}</h3>
      <label className="ek-workbench__field">
        <span>{t("dataSources.form.name")}</span>
        <input
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
        <input
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
        <span>{t("dataSources.form.auth")}</span>
        <select
          ref={authRef}
          aria-label={t("dataSources.form.auth")}
          aria-invalid={fieldProblems("auth").length > 0}
          value={form.authKind}
          onChange={(event) => onChange({ authKind: event.target.value as DataConnectionAuth["kind"] })}
        >
          <option value="none">{t("dataSources.form.auth.none")}</option>
          <option value="bearer">{t("dataSources.form.auth.bearer")}</option>
        </select>
      </label>

      {form.authKind === "bearer" ? (
        <label className="ek-workbench__field">
          <span>{t("dataSources.form.credential")}</span>
          <select
            ref={credentialRef}
            aria-label={t("dataSources.form.credential")}
            aria-invalid={fieldProblems("auth").length > 0}
            value={form.credentialRef}
            onChange={(event) => onChange({ credentialRef: event.target.value })}
          >
            <option value="">{t("dataSources.form.credential.placeholder")}</option>
            {credentials.map((credential) => (
              <option key={credential.ref} value={credential.ref}>
                {credential.available
                  ? credential.label
                  : t("dataSources.form.credential.unavailable", { label: credential.label })}
              </option>
            ))}
            {missingCredential ? (
              <option value={form.credentialRef}>{t("dataSources.form.credential.missing", { ref: form.credentialRef })}</option>
            ) : null}
          </select>
          {credentials.length === 0 ? <small>{t("dataSources.form.credential.empty")}</small> : null}
          {missingCredential ? <small data-state="missing">{t("dataSources.form.credential.missing", { ref: form.credentialRef })}</small> : null}
          {unavailableCredential ? <small data-state="missing">{t("dataSources.form.credential.unavailable", { label: selectedCredential?.label ?? "" })}</small> : null}
        </label>
      ) : null}
      {fieldError("auth") ? <small id={`${id}-auth-error`} role="alert">{fieldError("auth")}</small> : null}

      <fieldset className="ek-workbench__connection-headers">
        <legend>{t("dataSources.form.headers")}</legend>
        <small>{t("dataSources.form.headers.hint")}</small>
        {form.headers.length === 0 ? <small>{t("dataSources.form.headers.empty")}</small> : null}
        {form.headers.map((header, index) => {
          const row = index + 1;
          const updateHeader = (patch: Partial<DataFormHeader>) => onChange({
            headers: form.headers.map((entry) => entry.id === header.id ? { ...entry, ...patch } : entry)
          });
          return (
            <div key={header.id} className="ek-workbench__connection-header-row">
              <input
                type="text"
                aria-label={`${t("dataSources.form.headers.name")} ${row}`}
                placeholder={t("dataSources.form.headers.name")}
                value={header.name}
                onChange={(event) => updateHeader({ name: event.target.value })}
              />
              <input
                type="text"
                aria-label={`${t("dataSources.form.headers.value")} ${row}`}
                placeholder={t("dataSources.form.headers.value")}
                value={header.value}
                onChange={(event) => updateHeader({ value: event.target.value })}
              />
              <button
                type="button"
                aria-label={t("dataSources.form.headers.removeAria", { index: row })}
                onClick={() => onChange({ headers: form.headers.filter((entry) => entry.id !== header.id) })}
              >{t("dataSources.form.headers.remove")}</button>
            </div>
          );
        })}
        <button type="button" onClick={() => onChange({ headers: [...form.headers, createFormHeader()] })}>
          {t("dataSources.form.headers.add")}
        </button>
      </fieldset>

      <label className="ek-workbench__field">
        <span>{t("dataSources.form.timeout")}</span>
        <input
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
        <button type="submit">{t("dataSources.form.save")}</button>
        <button type="button" onClick={onCancel}>{t("dataSources.form.cancel")}</button>
      </div>
    </form>
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
