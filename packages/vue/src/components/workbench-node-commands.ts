import { buildWorkbenchNodeCapability, collectNodeSubtreeIds, createClipboardPayload, createNodeClipboardPayload } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";

const nodeActions = [
  { key: "copy", capability: "canCopy", binding: "+C" },
  { key: "paste", capability: "canPaste", binding: "+V", scene: true },
  { key: "duplicate", capability: "canDuplicate", binding: "+D" },
  { key: "delete", capability: "canDelete", binding: "Delete Backspace" },
  { key: "group", capability: "canGroup", binding: "+G" },
  { key: "ungroup", capability: "canUngroup", binding: "+Shift+G" },
  { key: "select-all", capability: "canSelectAll", binding: "+A", scene: true },
  { key: "clear-selection", capability: "canClearSelection", binding: "Escape", scene: true }
] as const;

export function workbenchNodeCommands(context: ResolvedWorkbenchContext, options: { primary: string } | { nodeId: string }) {
  const nodeId = "nodeId" in options ? options.nodeId : undefined;
  const target = nodeId ? buildWorkbenchNodeCapability(context.snapshot, nodeId) : undefined;
  const toolbar = context.model.toolbar;
  return nodeActions.flatMap((action) => {
    const scoped = !("scene" in action);
    if (target && !scoped) return [];
    const label = action.key === "select-all" ? "selectAll" : action.key === "clear-selection" ? "clear" : action.key;
    return [{
      key: action.key,
      icon: action.key,
      label: `reactWorkbench.toolbar.node.${label}.label` as const,
      title: `reactWorkbench.toolbar.node.${label}.title` as const,
      shortcut: "primary" in options
        ? action.binding.startsWith("+") ? `${options.primary}${action.binding}` : action.binding
        : undefined,
      disabled: !(target && scoped ? target[action.capability] : toolbar[action.capability]),
      reason: target && scoped ? target.reasons[action.key] : toolbar.disabledReasons?.[action.capability],
      onClick: () => {
        if (nodeId && scoped) {
          runNodeAction(context, nodeId, action.key);
          return;
        }
        context.runAction(action.key);
      }
    }];
  });
}

function runNodeAction(context: ResolvedWorkbenchContext, nodeId: string, action: "copy" | "duplicate" | "delete" | "group" | "ungroup"): void {
  const snapshot = context.editor.getSnapshot();
  const node = snapshot.nodes[nodeId];
  if (!node) return;
  // An imported target belongs to its owning object, including its expanded targets and overrides.
  const root = node.kind === "imported"
    ? Object.values(snapshot.nodes).find((candidate) => candidate.kind === "object" && candidate.objectId === node.ownerObjectId)
    : node;
  if (!root) return;

  if (action === "copy" || action === "duplicate") {
    const payload = root.kind === "object" && collectNodeSubtreeIds(snapshot, root.id).every((id) => snapshot.nodes[id].kind === "object")
      ? createClipboardPayload(snapshot, [root.objectId])
      : createNodeClipboardPayload(snapshot, [root.id]);
    if (action === "copy") return context.setClipboard(payload);
    context.dispatch(payload.kind === "ek-aiot-3d-editor-nodes"
      ? { type: "paste-objects", payload }
      : { type: "duplicate-objects", objectIds: payload.rootObjectIds });
    return;
  }

  if (action === "ungroup" && root.kind === "group") {
    context.dispatch({ type: "ungroup-nodes", nodeId: root.id });
    return;
  }
  if (root.kind !== "object") return;
  if (action === "delete") context.dispatch({ type: "delete-objects", objectIds: [root.objectId] });
  if (action === "ungroup") context.dispatch({ type: "ungroup-objects", objectId: root.objectId });
}
