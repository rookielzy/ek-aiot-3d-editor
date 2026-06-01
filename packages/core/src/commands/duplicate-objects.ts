import { createClipboardPayload } from "../clipboard/create-clipboard";
import type { SceneSnapshot } from "../snapshot/types";
import { applyPasteObjects } from "./paste-objects";
import type { DuplicateObjectsCommand } from "./types";

export function applyDuplicateObjects(snapshot: SceneSnapshot, command: DuplicateObjectsCommand): SceneSnapshot {
  const payload = createClipboardPayload(snapshot, command.objectIds);
  return applyPasteObjects(snapshot, {
    type: "paste-objects",
    payload,
    objectIdMap: command.objectIdMap
  });
}
