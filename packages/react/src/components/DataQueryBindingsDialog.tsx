import { useEffect, useId, useRef, useState } from "react";
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
      setSelectedObjectId(objectNodes[0]?.id ?? "");
    }
  }, [objectNodes, selectedObjectId]);

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
        onClose();
      }}
      onClose={onClose}
    >
      <header className="ek-workbench__binding-dialog-header">
        <h2 id={titleId}>{t("dataBinding.queryDialog.title", { name: query.name })}</h2>
        <button ref={closeRef} type="button" onClick={onClose}>{t("dataBinding.queryDialog.close")}</button>
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
                        onClick={() => setSelectedObjectId(binding.objectNodeId)}
                      >{t("dataBinding.queryDialog.open")}</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <label className="ek-workbench__field">
            <span>{t("dataBinding.queryDialog.object")}</span>
            <select
              aria-label={t("dataBinding.queryDialog.object")}
              value={selectedObjectId}
              onChange={(event) => setSelectedObjectId(event.target.value)}
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
            />
          ) : null}
        </>
      )}
    </dialog>
  );
}
