import type { MaterialAssignment, MaterialDefinition } from "../materials/types";
import type { SceneObject } from "../snapshot/types";

export interface ClipboardSceneObject extends SceneObject {
  originalId: string;
}

export interface EditorClipboardPayload {
  kind: "ek-aiot-3d-editor-objects";
  version: 1;
  rootObjectIds: string[];
  objects: Record<string, ClipboardSceneObject>;
  materials: {
    definitions: Record<string, MaterialDefinition>;
    assignments: Record<string, MaterialAssignment>;
  };
  assetIds: string[];
}
