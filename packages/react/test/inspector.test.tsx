import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  attachGlbImportManifestMetadata,
  createEditor,
  createGlbImportManifest,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { InspectorPanel } from "../src/components/InspectorPanel";

describe("React InspectorPanel", () => {
  it("renders disabled node transform sections and available scene sections with no selection", () => {
    const editor = createEditor();

    render(<InspectorPanel editor={editor} />);

    expect(screen.getByText("Select a transformable node to edit transform.")).toBeTruthy();
    expect(screen.getByText("Environment")).toBeTruthy();
    expect(screen.getByText("Lights")).toBeTruthy();
  });

  it("commits transform edits through one core command", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const dispatchSpy = vi.spyOn(editor, "dispatch");

    render(<InspectorPanel editor={editor} />);
    const input = screen.getByLabelText("Position X") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.blur(input);

    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "set-node-transform", nodeId: "object-a", transform: { position: [4, 0, 0] } });
    expect(editor.getSnapshot().objects["object-a"].transform.position).toEqual([4, 0, 0]);
  });

  it("refreshes uncontrolled transform drafts when core history changes snapshot values", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    render(<InspectorPanel editor={editor} />);
    const input = screen.getByLabelText("Position X") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.blur(input);
    expect((screen.getByLabelText("Position X") as HTMLInputElement).value).toBe("4");

    act(() => {
      editor.undo();
    });
    expect((screen.getByLabelText("Position X") as HTMLInputElement).value).toBe("0");
  });

  it("drops uncommitted drafts when selection changes to another object with the same value", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    render(<InspectorPanel editor={editor} />);
    const input = screen.getByLabelText("Position X") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9" } });

    act(() => {
      editor.dispatch({ type: "select-object", objectId: "object-b" });
    });

    const nextInput = screen.getByLabelText("Position X") as HTMLInputElement;
    expect(nextInput.value).toBe("0");
    fireEvent.blur(nextInput);
    expect(editor.getSnapshot().objects["object-b"].transform.position).toEqual([0, 0, 0]);
  });

  it("commits material opacity and side without storing runtime objects", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    render(<InspectorPanel editor={editor} />);
    fireEvent.change(screen.getByLabelText("Opacity"), { target: { value: "0.5" } });
    fireEvent.blur(screen.getByLabelText("Opacity"));
    fireEvent.change(screen.getByLabelText("Side"), { target: { value: "double" } });

    const override = editor.getSnapshot().materials.definitions["material:object:object-a"].override;
    expect(override.opacity).toBe(0.5);
    expect(override.side).toBe("double");
    expect(JSON.stringify(editor.getSnapshot())).not.toContain("Texture");
  });

  it("renders material slot targets and dispatches slot-aware material commands", () => {
    const editor = createSlotEditor();
    const slotId = getSlotIds(editor)[0]!;
    const dispatchSpy = vi.spyOn(editor, "dispatch");

    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByLabelText(/Body/));
    fireEvent.change(screen.getByLabelText("Base color"), { target: { value: "#336699" } });

    expect(dispatchSpy).toHaveBeenLastCalledWith({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId },
      material: { color: "#336699" }
    });
  });

  it("keeps broad material target behavior when the object override remains active", () => {
    const editor = createSlotEditor();
    const dispatchSpy = vi.spyOn(editor, "dispatch");

    render(<InspectorPanel editor={editor} />);
    fireEvent.change(screen.getByLabelText("Roughness"), { target: { value: "0.42" } });
    fireEvent.blur(screen.getByLabelText("Roughness"));

    expect(dispatchSpy).toHaveBeenLastCalledWith({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { roughness: 0.42 }
    });
  });

  it("resets material target to the selected imported node slot context", () => {
    const editor = createSlotEditor();
    const importedNodeId = getImportedNodeIds(editor)[0]!;
    const slotId = getSlotIds(editor)[0]!;
    const dispatchSpy = vi.spyOn(editor, "dispatch");

    render(<InspectorPanel editor={editor} />);
    fireEvent.change(screen.getByLabelText("Roughness"), { target: { value: "0.42" } });
    fireEvent.blur(screen.getByLabelText("Roughness"));
    act(() => {
      editor.dispatch({ type: "select-node", nodeId: importedNodeId });
    });
    fireEvent.change(screen.getByLabelText("Base color"), { target: { value: "#336699" } });

    expect(dispatchSpy).toHaveBeenLastCalledWith({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId },
      material: { color: "#336699" }
    });
  });

  it("resets material target to broad object when selection returns to the owner object", () => {
    const editor = createSlotEditor();
    const slotId = getSlotIds(editor)[0]!;
    const dispatchSpy = vi.spyOn(editor, "dispatch");

    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByLabelText(/Body/));
    fireEvent.change(screen.getByLabelText("Base color"), { target: { value: "#336699" } });
    expect(dispatchSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      target: { kind: "material-slot", objectId: "object-a", slotId }
    }));

    const importedNodeId = getImportedNodeIds(editor)[0]!;
    act(() => {
      editor.dispatch({ type: "select-node", nodeId: importedNodeId });
    });
    expect((screen.getByLabelText(/Body/) as HTMLInputElement).checked).toBe(true);
    act(() => {
      editor.dispatch({ type: "select-node", nodeId: "object-a" });
    });
    expect((screen.getByRole("radio", { name: /Object override/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText("Roughness"), { target: { value: "0.42" } });
    fireEvent.blur(screen.getByLabelText("Roughness"));

    expect(dispatchSpy).toHaveBeenLastCalledWith({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { roughness: 0.42 }
    });
  });

  it("shows controlled material field problems without dispatching invalid drafts", () => {
    const editor = createSlotEditor();
    const dispatchSpy = vi.spyOn(editor, "dispatch");

    render(<InspectorPanel editor={editor} />);
    fireEvent.change(screen.getByLabelText("Opacity"), { target: { value: "1.2" } });
    fireEvent.blur(screen.getByLabelText("Opacity"));

    expect(screen.getByText(/less than or equal to 1/)).toBeTruthy();
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: "set-material" }));
  });

  it("renders runtime problems from the inspector model", async () => {
    const editor = createEditor();
    const runtime = {
      getProblems: () => [
        {
          id: "asset-unresolved:asset-a:object-a",
          severity: "warning",
          code: "asset-unresolved",
          source: "asset-resolver",
          target: { kind: "object", objectId: "object-a" },
          recoverability: "user-action",
          message: "Missing asset",
          assetId: "asset-a",
          display: { title: "Asset missing", detail: "asset-a unavailable" }
        }
      ],
      subscribeProblems: () => () => {}
    };
    vi.spyOn(editor, "subscribeRuntime").mockImplementation((subscriber) => {
      subscriber(runtime as never);
      return () => {};
    });

    render(<InspectorPanel editor={editor} />);

    expect(await screen.findByText("Asset missing")).toBeTruthy();
    expect(screen.getByText(/asset-a unavailable/)).toBeTruthy();
  });

  it("selects an HDR environment asset from the default scene state", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "studio-hdr", kind: "hdr", label: "Studio HDR" } });

    render(<InspectorPanel editor={editor} />);
    fireEvent.change(screen.getByLabelText("Lighting asset"), { target: { value: "studio-hdr" } });

    expect(editor.getSnapshot().environment.mode).toBe("hdr");
    expect(editor.getSnapshot().environment.environment.assetId).toBe("studio-hdr");
  });

  it("adds multiple lights of the same kind from the add dropdown", () => {
    const editor = createEditor();

    render(<InspectorPanel editor={editor} />);
    const addLight = screen.getByLabelText("Add light") as HTMLSelectElement;
    fireEvent.change(addLight, { target: { value: "point" } });
    expect(addLight.value).toBe("");
    fireEvent.change(addLight, { target: { value: "point" } });

    expect(Object.values(editor.getSnapshot().lights).filter((light) => light.kind === "point")).toHaveLength(2);
  });

  it("edits authored camera views through core inspector commands", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a", name: "Hero", projection: { kind: "perspective", fov: 60 } } });
    const dispatchSpy = vi.spyOn(editor, "dispatch");

    render(<InspectorPanel editor={editor} />);
    fireEvent.change(screen.getByLabelText("FOV"), { target: { value: "35" } });
    fireEvent.blur(screen.getByLabelText("FOV"));
    fireEvent.click(screen.getByText("Set default"));

    expect(dispatchSpy).toHaveBeenCalledWith({
      type: "update-camera-view",
      viewId: "view-a",
      patch: { projection: { kind: "perspective", fov: 35 } }
    });
    expect(editor.getSnapshot().presentation.defaultCameraId).toBe("view-a");
  });

  it("shows camera field validation problems without dispatching invalid camera commands", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a" } });
    const dispatchSpy = vi.spyOn(editor, "dispatch");

    render(<InspectorPanel editor={editor} />);
    fireEvent.change(screen.getByLabelText("FOV"), { target: { value: "180" } });
    fireEvent.blur(screen.getByLabelText("FOV"));

    expect(screen.getByText(/less than or equal/)).toBeTruthy();
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: "update-camera-view" }));
  });

  it("wires standalone camera capture and apply through the mounted runtime", () => {
    const editor = createEditor();
    const runtime = editor.mountRuntime({
      container: document.createElement("div"),
      rendererFactory: fakeRenderer
    });
    const captureCameraView = vi.spyOn(runtime, "captureCameraView");
    const applyCameraView = vi.spyOn(runtime, "applyCameraView");
    captureCameraView.mockReturnValueOnce({
      ok: true,
      view: {
        id: "view-a",
        name: "Hero",
        projection: { kind: "perspective", fov: 50 },
        position: [1, 2, 3],
        target: [0, 0, 0],
        near: 0.1,
        far: 1000
      }
    });

    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByText("Capture"));
    fireEvent.click(screen.getByText("Apply"));

    expect(editor.getSnapshot().cameras["view-a"]).toBeDefined();
    expect(applyCameraView).toHaveBeenCalledWith(editor.getSnapshot().cameras["view-a"]);
  });
});

