import {
  collectNodeSubtreeIds,
  createClipboardPayload,
  createNodeClipboardPayload,
  getTopLevelNodeIds
} from "@ek-aiot/3d-editor-core";
import type {
  Command,
  EditorClipboardPayload,
  MessageDescriptor,
  SceneNode,
  SceneSnapshot,
  WorkbenchNodeCapability
} from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import type { ViewportToolCommand, ViewportToolGroup } from "./viewport-tool-model";

/** Editor actions behind the node commands. */
export type NodeCommandAction =
  | "copy"
  | "paste"
  | "duplicate"
  | "delete"
  | "group"
  | "ungroup"
  | "select-all"
  | "clear-selection";

/** The node actions that can answer for one node instead of the scene selection. */
export type NodeTargetCommand = "copy" | "duplicate" | "delete" | "group" | "ungroup";

/** Icon of each node command, which is also how the command identifies itself. */
const NODE_COMMAND_ICONS: Record<NodeCommandAction, ViewportToolCommand["icon"]> = {
  copy: "copy",
  paste: "paste",
  duplicate: "duplicate",
  delete: "delete",
  group: "group",
  ungroup: "ungroup",
  "select-all": "select-all",
  "clear-selection": "clear-selection"
};

export interface NodeToolOptions {
  includeShortcuts: boolean;
  /**
   * Scene actions such as pasting, selecting all, and clearing the selection describe the whole
   * scene rather than one node, so a caller that aims the menu at a node omits them.
   */
  includeSceneCommands?: boolean;
  /**
   * Node the commands are issued for, such as the row whose menu is open. Commands built this way
   * name their target in the durable command instead of reading the current scene selection, so the
   * menu that shows them can also show a row that is not selected yet.
   */
  nodeId?: string;
  /**
   * Capability of the target node itself. A row menu must answer for its row, so it reads that row's
   * rules rather than the toolbar, which answers for whatever the scene selection happens to be.
   */
  target?: WorkbenchNodeCapability;
}

/**
 * The durable command behind a node action, aimed at one node when a target is given.
 *
 * Without a target the command acts on the scene selection, exactly as the shortcut does. With a
 * target the command names the node, so a caller such as a hierarchy row menu can offer the action
 * for a row that is not selected and the editor never has to select it first.
 */
export function nodeCommand(action: NodeCommandAction, snapshot: SceneSnapshot, nodeId?: string): Command | null {
  const node = snapshot.nodes[nodeId ?? snapshot.selection.nodeId ?? ""];
  switch (action) {
    case "duplicate":
      return withObjectIds(node, (objectIds) => ({ type: "duplicate-objects", objectIds }));
    case "delete":
      return withObjectIds(node, (objectIds) => ({ type: "delete-objects", objectIds }));
    case "group":
      return withObjectIds(node, (objectIds) => ({ type: "group-objects", objectIds, primaryObjectId: objectIds[0] }));
    case "ungroup":
      if (node?.kind === "group") return { type: "ungroup-nodes", nodeId: node.id };
      return withObjectIds(node, (objectIds) => ({ type: "ungroup-objects", objectId: objectIds[0] }));
    case "select-all":
      return { type: "select-nodes", mode: "all" };
    case "clear-selection":
      return { type: "select-nodes", mode: "clear" };
    default:
      return null;
  }
}

/**
 * The clipboard payload a node copies on its own.
 *
 * Clipboard contents are runtime state, not part of the durable snapshot, so copying is the one node
 * action that hands a value back to its caller instead of returning a command.
 */
export function nodeClipboardPayload(snapshot: SceneSnapshot, nodeId: string): EditorClipboardPayload | null {
  const node = snapshot.nodes[nodeId];
  if (!node) return null;
  if (node.kind === "object" || node.kind === "imported") {
    return createClipboardPayload(snapshot, targetObjectIds(node));
  }
  // A light or a camera is a node of its own, so it copies through its own node subtree.
  return createNodeClipboardPayload(snapshot, getTopLevelNodeIds(snapshot, collectNodeSubtreeIds(snapshot, nodeId)));
}

/**
 * The node group shared by the viewport strip's menu and a hierarchy row's menu.
 *
 * Shortcuts are rendered by the binding's owner, because the strip and the tree are portaled and
 * positioned differently; availability reasons never are.
 */
