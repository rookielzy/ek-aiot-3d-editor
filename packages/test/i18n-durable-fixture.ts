import type { EditorWithGlbImport } from "@ek-aiot/3d-editor-core";
import { decodeArchiveJson, defaultArchiveAdapter } from "../core/src/project/archive-adapter";

export function seedI18nDurableEditor(editor: Pick<EditorWithGlbImport, "dispatch">): void {
  editor.dispatch({
    type: "import-glb",
    objectId: "object-a",
    name: "Pump A",
    asset: { id: "asset-a", label: "motor-control-panel.glb", source: new Uint8Array([1, 2, 3]) }
  });
  editor.dispatch({
    type: "register-asset",
    asset: { id: "texture-a", kind: "texture", label: "Body", source: new Uint8Array([4, 5, 6]) }
  });
  editor.dispatch({
    type: "register-asset",
    asset: { id: "hdr-a", kind: "hdr", label: "Studio HDR", source: new Uint8Array([7, 8, 9]) }
  });
  editor.dispatch({
    type: "set-material",
    target: { kind: "object", objectId: "object-a" },
    materialId: "material-a",
    materialName: "Body",
    material: { color: "#336699", textures: { map: { assetId: "texture-a" } } }
  });
  editor.dispatch({
    type: "set-environment",
    environment: {
      lighting: { source: { kind: "hdr", assetId: "hdr-a" } },
      background: { source: { kind: "solid", color: "#eef3f8" } }
    }
  });
  editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "point", name: "Key light" } });
  editor.dispatch({
    type: "create-camera-view",
    view: {
      id: "view-a",
      name: "Hero view",
      projection: { kind: "perspective", fov: 45 },
      position: [4, 3, 2],
      target: [0, 1, 0],
      near: 0.1,
      far: 250
    }
  });
  editor.dispatch({ type: "set-default-camera-view", viewId: "view-a" });
}

export function decodeProjectPackageText(bytes: Uint8Array): string {
  const archiveEntries = defaultArchiveAdapter.read(bytes);
  return archiveEntries
    .filter((entry) => entry.path === "manifest.json" || entry.path === "scene.json")
    .map((entry) => JSON.stringify(decodeArchiveJson(entry.bytes)))
    .join("\n");
}

export async function resolveProjectPackageBytes(bytes: Uint8Array | Promise<Uint8Array> | undefined): Promise<Uint8Array> {
  if (!bytes) {
    throw new Error("Expected project export to include package bytes.");
  }
  return bytes;
}
