import type { AssetRegistry } from "../assets/registry";
import type { EditorStore } from "../editor/store";
import type { CommandHistory } from "../history/history";
import { immutableClone } from "../snapshot/immutability";
import type { SceneSnapshot } from "../snapshot/types";
import { assertValidSceneSnapshot } from "../snapshot/validation";
import { applyAddLight } from "./add-light";
import { applyCreateCameraView, applyDeleteCameraView, applySetDefaultCameraView, applyUpdateCameraView } from "./camera-commands";
import { applyCreateGroup } from "./create-group";
import { applyCreateImportedGlbTargets } from "./create-imported-glb-targets";
import { applyCreateDataConnection, applyDeleteDataConnection, applyDuplicateDataConnection, applyUpdateDataConnection } from "./data-connection-commands";
import { applyDeleteNodes } from "./delete-nodes";
import { applyDeleteObjects } from "./delete-objects";
import { applyDuplicateObjects } from "./duplicate-objects";
import { applyGroupNodes } from "./group-nodes";
import { applyGroupObjects } from "./group-objects";
import { applyImportGlb } from "./import-glb";
import { applyPasteObjects } from "./paste-objects";
import { applyRegisterAsset } from "./register-asset";
import { applyReimportGlb } from "./reimport-glb";
import { applyReparentNode } from "./reparent-node";
import { applyRemoveLight } from "./remove-light";
import { applyReparentObject } from "./reparent-object";
import { applySelectNode, applySelectNodes } from "./select-node";
import { applySelectObject, applySelectObjects } from "./select-object";
import { applySetEnvironment } from "./set-environment";
import { applySetMaterial } from "./set-material";
import { applySetNodeTransform } from "./set-node-transform";
import { applySetTransform } from "./set-transform";
import { applyUngroupNodes } from "./ungroup-nodes";
import { applyUngroupObjects } from "./ungroup-objects";
import { applyUpdateLight } from "./update-light";
import type { Command, CommandResult, SingleCommand } from "./types";

export class CommandDispatcher {
  constructor(
    private readonly store: EditorStore,
    private readonly history: CommandHistory,
    private readonly assets: AssetRegistry
  ) {}

  dispatch(command: Command): CommandResult {
    const before = this.store.getSnapshot();
    const beforeAssets = new Map(this.assets.entries());

    try {
      const applied = this.apply(before, command);
      if (applied === before) {
        return { ok: true, snapshot: before };
      }

      const after = immutableClone(applied);
      assertValidSceneSnapshot(after);

      this.store.replaceSnapshot(after);
      this.history.record({ command, before, after: this.store.getSnapshot() });

      return { ok: true, snapshot: this.store.getSnapshot() };
    } catch (error) {
      this.assets.replaceAll(beforeAssets);
      return {
        ok: false,
        snapshot: before,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  undo(): CommandResult {
    const before = this.store.getSnapshot();
    const previous = this.history.undo(before);

    if (!previous) {
      return { ok: false, snapshot: before, error: "Nothing to undo." };
    }

    this.store.replaceSnapshot(previous);
    return { ok: true, snapshot: this.store.getSnapshot() };
  }

  redo(): CommandResult {
    const before = this.store.getSnapshot();
    const next = this.history.redo(before);

    if (!next) {
      return { ok: false, snapshot: before, error: "Nothing to redo." };
    }

    this.store.replaceSnapshot(next);
    return { ok: true, snapshot: this.store.getSnapshot() };
  }

  private apply(snapshot: SceneSnapshot, command: Command): SceneSnapshot {
    if (command.type === "batch") {
      return this.applyBatch(snapshot, command.commands);
    }

    return this.applySingle(snapshot, command);
  }

  private applyBatch(snapshot: SceneSnapshot, commands: Command[]): SceneSnapshot {
    let next = snapshot;
    for (const command of commands) {
      if (command.type === "batch") {
        throw new Error("Nested batch commands are not supported.");
      }
      next = this.applySingle(next, command);
    }
    return next;
  }

  private applySingle(snapshot: SceneSnapshot, command: SingleCommand): SceneSnapshot {
    switch (command.type) {
      case "import-glb":
        return applyImportGlb(snapshot, command, this.assets);
      case "reimport-glb":
        return applyReimportGlb(snapshot, command);
      case "register-asset":
        return applyRegisterAsset(snapshot, command, this.assets);
      case "create-imported-glb-targets":
        return applyCreateImportedGlbTargets(snapshot, command);
      case "select-node":
        return applySelectNode(snapshot, command);
      case "select-nodes":
        return applySelectNodes(snapshot, command);
      case "create-group":
        return applyCreateGroup(snapshot, command);
      case "delete-nodes":
        return applyDeleteNodes(snapshot, command);
      case "group-nodes":
        return applyGroupNodes(snapshot, command);
      case "ungroup-nodes":
        return applyUngroupNodes(snapshot, command);
      case "reparent-node":
        return applyReparentNode(snapshot, command);
      case "set-node-transform":
        return applySetNodeTransform(snapshot, command);
      case "select-object":
        return applySelectObject(snapshot, command);
      case "select-objects":
        return applySelectObjects(snapshot, command);
      case "delete-objects":
        return applyDeleteObjects(snapshot, command);
      case "paste-objects":
        return applyPasteObjects(snapshot, command);
      case "duplicate-objects":
        return applyDuplicateObjects(snapshot, command);
      case "group-objects":
        return applyGroupObjects(snapshot, command);
      case "ungroup-objects":
        return applyUngroupObjects(snapshot, command);
      case "reparent-object":
        return applyReparentObject(snapshot, command);
      case "set-transform":
        return applySetTransform(snapshot, command);
      case "set-material":
        return applySetMaterial(snapshot, command);
      case "set-environment":
        return applySetEnvironment(snapshot, command);
      case "create-camera-view":
        return applyCreateCameraView(snapshot, command);
      case "update-camera-view":
        return applyUpdateCameraView(snapshot, command);
      case "delete-camera-view":
        return applyDeleteCameraView(snapshot, command);
      case "set-default-camera-view":
        return applySetDefaultCameraView(snapshot, command);
      case "add-light":
        return applyAddLight(snapshot, command);
      case "update-light":
        return applyUpdateLight(snapshot, command);
      case "remove-light":
        return applyRemoveLight(snapshot, command);
      case "create-data-connection":
        return applyCreateDataConnection(snapshot, command);
      case "update-data-connection":
        return applyUpdateDataConnection(snapshot, command);
      case "duplicate-data-connection":
        return applyDuplicateDataConnection(snapshot, command);
      case "delete-data-connection":
        return applyDeleteDataConnection(snapshot, command);
      default:
        return assertNever(command);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported command: ${JSON.stringify(value)}`);
}
