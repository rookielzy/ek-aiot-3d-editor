import type { MaterialAssignment, MaterialDefinition } from "../materials/types";
import type { LightDefinition } from "../lights/types";
import type { SceneNode, SceneObject } from "../snapshot/types";
import type { SceneDataSources } from "../data-sources/types";

export interface ClipboardSceneObject extends SceneObject {
  originalId: string;
}

export type ClipboardSceneNode = SceneNode & {
  originalId: string;
};

export type ClipboardLightDefinition = LightDefinition & {
  originalId: string;
};

export interface EditorObjectClipboardPayload {
  kind: "ek-aiot-3d-editor-objects";
  version: 1 | 2;
  rootObjectIds: string[];
  objects: Record<string, ClipboardSceneObject>;
  materials: {
    definitions: Record<string, MaterialDefinition>;
    assignments: Record<string, MaterialAssignment>;
  };
  assetIds: string[];
  dataSources?: SceneDataSources;
}

export interface EditorNodeClipboardPayload {
  kind: "ek-aiot-3d-editor-nodes";
  version: 2 | 3;
  rootNodeIds: string[];
  nodes: Record<string, ClipboardSceneNode>;
  objects: Record<string, ClipboardSceneObject>;
  lights: Record<string, ClipboardLightDefinition>;
  materials: {
    definitions: Record<string, MaterialDefinition>;
    assignments: Record<string, MaterialAssignment>;
  };
  assetIds: string[];
  dataSources?: SceneDataSources;
}

export type EditorClipboardPayload = EditorObjectClipboardPayload | EditorNodeClipboardPayload;