function createSlotEditor() {
  const editor = createEditor();
  editor.dispatch({
    type: "import-glb",
    objectId: "object-a",
    asset: {
      id: "asset-a",
      metadata: attachGlbImportManifestMetadata(undefined, createSlotManifest())
    },
    expandImportedTargets: true
  });
  editor.dispatch({ type: "select-node", nodeId: "object-a" });
  return editor;
}

function getSlotIds(editor: ReturnType<typeof createEditor>) {
  return Object.values(editor.getSnapshot().nodes)
    .filter((node) => node.kind === "imported")
    .flatMap((node) => node.materialSlots?.map((slot) => slot.slotKey) ?? []);
}

function getImportedNodeIds(editor: ReturnType<typeof createEditor>) {
  return Object.values(editor.getSnapshot().nodes)
    .filter((node) => node.kind === "imported" && node.source.kind === "primitive")
    .map((node) => node.id)
    .sort();
}

function createSlotManifest() {
  return createGlbImportManifest({
    gltf: {
      parser: {
        json: {
          nodes: [{ name: "Panel", mesh: 0 }],
          meshes: [{
            name: "Panel mesh",
            primitives: [
              { attributes: { POSITION: 0, NORMAL: 1 }, material: 0 },
              { attributes: { POSITION: 2, NORMAL: 3 }, material: 1 }
            ]
          }],
          materials: [{ name: "Body" }, { name: "Screen" }]
        }
      }
    }
  });
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
