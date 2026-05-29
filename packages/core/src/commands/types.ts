import type { AssetInput } from "../assets/types";
import type { SceneSnapshot, Transform } from "../snapshot/types";

export type Command =
  | ImportGlbCommand
  | SelectObjectCommand
  | SetTransformCommand;

export interface ImportGlbCommand {
  type: "import-glb";
  asset: AssetInput;
  objectId?: string;
  name?: string;
  parentId?: string | null;
  transform?: Partial<Transform>;
}

export interface SelectObjectCommand {
  type: "select-object";
  objectId: string | null;
}

export interface SetTransformCommand {
  type: "set-transform";
  objectId: string;
  transform: Partial<Transform>;
}

export type UndoableCommand = Command;

export interface CommandResult {
  ok: boolean;
  snapshot: SceneSnapshot;
  error?: string;
}

export interface AppliedCommand {
  command: Command;
  before: SceneSnapshot;
  after: SceneSnapshot;
}
