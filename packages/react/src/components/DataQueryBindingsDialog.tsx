import { useEffect, useRef, useState } from "react";
import { buildDeleteDataObjectBindingCommand, type DataBindingProblem } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { DataBindingForm } from "./DataBindingForm";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { WorkbenchSelect } from "./ui/WorkbenchSelect";

/** The action the user asked for before the draft guard interrupted it. */
type PendingAction = { run(): void } | { objectNodeId: string };

/** Everything needed to run a leaving action and to return focus to its trigger. */
interface GuardRequest {
  action: () => void;
  trigger: HTMLElement | null;
}

export interface DataQueryBindingsDialogProps {
  context: ResolvedWorkbenchContext;
  queryId: string;
  /** Leaves the dialog and returns focus to the row that opened it. */
  onClose(): void;
  /** Reports the object the scene selected after a locate left the dialog. */
  onLocated?(node: { nodeId: string; name: string }): void;
}

/**
 * Binds GLB objects to one saved query. The bound-object list, the object picker
 * and the binding form share one draft boundary: leaving the dialog, switching
 * objects, locating another object in the scene and unbinding all resolve the
 * unsaved binding changes of the open form first.
 */
export function DataQueryBindingsDialog({
  context,
  queryId,
  onClose,
  onLocated
}: DataQueryBindingsDialogProps) {
  const query = context.snapshot.dataSources.queries[queryId] ?? null;
  // Only GLB object nodes can carry a binding; the asset name is what the user
  // recognises in the scene, the node name is the fallback.
  const objectNodes = Object.values(context.snapshot.nodes)
    .filter((node) => node.kind === "object")
    .map((node) => ({
      id: node.id,
      name: node.name,
      label: context.snapshot.objects[node.objectId]?.asset.label ?? node.name
    }));
  const objectLabels = new Map(objectNodes.map((node) => [node.id, node.label]));
  const bindings = Object.values(context.snapshot.dataSources.bindings)
    .filter((binding) => binding.queryId === queryId);
  const [selectedObjectId, setSelectedObjectId] = useState(() =>
    bindings.find((binding) => objectNodes.some((node) => node.id === binding.objectNodeId))?.objectNodeId
      ?? objectNodes[0]?.id
      ?? ""
  );
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [problems, setProblems] = useState<DataBindingProblem[]>([]);
  // A pending action is either a plain callback (close, locate, unbind) or the
  // object id of a switch that waits for the discard decision.
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const guardTriggerRef = useRef<HTMLElement | null>(null);
  const objectRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const t = context.i18n.t;

  const selectedBinding = selectedObjectId
    ? context.snapshot.dataSources.bindings[selectedObjectId] ?? null
    : null;
  const objectOptions = objectNodes.map((node) => ({ value: node.id, label: node.label }));

  useEffect(() => {
    if (selectedObjectId && !objectNodes.some((node) => node.id === selectedObjectId)) {
      setDirty(false);
      setSelectedObjectId(objectNodes[0]?.id ?? "");
    }
  }, [objectNodes, selectedObjectId]);

  // The discard layer is the topmost layer; it resolves one action at a time.
  function requestAction(action: GuardRequest): void {
    if (discardOpen) {
      return;
    }
    if (dirty) {
      setPendingAction({ run: action.action });
      guardTriggerRef.current = action.trigger;
      setDiscardOpen(true);
      return;
    }
    action.action();
  }

  /** Leaves the dialog; the panel focuses the row that opened it. */
  function close(): void {
    requestAction({ action: () => onClose(), trigger: closeRef.current });
  }

  function keepEditing(): void {
    setPendingAction(null);
    setDiscardOpen(false);
    // Keep editing: the draft stays untouched; the dialog shell restores focus.
  }

  function discardChanges(): void {
    const action = pendingAction;
    setPendingAction(null);
    setDirty(false);
    setDiscardOpen(false);
    if (!action) return;
    if ("objectNodeId" in action) {
      setSelectedObjectId(action.objectNodeId);
      return;
    }
    action.run();
  }

  /**
   * Switches the bound object, guarded by the draft. The guard runs after the
   * triggering control (a list row button or the picker) lost focus, so the
   * triggering control is passed in explicitly.
   */
  function selectObject(objectNodeId: string, trigger?: HTMLElement | null): void {
    if (objectNodeId === selectedObjectId) {
      return;
    }
    requestAction({
      action: () => setSelectedObjectId(objectNodeId),
      trigger: trigger ?? objectRef.current
    });
  }

  function selectInScene(objectNodeId: string, trigger: HTMLElement | null): void {
    requestAction({
      action: () => {
        context.dispatch({
          type: "select-nodes",
          mode: "replace",
          nodeIds: [objectNodeId],
          primaryNodeId: objectNodeId
        });
        onLocated?.({ nodeId: objectNodeId, name: objectLabels.get(objectNodeId) ?? objectNodeId });
        onClose();
      },
      trigger
    });
  }

  function unbind(objectNodeId: string, name: string, trigger: HTMLElement | null): void {
    requestAction({
      trigger,
      action: () => {
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
        setStatus(t("dataBinding.queryDialog.unbound", { name }));
        if (objectNodeId === selectedObjectId) {
          setDirty(false);
        }
      }
    });
  }

  if (!query) {
    return null;
  }

  return (
    <Dialog
      className="ek-workbench__binding-dialog-dialog"
      label={t("dataBinding.queryDialog.title", { name: query.name })}
      title={t("dataBinding.queryDialog.title", { name: query.name })}
      headerActions={(
        <Button ref={closeRef} data-dialog-dismiss onClick={close}>
          {t("dataBinding.queryDialog.close")}
        </Button>
      )}
      initialFocus={objectRef}
      fallbackFocus={guardTriggerRef}
      onDismiss={close}
      discard={discardOpen ? {
        title: t("dataBinding.queryDialog.discard.title"),
        description: t("dataBinding.queryDialog.discard.description"),
        keepLabel: t("dataSources.queryEditor.discard.keep"),
        discardLabel: t("dataSources.queryEditor.discard.confirm"),
        onKeepEditing: keepEditing,
        onDiscard: discardChanges
      } : undefined}
    >
      {objectNodes.length === 0 ? (
        <p className="ek-workbench__empty">{t("dataBinding.queryDialog.noObjects")}</p>
      ) : (
        <>
          <div className="ek-workbench__binding-dialog-list" role="group" aria-label={t("dataBinding.queryDialog.list")}>
            <strong>{t("dataBinding.queryDialog.list")}</strong>
            {bindings.length === 0 ? (
              <p className="ek-workbench__binding-hint">{t("dataBinding.queryDialog.empty")}</p>
            ) : (
              <ul>
                {bindings.map((binding) => {
                  const name = objectLabels.get(binding.objectNodeId) ?? binding.objectNodeId;
                  const current = binding.objectNodeId === selectedObjectId;
                  return (
                    <li key={binding.objectNodeId} data-current={current ? "true" : undefined}>
                      <div className="ek-workbench__binding-dialog-row-name">
                        <span>{name}</span>
                        <small>{binding.deviceId}</small>
                      </div>
                      <div className="ek-workbench__binding-dialog-row-actions">
                        <Button
                          className="ek-ui-button--quiet"
                          data-dialog-dismiss
                          aria-pressed={current}
                          aria-label={t("dataBinding.queryDialog.edit", { name })}
                          onClick={(event) => selectObject(binding.objectNodeId, event.currentTarget)}
                        >{t("dataBinding.queryDialog.editAction")}</Button>
                        <Button
                          className="ek-ui-button--quiet"
                          data-dialog-dismiss
                          aria-label={t("dataBinding.queryDialog.locateAria", { name })}
                          onClick={(event) => selectInScene(binding.objectNodeId, event.currentTarget)}
                        >{t("dataBinding.queryDialog.locate")}</Button>
                        <Button
                          className="ek-ui-button--quiet"
                          data-dialog-dismiss
                          aria-label={t("dataBinding.queryDialog.unbindAria", { name })}
                          onClick={(event) => unbind(binding.objectNodeId, name, event.currentTarget)}
                        >{t("dataBinding.queryDialog.unbind")}</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

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

          <section
            className="ek-workbench__form-section ek-workbench__binding-dialog-target"
            aria-label={t("dataBinding.queryDialog.target")}
          >
            <label className="ek-workbench__field">
              <span>{t("dataBinding.queryDialog.object")}</span>
              <WorkbenchSelect
                ref={objectRef}
                aria-label={t("dataBinding.queryDialog.object")}
                value={selectedObjectId}
                options={objectOptions}
                onChange={(next) => selectObject(next)}
              />
            </label>
            <div className="ek-workbench__binding-dialog-target-name">
              <small data-tone="target">
                {selectedBinding
                  ? t("dataBinding.queryDialog.deviceNamed", { deviceId: selectedBinding.deviceId })
                  : t("dataBinding.queryDialog.selectObject")}
              </small>
              {selectedBinding ? (
                <small data-tone="stored">
                  {t("dataBinding.queryDialog.stored")}
                  {" · "}
                  {selectedBinding.enabled
                    ? t("dataBinding.queryDialog.enabled")
                    : t("dataBinding.queryDialog.disabled")}
                </small>
              ) : null}
              {dirty ? <small data-tone="draft">{t("dataBinding.queryDialog.draft")}</small> : null}
            </div>
          </section>

          {selectedObjectId ? (
            <DataBindingForm
              key={`${queryId}:${selectedObjectId}`}
              context={context}
              objectNodeId={selectedObjectId}
              fixedQueryId={queryId}
              onDirtyChange={setDirty}
              discardOpen={discardOpen && pendingAction !== null && !("run" in pendingAction)}
              discardStatusKey="dataBinding.queryDialog.draftDiscarded"
            />
          ) : null}
        </>
      )}
    </Dialog>
  );
}
