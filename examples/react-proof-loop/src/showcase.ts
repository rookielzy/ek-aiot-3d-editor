import {
  createEditor,
  createEmptySnapshot,
  type AssetInput,
  type EditorRuntimeOptions
} from "@ek-aiot/3d-editor-core";
import modelUrl from "./showcase/ToyCar.glb?url";
import environmentUrl from "./showcase/studio.hdr?url";

/** Demo-owned assets and authored state; the packages never call this bootstrap. */
export async function createShowcaseEditor(loader: EditorRuntimeOptions["loader"], signal: AbortSignal) {
  const empty = createEmptySnapshot("toy-car-studio");
  const author = createEditor({ snapshot: { ...empty, scene: { ...empty.scene, name: "Toy Car Studio" } } });
  const model = {
    id: "showcase-car", kind: "glb", label: "ToyCar.glb",
    metadata: { license: "CC0-1.0", authors: "Guido Odendahl; Eric Chadwick", source: "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ToyCar" }
  } satisfies AssetInput;
  const environment = {
    id: "showcase-studio", kind: "hdr", label: "studio.hdr",
    metadata: { license: "CC0-1.0", source: "ek-aiot-3d-editor / generate-studio.py" }
  } satisfies AssetInput;
  try {
    // Missing downloads stay as real unresolved references, repairable by the workbench.
    const payloads = await Promise.allSettled([modelUrl, environmentUrl].map(async (url) => {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Asset download failed: ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    }));
    signal.throwIfAborted();
    const modelBytes = payloads[0].status === "fulfilled" ? payloads[0].value : undefined;
    const environmentBytes = payloads[1].status === "fulfilled" ? payloads[1].value : undefined;
    const object = { objectId: "showcase-model", name: "Toy Car", transform: { scale: [70, 70, 70] as [number, number, number], position: [0, 0, 0] as [number, number, number] } };
    const imported = modelBytes && await author.importGlbAsset({ ...object, asset: { ...model, source: modelBytes }, loader, expandImportedTargets: true });
    if (!imported || !imported.ok) author.dispatch({ type: "import-glb", ...object, asset: model });
    author.dispatch({ type: "register-asset", asset: environment });
    author.dispatch({ type: "set-environment", environment: {
      lighting: { source: { kind: "hdr", assetId: environment.id }, intensity: 1, rotation: { x: 0, y: 0, z: 0 } },
      background: { source: { kind: "solid", color: "#f1f3f5" } }
    } });
    author.dispatch({ type: "add-light", light: { id: "showcase-key", kind: "directional", name: "Key light", intensity: 2, transform: { position: [3, 5, 4], rotation: [0, 0, 0], scale: [1, 1, 1] }, target: [0, 1, 0] } });
    author.dispatch({ type: "add-light", light: { id: "showcase-fill", kind: "hemisphere", name: "Fill light", intensity: 0.5, color: "#dce7ff", groundColor: "#777b83" } });
    author.dispatch({ type: "create-camera-view", view: { id: "showcase-view", name: "Studio view", projection: { kind: "perspective", fov: 40 }, position: [-3.4, 2.1, 5.5], target: [0, 0.45, 0], near: 0.01, far: 200 } });
    author.dispatch({ type: "set-default-camera-view", viewId: "showcase-view" });
    author.dispatch({ type: "select-object", objectId: null });
    signal.throwIfAborted();
    // Start a clean editing history, retaining payloads outside the durable snapshot.
    const editor = createEditor({ snapshot: author.serialize() });
    if (imported && imported.ok && modelBytes) editor.registerAsset({ ...editor.getSnapshot().assets[model.id], source: modelBytes });
    if (environmentBytes) editor.registerAsset({ ...environment, source: environmentBytes });
    editor.viewportHelpers?.setVisibility({ grid: true, hover: true, snapFeedback: true });
    return editor;
  } finally {
    author.dispose();
  }
}

export const showcaseInteractions: EditorRuntimeOptions["interactions"] = {
  camera: true, pointerSelection: true, marqueeSelection: true, resize: true,
  selectionVisuals: true, transform: true,
  viewportHelpers: { gridSize: 20, gridDivisions: 40, gridColor: "#dde1e7", gridCenterLineColor: "#c5ccd8" }
};