export function nodeToolGroup(
  context: ResolvedWorkbenchContext,
  options: NodeToolOptions
): ViewportToolGroup {
  const { toolbar } = context.model;
  const disabled = toolbar.disabledReasons;
  const describe = (reason: MessageDescriptor | undefined) => (reason ? context.i18n.t(reason) : undefined);
  const sceneCommands = () => options.includeSceneCommands !== false;
  const shortcut = (binding: string) => (options.includeShortcuts ? platformShortcut(binding) : undefined);
  const run = (action: NodeCommandAction) => () => {
    if (!options.nodeId) {
      context.runAction(action);
      return;
    }
    const snapshot = context.editor.getSnapshot();
    if (action === "copy") {
      const payload = nodeClipboardPayload(snapshot, options.nodeId);
      if (payload) context.editor.clipboard.set(payload);
      return;
    }
    const command = nodeCommand(action, snapshot, options.nodeId);
    if (command) context.dispatch(command);
  };
  /** Availability of an action for the target node, or for the scene selection when there is none. */
  const enabled = (action: NodeTargetCommand) => {
    if (options.target) return Boolean(options.target[`can${capitalized(action)}`]);
    return Boolean(toolbar[`can${capitalized(action)}`]);
  };
  const unavailableReason = (action: NodeTargetCommand) =>
    options.target ? describe(options.target.reasons[action]) : describe(disabled?.[`can${capitalized(action)}`]);
  const command = (action: NodeTargetCommand, shortcutBinding?: string): ViewportToolCommand => ({
    key: action,
    icon: NODE_COMMAND_ICONS[action],
    label: `reactWorkbench.toolbar.node.${action}.label`,
    title: `reactWorkbench.toolbar.node.${action}.title`,
    shortcut: shortcutBinding === undefined ? undefined : shortcut(shortcutBinding),
    disabledReason: unavailableReason(action),
    disabled: !enabled(action),
    onClick: run(action)
  });

  const commands: ViewportToolCommand[] = [
    command("copy", "Ctrl+C"),
    ...(sceneCommands() ? [{
      key: "paste",
      icon: NODE_COMMAND_ICONS.paste,
      label: "reactWorkbench.toolbar.node.paste.label",
      title: "reactWorkbench.toolbar.node.paste.title",
      shortcut: shortcut("Ctrl+V"),
      disabledReason: describe(disabled?.canPaste),
      disabled: !toolbar.canPaste,
      onClick: run("paste")
    }] as ViewportToolCommand[] : []),
    command("duplicate", "Ctrl+D"),
    { ...command("delete"), shortcut: options.includeShortcuts ? "Delete Backspace" : undefined },
    command("group", "Ctrl+G"),
    command("ungroup", "Ctrl+Shift+G")
  ];

  if (sceneCommands()) {
    commands.push({
      key: "select-all",
      icon: NODE_COMMAND_ICONS["select-all"],
      label: "reactWorkbench.toolbar.node.selectAll.label",
      title: "reactWorkbench.toolbar.node.selectAll.title",
      shortcut: shortcut("Ctrl+A"),
      disabledReason: describe(disabled?.canSelectAll),
      disabled: !toolbar.canSelectAll,
      onClick: run("select-all")
    });
  }

  if (sceneCommands()) {
    commands.push({
      key: "clear-selection",
      icon: NODE_COMMAND_ICONS["clear-selection"],
      label: "reactWorkbench.toolbar.node.clear.label",
      title: "reactWorkbench.toolbar.node.clear.title",
      disabledReason: describe(disabled?.canClearSelection),
      disabled: !toolbar.canClearSelection,
      onClick: run("clear-selection")
    });
  }

  return {
    kind: "action",
    key: "node",
    label: "reactWorkbench.toolbar.node.label",
    commands
  };
}

/** Platform-ready binding text for a `Ctrl+<letter>` shortcut, matching the viewport strip. */
export function platformShortcut(binding: string, platform: string = globalThis.navigator?.platform ?? ""): string {
  if (!binding.startsWith("Ctrl+")) return binding;
  const rest = binding.slice("Ctrl+".length);
  const primary = /mac|iphone|ipad/i.test(platform) ? "Meta" : "Control";
  if (rest === "Z") return `${primary}+Z ${primary === "Meta" ? "Control" : "Meta"}+Z`;
  if (rest === "Y") return `${primary}+Y`;
  return `${primary}+${rest}`;
}

function capitalized(action: NodeTargetCommand): Capitalize<NodeTargetCommand> {
  return (action.charAt(0).toUpperCase() + action.slice(1)) as Capitalize<NodeTargetCommand>;
}

/**
 * The objects a node owns, which is where a node's durable payload lives.
 *
 * An object node owns its own object, and an imported target is part of its owner object's imported
 * scene. Anything else (a light, a camera, a group) is not an object, so object commands cannot
 * name anything for it.
 */
function targetObjectIds(node: SceneNode): string[] {
  if (node.kind === "object") return [node.objectId];
  if (node.kind === "imported") return [node.ownerObjectId];
  return [];
}

function withObjectIds(node: SceneNode | undefined, build: (objectIds: string[]) => Command): Command | null {
  const objectIds = node ? targetObjectIds(node) : [];
  return objectIds.length > 0 ? build(objectIds) : null;
}
