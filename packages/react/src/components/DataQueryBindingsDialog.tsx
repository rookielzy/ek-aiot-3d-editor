import { useEffect, useId, useRef, useState } from "react";
import { buildDeleteDataObjectBindingCommand, type DataBindingProblem } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { DataBindingForm } from "./DataBindingForm";

export interface DataQueryBindingsDialogProps {
  context: ResolvedWorkbenchContext;
  queryId: string;
  onClose(): void;
}

export function DataQueryBindingsDialog({ context, queryId, onClose }: DataQueryBindingsDialogProps) {
  const query = context.snapshot.dataSources.queries[queryId] ?? null;
  const objectNodes = Object.values(context.snapshot.nodes).filter((node) => node.kind === "object");
  const bindings = Object.values(context.snapshot.dataSources.bindings)
    .filter((binding) => binding.queryId === queryId);
  const [selectedObjectId, setSelectedObjectId] = useState(() =>
    bindings.find((binding) => objectNodes.some((node) => node.id === binding.objectNodeId))?.objectNodeId
      ?? objectNodes[0]?.id
      ?? ""
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLButtonElement>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [problems, setProblems] = useState<DataBindingProblem[]>([]);
  const titleId = useId();
  const t = context.i18n.t;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) {
      return;
    }
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (selectedObjectId && !objectNodes.some((node) => node.id === selectedObjectId)) {
      setDirty(false);
      setSelectedObjectId(objectNodes[0]?.id ?? "");
    }
  }, [objectNodes, selectedObjectId]);

  useEffect(() => {
    if (discardOpen) {
      keepEditingRef.current?.focus();
      return;
    }
    closeRef.current?.focus();
  }, [discardOpen]);

  function requestAction(action: () => void): void {
    if (dirty) {
      pendingActionRef.current = action;
      setDiscardOpen(true);
      return;
    }
    action();
  }

  function keepEditing(): void {
    pendingActionRef.current = null;
    setDiscardOpen(false);
  }

  function discardChanges(): void {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setDiscardOpen(false);
    setDirty(false);
    action?.();
  }

  function selectObject(objectNodeId: string): void {
    if (objectNodeId === selectedObjectId) return;
    requestAction(() => setSelectedObjectId(objectNodeId));
  }

  function selectInScene(objectNodeId: string): void {
    requestAction(() => {
      context.dispatch({
        type: "select-nodes",
        mode: "replace",
        nodeIds: [objectNodeId],
        primaryNodeId: objectNodeId
      });
      onClose();
    });
  }

  function unbind(objectNodeId: string, name: string): void {
    requestAction(() => {
      const result = buildDeleteDataObjectBindingCommand(context.snapshot, objectNodeId);
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
      setProblems([]);
      if (objectNodeId === selectedObjectId) {
        setDirty(false);
      }
      setStatus(t("dataBinding.queryDialog.unbound", { name }));
    });
  }

  if (!query) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      className="ek-workbench__binding-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (discardOpen) {
          keepEditing();
          return;
        }
        requestAction(onClose);
      }}
      onClose={onClose}
      onKeyDownCapture={(event) => {
        event.stopPropagation();
        if (!discardOpen || event.key !== "Tab") return;
        if (event.shiftKey && event.target === keepEditingRef.current) {
          event.preventDefault();
          discardRef.current?.focus();
        }
        if (!event.shiftKey && event.target === discardRef.current) {
          event.preventDefault();
          keepEditingRef.current?.focus();
        }
      }}
    >
      <div inert={discardOpen ? true : undefined}>
        <header className="ek-workbench__binding-dialog-header">
          <h2 id={titleId}>{t("dataBinding.queryDialog.title", { name: query.name })}</h2>
          <button ref={closeRef} type="button" onClick={() => requestAction(onClose)}>{t("dataBinding.queryDialog.close")}</button>
        </header>

        {objectNodes.length === 0 ? (
          <p className="ek-workbench__empty">{t("dataBinding.queryDialog.noObjects")}</p>
        ) : (
          <>
            {bindings.length === 0 ? (
              <p className="ek-workbench__binding-hint">{t("dataBinding.queryDialog.empty")}</p>
            ) : (
              <div className="ek-workbench__binding-dialog-list">
                <strong>{t("dataBinding.queryDialog.list")}</strong>
                <ul>
                  {bindings.map((binding) => {
                    const node = objectNodes.find((candidate) => candidate.id === binding.objectNodeId);
                    const name = node?.name ?? binding.objectNodeId;
                    return (
                      <li key={binding.objectNodeId}>
                        <span>{name}</span>
                        <small>{binding.deviceId}</small>
                        <button
                          type="button"
                          aria-label={t("dataBinding.queryDialog.edit", { name })}
                          onClick={() => selectObject(binding.objectNodeId)}
                        >{t("dataBinding.queryDialog.open")}</button>
                        <button
                          type="button"
                          aria-label={t("dataBinding.queryDialog.selectAria", { name })}
                          onClick={() => selectInScene(binding.objectNodeId)}
                        >{t("dataBinding.queryDialog.select")}</button>
                        <button
                          type="button"
                          aria-label={t("dataBinding.queryDialog.unbindAria", { name })}
                          onClick={() => unbind(binding.objectNodeId, name)}
                        >{t("dataBinding.queryDialog.unbind")}</button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {status ? <p className="ek-workbench__data-status" role="status">{status}</p> : null}
            {problems.length > 0 ? (
              <div className="ek-workbench__binding-problems" role="alert">
                <ul>
                  {problems.map((problem, index) => (
                    <li key={`${problem.code}-${index}`}>{problem.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <label className="ek-workbench__field">
              <span>{t("dataBinding.queryDialog.object")}</span>
              <select
                aria-label={t("dataBinding.queryDialog.object")}
                value={selectedObjectId}
                onChange={(event) => selectObject(event.target.value)}
              >
                <option value="">{t("dataBinding.queryDialog.selectObject")}</option>
                {objectNodes.map((node) => (
                  <option key={node.id} value={node.id}>{node.name}</option>
                ))}
              </select>
            </label>

            {selectedObjectId ? (
              <DataBindingForm
                key={`${queryId}:${selectedObjectId}`}
                context={context}
                objectNodeId={selectedObjectId}
                fixedQueryId={queryId}
                onDirtyChange={setDirty}
              />
            ) : null}
          </>
        )}
      </div>
      {discardOpen ? (
        <div
          className="ek-workbench__connection-discard"
          role="alertdialog"
          aria-label={t("dataBinding.queryDialog.discard.title")}
          aria-describedby={`${titleId}-discard-description`}
        >
          <strong>{t("dataBinding.queryDialog.discard.title")}</strong>
          <p id={`${titleId}-discard-description`}>{t("dataBinding.queryDialog.discard.description")}</p>
          <div className="ek-workbench__connection-discard-actions">
            <button ref={keepEditingRef} type="button" onClick={keepEditing}>
              {t("dataSources.queryEditor.discard.keep")}
            </button>
            <button ref={discardRef} type="button" onClick={discardChanges}>
              {t("dataSources.queryEditor.discard.confirm")}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
