import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  attachGlbImportManifestMetadata,
  createEditor,
  createGlbImportManifest,
  createMessageDescriptor,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { InspectorPanel } from "../src/components/InspectorPanel";
import { ProblemsPanel } from "../src/components/ProblemsPanel";

describe("React InspectorPanel", () => {
  it("renders disabled node transform sections and available scene sections with no selection", () => {
    const editor = createEditor();

    render(<InspectorPanel editor={editor} />);

    expect(screen.getByText("Select a transformable node to edit transform.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Environment" }));
    expect(screen.getByLabelText("Lighting asset")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Scene" }));
    expect(screen.getByText("Lights")).toBeTruthy();
    expect(screen.getByLabelText("Add light")).toBeTruthy();
    expect(editor.getSnapshot().selection.nodeId).toBeNull();
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

  it("edits rotation in degrees, rejects empty drafts and creates one undo step for Enter and blur", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    editor.dispatch({ type: "set-node-transform", nodeId: "object-a", transform: { rotation: [0, Math.PI / 2, 0], position: [2, 0, 0] } });
    render(<InspectorPanel editor={editor} />);

    expect((screen.getByLabelText("Rotation Y") as HTMLInputElement).value).toBe("90");
    const position = screen.getByLabelText("Position X");
    fireEvent.change(position, { target: { value: "" } });
    fireEvent.blur(position);
    expect(editor.getSnapshot().objects["object-a"].transform.position).toEqual([2, 0, 0]);
    expect(screen.getByRole("alert")).toBeTruthy();

    const rotation = screen.getByLabelText("Rotation Y");
    rotation.focus();
    fireEvent.change(rotation, { target: { value: "180" } });
    fireEvent.keyDown(rotation, { key: "Enter" });
    expect(document.activeElement).toBe(screen.getByLabelText("Rotation Y"));
    fireEvent.blur(screen.getByLabelText("Rotation Y"));
    expect(editor.getSnapshot().objects["object-a"].transform.rotation).toEqual([0, Math.PI, 0]);
    act(() => { editor.undo(); });
    expect((screen.getByLabelText("Rotation Y") as HTMLInputElement).value).toBe("90");
    act(() => { editor.redo(); });
    expect((screen.getByLabelText("Rotation Y") as HTMLInputElement).value).toBe("180");
  });

  it("refreshes transform drafts when core history changes snapshot values", () => {
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

  it("keeps material edits scoped to their target and preserves them across group navigation and history", () => {
    const editor = createSlotEditor();
    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByRole("radio", { name: /Body/ }));
    const roughness = screen.getByLabelText("Roughness");
    roughness.focus();
    fireEvent.change(roughness, { target: { value: "0.25" } });
    fireEvent.keyDown(roughness, { key: "Enter" });
    expect(document.activeElement).toBe(screen.getByLabelText("Roughness"));
    fireEvent.blur(screen.getByLabelText("Roughness"));
    const changed = editor.getSnapshot();

    const properties = screen.getByRole("tab", { name: "Properties" });
    fireEvent.keyDown(properties, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Environment" }));
    expect(within(screen.getByRole("tabpanel")).getByLabelText("Lighting asset")).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(within(screen.getByRole("tabpanel")).getByLabelText("Add light")).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(editor.getSnapshot()).toBe(changed);
    expect((screen.getByRole("radio", { name: /Body/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Roughness") as HTMLInputElement).value).toBe("0.25");
    act(() => { editor.undo(); });
    expect((screen.getByLabelText("Roughness") as HTMLInputElement).value).toBe("1");
    act(() => { editor.redo(); });
    expect((screen.getByLabelText("Roughness") as HTMLInputElement).value).toBe("0.25");

    fireEvent.change(screen.getByLabelText("Opacity"), { target: { value: "2" } });
    fireEvent.blur(screen.getByLabelText("Opacity"));
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Screen/ }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByLabelText("Opacity") as HTMLInputElement).value).toBe("1");
    fireEvent.change(screen.getByLabelText("Roughness"), { target: { value: "0.6" } });
    act(() => { editor.dispatch({ type: "select-node", nodeId: getImportedNodeIds(editor)[0]! }); });
    expect((screen.getByLabelText("Roughness") as HTMLInputElement).value).toBe("0.25");
    act(() => { editor.dispatch({ type: "select-node", nodeId: "object-a" }); });
    expect((screen.getByRole("radio", { name: /Object override/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Roughness") as HTMLInputElement).value).toBe("1");
  });

  it("creates explicitly edited default-valued overrides but does not commit untouched inputs twice", () => {
    const editor = createSlotEditor();
    render(<InspectorPanel editor={editor} />);
    const before = editor.getHistoryState().undoCount;
    const roughness = screen.getByLabelText("Roughness");
    fireEvent.blur(roughness);
    expect(editor.getHistoryState().undoCount).toBe(before);
    fireEvent.change(roughness, { target: { value: "0.5" } });
    fireEvent.change(roughness, { target: { value: "1" } });
    fireEvent.keyDown(roughness, { key: "Enter" });
    fireEvent.blur(roughness);
    expect(editor.getSnapshot().materials.definitions["material:object:object-a"]?.override.roughness).toBe(1);
    expect(editor.getHistoryState().undoCount).toBe(before + 1);
    fireEvent.change(screen.getByLabelText("Base color"), { target: { value: "#ff0000" } });
    fireEvent.change(screen.getByLabelText("Base color"), { target: { value: "#ffffff" } });
    expect(editor.getSnapshot().materials.definitions["material:object:object-a"].override.color).toBe("#ffffff");
  });

  it("keeps stale material assignments editable with an unresolved warning", () => {
    const editor = createSlotEditor();
    const slotId = getSlotIds(editor)[0]!;
    editor.dispatch({ type: "set-material", target: { kind: "material-slot", objectId: "object-a", slotId }, material: { opacity: 0.5 } });
    const snapshot = editor.getSnapshot();
    editor.restore({ ...snapshot, nodes: Object.fromEntries(Object.entries(snapshot.nodes).map(([id, node]) => [id, node.kind === "imported" ? { ...node, materialSlots: [] } : node])) });
    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByRole("radio", { name: /Unresolved slot/ }));
    expect(screen.getByText(/Existing override values remain editable/)).toBeTruthy();
    expect((screen.getByLabelText("Opacity") as HTMLInputElement).value).toBe("0.5");
    fireEvent.change(screen.getByLabelText("Opacity"), { target: { value: "0.75" } });
    fireEvent.blur(screen.getByLabelText("Opacity"));
    expect((screen.getByLabelText("Opacity") as HTMLInputElement).value).toBe("0.75");
    act(() => { editor.undo(); });
    expect((screen.getByLabelText("Opacity") as HTMLInputElement).value).toBe("0.5");
  });

  it("disables unresolved slots without assignments and keeps all texture controls available for the owner", () => {
    const editor = createSlotEditor();
    const slotId = getSlotIds(editor)[0]!;
    vi.spyOn(editor, "subscribeRuntime").mockImplementation((subscriber) => {
      subscriber({
        getProblems: () => [{
          id: "unresolved-slot",
          severity: "warning",
          code: "imported-material-slot-unresolved",
          source: "runtime",
          target: { kind: "object", objectId: "object-a" },
          metadata: { slotId },
          recoverability: "user-action",
          message: "Imported material slot could not be resolved."
        }],
        subscribeProblems: () => () => {}
      } as never);
      return () => {};
    });
    render(<InspectorPanel editor={editor} />);
    expect((screen.getByRole("radio", { name: /Body/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("Slot is unresolved and cannot create a new assignment.")).toBeTruthy();
    for (const label of ["map", "normal map", "roughness map", "metalness map", "emissive map", "alpha map"]) {
      expect((screen.getByLabelText(label) as HTMLSelectElement).disabled).toBe(false);
    }
    act(() => { editor.dispatch({ type: "select-node", nodeId: getImportedNodeIds(editor)[0]! }); });
    expect((screen.getByRole("radio", { name: /Object override/ }) as HTMLInputElement).checked).toBe(true);
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

  it("renders descriptor-only problem details and action labels", () => {
    render(
      <ProblemsPanel
        section={{
          id: "problems",
          title: "Problems",
          enabled: true,
          fields: [],
          problems: [{
            id: "problem-a",
            severity: "warning",
            code: "texture-missing",
            source: "runtime",
            target: { kind: "texture-slot", materialId: "material-a", slot: "map", assetId: "asset-a" },
            title: "Texture missing",
            detailDescriptor: createMessageDescriptor({
              key: "problem.material.textureAssetUnresolved.detail",
              fallback: "Texture slot {slot} references missing or unavailable asset {assetId}.",
              values: { slot: "map", assetId: "asset-a" }
            }),
            assetId: "asset-a",
            recoverability: "user-action",
            acknowledged: false,
            actionLabelDescriptor: createMessageDescriptor({
              key: "problem.importedTarget.reviewRemap.actionLabel",
              fallback: "Review remap"
            }),
            runtime: true
          }]
        }}
      />
    );

    expect(screen.getByText("Texture slot map references missing or unavailable asset asset-a.")).toBeTruthy();
    expect(screen.getByText(/Review remap/)).toBeTruthy();
  });

  it("selects an HDR environment asset from the default scene state", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "studio-hdr", kind: "hdr", label: "Studio HDR" } });

    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByRole("tab", { name: "Environment" }));
    fireEvent.change(screen.getByLabelText("Lighting asset"), { target: { value: "studio-hdr" } });

    expect(editor.getSnapshot().environment.lighting.source).toEqual({ kind: "hdr", assetId: "studio-hdr" });
  });

  it("applies shared environment presets through core commands", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "studio-hdr", kind: "hdr", label: "Studio HDR" } });

    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByRole("tab", { name: "Environment" }));
    fireEvent.click(screen.getByRole("button", { name: "Shared lighting/background" }));

    expect(editor.getSnapshot().environment.lighting.source).toEqual({ kind: "hdr", assetId: "studio-hdr" });
    expect(editor.getSnapshot().environment.background.source).toEqual({ kind: "hdr", assetId: "studio-hdr" });
  });

  it("adds multiple lights of the same kind from the add dropdown", () => {
    const editor = createEditor();

    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByRole("tab", { name: "Scene" }));
    const addLight = screen.getByLabelText("Add light") as HTMLSelectElement;
    fireEvent.change(addLight, { target: { value: "point" } });
    expect(addLight.value).toBe("");
    fireEvent.change(addLight, { target: { value: "point" } });

    expect(Object.values(editor.getSnapshot().lights).filter((light) => light.kind === "point")).toHaveLength(2);
  });

  it("edits light shadow controls through core inspector commands", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "sun", kind: "directional" } });
    editor.dispatch({ type: "select-node", nodeId: "sun" });
    const dispatchSpy = vi.spyOn(editor, "dispatch");

    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByLabelText("Cast shadows"));
    fireEvent.change(screen.getByLabelText("Shadow map width"), { target: { value: "2048" } });
    fireEvent.blur(screen.getByLabelText("Shadow map width"));

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: "update-light",
      lightId: "sun",
      patch: expect.objectContaining({
        shadow: expect.objectContaining({ enabled: true })
      })
    }));
    expect(editor.getSnapshot().lights.sun.shadow).toMatchObject({
      enabled: true,
      mapSize: { width: 2048 }
    });
  });

  it("renders lighting presets and active light diagnostics", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "point-a", kind: "point" } });
    editor.dispatch({ type: "select-node", nodeId: "point-a" });
    vi.spyOn(editor, "subscribeRuntime").mockImplementation((subscriber) => {
      subscriber({
        getProblems: () => [{
          id: "lighting-point-shadow-cost:point-a",
          severity: "warning",
          code: "lighting-point-shadow-cost",
          source: "runtime",
          target: { kind: "light", lightId: "point-a" },
          recoverability: "user-action",
          message: "Point shadows render six faces.",
          display: {
            title: "Point light shadow is expensive",
            detail: "Point light uses six shadow map faces."
          }
        }],
        subscribeProblems: () => () => {}
      } as never);
      return () => {};
    });
    const dispatchSpy = vi.spyOn(editor, "dispatch");

    render(<InspectorPanel editor={editor} />);
    expect(screen.getAllByText("Point light shadow is expensive")).toHaveLength(2);
    expect(screen.getAllByText("Point light uses six shadow map faces.")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Point preview" }));

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: "update-light",
      lightId: "point-a"
    }));
    expect(editor.getSnapshot().lights["point-a"].shadow.enabled).toBe(true);
  });

  it("shows light shadow validation problems without dispatching invalid drafts", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "sun", kind: "directional" } });
    editor.dispatch({ type: "select-node", nodeId: "sun" });
    const dispatchSpy = vi.spyOn(editor, "dispatch");

    render(<InspectorPanel editor={editor} />);
    fireEvent.change(screen.getByLabelText("Shadow map width"), { target: { value: "0" } });
    fireEvent.blur(screen.getByLabelText("Shadow map width"));

    expect(screen.getByText(/greater than or equal to 1/)).toBeTruthy();
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: "update-light" }));
  });

  it("edits authored camera views through core inspector commands", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a", name: "Hero", projection: { kind: "perspective", fov: 60 } } });
    const dispatchSpy = vi.spyOn(editor, "dispatch");

    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByRole("tab", { name: "Scene" }));
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
    fireEvent.click(screen.getByRole("tab", { name: "Scene" }));
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
    fireEvent.click(screen.getByRole("tab", { name: "Scene" }));
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
