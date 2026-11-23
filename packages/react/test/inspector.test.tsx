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
import { inspectorOptionValues, selectInspectorOption, setInspectorColor } from "./support/inspector-controls";

describe("React InspectorPanel", () => {
  it("retains failed dispatch drafts and exposes transient errors without changing snapshots", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    render(<InspectorPanel editor={editor} />);
    const snapshot = editor.getSnapshot();
    const dispatch = vi.spyOn(editor, "dispatch").mockReturnValue({ ok: false, snapshot, error: "Target unavailable" });
    for (const [tab, name] of [["Transform", "Position X"], ["Material", "Opacity"]]) {
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      const input = screen.getByLabelText(name) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "0.4" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(input.value).toBe("0.4");
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(screen.getAllByRole("alert").some((alert) => alert.textContent?.includes("Target unavailable"))).toBe(true);
      fireEvent.keyDown(input, { key: "Escape" });
    }
    expect(editor.getSnapshot()).toBe(snapshot);
    dispatch.mockRestore();
  });
  it("cancels numeric drafts and clears validation without changing history", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    render(<InspectorPanel editor={editor} />);
    const before = editor.getHistoryState().undoCount;
    const input = screen.getByLabelText("Position X") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(input.value).toBe("0");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(editor.getHistoryState().undoCount).toBe(before);
    const opacity = screen.getByLabelText("Opacity") as HTMLInputElement;
    fireEvent.change(opacity, { target: { value: "" } });
    fireEvent.blur(opacity);
    expect(opacity.getAttribute("aria-invalid")).toBe("true");
    fireEvent.keyDown(opacity, { key: "Escape" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears stale field errors on external updates without discarding unrelated drafts", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    render(<InspectorPanel editor={editor} />);
    const x = screen.getByLabelText("Position X") as HTMLInputElement;
    const y = screen.getByLabelText("Position Y") as HTMLInputElement;
    fireEvent.change(x, { target: { value: "" } });
    fireEvent.keyDown(x, { key: "Enter" });
    fireEvent.change(y, { target: { value: "7" } });
    act(() => { editor.dispatch({ type: "set-node-transform", nodeId: "object-a", transform: { position: [3, 0, 0] } }); });
    expect(x.value).toBe("3");
    expect(y.value).toBe("7");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps color changes local until Apply and cancels without history", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByRole("tab", { name: "Material" }));
    const before = editor.getHistoryState().undoCount;
    fireEvent.click(screen.getByLabelText("Base color"));
    fireEvent.change(screen.getByLabelText("Hex color"), { target: { value: "#336699" } });
    expect(editor.getHistoryState().undoCount).toBe(before);
    fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
    expect(editor.getHistoryState().undoCount).toBe(before);
    fireEvent.click(screen.getByLabelText("Base color"));
    fireEvent.change(screen.getByLabelText("Hex color"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply", exact: true }));
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Hex color"), { target: { value: "#336699" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply", exact: true }));
    expect(editor.getHistoryState().undoCount).toBe(before + 1);
    expect(editor.getSnapshot().materials.definitions["material:object:object-a"].override.color).toBe("#336699");
    act(() => { editor.undo(); });
    expect(screen.getByLabelText("Base color").textContent).toContain("#ffffff");
  });
  it("renders disabled node transform sections and available scene sections with no selection", () => {
    const editor = createEditor();

    render(<InspectorPanel editor={editor} />);

    expect(screen.getByText("Select a transformable node to edit transform.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Environment" }));
    expect(screen.getByLabelText("Lighting asset")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Scene" }));
    expect(screen.getByRole("heading", { name: "Lights" })).toBeTruthy();
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
    fireEvent.click(screen.getByRole("tab", { name: "Material" }));
    fireEvent.change(screen.getByLabelText("Opacity"), { target: { value: "0.5" } });
    fireEvent.blur(screen.getByLabelText("Opacity"));
    selectInspectorOption(screen.getByLabelText("Side"), "double");

    const override = editor.getSnapshot().materials.definitions["material:object:object-a"].override;
    expect(override.opacity).toBe(0.5);
    expect(override.side).toBe("double");
    expect(JSON.stringify(editor.getSnapshot())).not.toContain("Texture");
  });

  it("keeps material edits scoped to their target and preserves them across group navigation and history", () => {
    const editor = createSlotEditor();
    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByRole("tab", { name: "Material" }));
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
    expect(within(screen.getByRole("tabpanel", { name: "Lighting" })).getByLabelText("Lighting asset")).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(within(screen.getByRole("tabpanel", { name: "Lights" })).getByLabelText("Add light")).toBeTruthy();
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
    fireEvent.click(screen.getByRole("tab", { name: "Material" }));
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
    setInspectorColor(screen.getByLabelText("Base color"), "#ff0000");
    setInspectorColor(screen.getByLabelText("Base color"), "#ffffff");
    expect(editor.getSnapshot().materials.definitions["material:object:object-a"].override.color).toBe("#ffffff");
  });

  it("keeps stale material assignments editable with an unresolved warning", () => {
    const editor = createSlotEditor();
    const slotId = getSlotIds(editor)[0]!;
    editor.dispatch({ type: "set-material", target: { kind: "material-slot", objectId: "object-a", slotId }, material: { opacity: 0.5 } });
    const snapshot = editor.getSnapshot();
    editor.restore({ ...snapshot, nodes: Object.fromEntries(Object.entries(snapshot.nodes).map(([id, node]) => [id, node.kind === "imported" ? { ...node, materialSlots: [] } : node])) });
    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByRole("tab", { name: "Material" }));
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
    fireEvent.click(screen.getByRole("tab", { name: "Material" }));
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
    fireEvent.click(screen.getByRole("tab", { name: "Material" }));
    fireEvent.click(screen.getByLabelText(/Body/));
    setInspectorColor(screen.getByLabelText("Base color"), "#336699");

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
    fireEvent.click(screen.getByRole("tab", { name: "Material" }));
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
    fireEvent.click(screen.getByRole("tab", { name: "Material" }));
    fireEvent.change(screen.getByLabelText("Roughness"), { target: { value: "0.42" } });
    fireEvent.blur(screen.getByLabelText("Roughness"));
    act(() => {
      editor.dispatch({ type: "select-node", nodeId: importedNodeId });
    });
    setInspectorColor(screen.getByLabelText("Base color"), "#336699");

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
    fireEvent.click(screen.getByRole("tab", { name: "Material" }));
    fireEvent.click(screen.getByLabelText(/Body/));
    setInspectorColor(screen.getByLabelText("Base color"), "#336699");
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
    fireEvent.click(screen.getByRole("tab", { name: "Material" }));
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

    fireEvent.click(screen.getByRole("tab", { name: "Scene" }));
    fireEvent.click(screen.getByRole("tab", { name: "Problems" }));
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

  it("commits scene number drafts on Enter without losing focus or duplicating undo", () => {
    const editor = createEditor();
    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByRole("tab", { name: "Environment" }));
    const input = screen.getByLabelText("Lighting intensity");
    input.focus();
    fireEvent.change(input, { target: { value: "2.5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(editor.getSnapshot().environment.lighting.intensity).toBe(2.5);
    expect(document.activeElement).toBe(input);
    fireEvent.blur(input);
    act(() => { editor.undo(); });
    expect(editor.getSnapshot().environment.lighting.intensity).toBe(1);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(editor.getSnapshot().environment.lighting.intensity).toBe(1);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("shares light and camera edits across groups and clears errors when changing targets", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "sun", kind: "directional", name: "Sun" } });
    editor.dispatch({ type: "select-node", nodeId: "sun" });
    editor.dispatch({ type: "create-camera-view", view: { id: "hero", name: "Hero" } });
    editor.dispatch({ type: "create-camera-view", view: { id: "detail", name: "Detail" } });
    render(<InspectorPanel editor={editor} />);
    const intensity = screen.getByLabelText("Intensity");
    intensity.focus();
    fireEvent.change(intensity, { target: { value: "3" } });
    fireEvent.keyDown(intensity, { key: "Enter" });
    expect(editor.getSnapshot().lights.sun.intensity).toBe(3);
    expect(document.activeElement).toBe(intensity);
    fireEvent.blur(intensity);
    act(() => { editor.undo(); });
    expect(editor.getSnapshot().lights.sun.intensity).toBe(1);
    fireEvent.click(screen.getByRole("tab", { name: "Scene" }));
    expect((screen.getByLabelText("Intensity") as HTMLInputElement).value).toBe("1");
    fireEvent.click(screen.getByRole("tab", { name: "Camera views" }));
    const fov = screen.getByLabelText("FOV");
    fov.focus();
    fireEvent.change(fov, { target: { value: "40" } });
    fireEvent.keyDown(fov, { key: "Enter" });
    expect(editor.getSnapshot().cameras.hero.projection.fov).toBe(40);
    expect(document.activeElement).toBe(fov);
    fireEvent.change(fov, { target: { value: "" } });
    fireEvent.blur(fov);
    expect(fov.getAttribute("aria-invalid")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Detail/ }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByLabelText("FOV") as HTMLInputElement).value).toBe("50");
  });

  it("selects camera nodes from scene management even when another camera is selected", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-camera-view", view: { id: "hero", name: "Hero" } });
    editor.dispatch({ type: "create-camera-view", view: { id: "detail", name: "Detail", projection: { kind: "perspective", fov: 35 } } });
    editor.dispatch({ type: "select-node", nodeId: "hero" });
    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByRole("tab", { name: "Scene" }));
    fireEvent.click(screen.getByRole("tab", { name: "Camera views" }));
    fireEvent.click(screen.getByRole("button", { name: /Detail/ }));
    expect(editor.getSnapshot().selection.nodeId).toBe("detail");
    expect((screen.getByLabelText("FOV") as HTMLInputElement).value).toBe("35");
    fireEvent.click(screen.getByRole("tab", { name: "Properties" }));
    expect((screen.getByLabelText("FOV") as HTMLInputElement).value).toBe("35");
    expect(screen.getAllByLabelText("Position X")).toHaveLength(1);
    act(() => { editor.dispatch({ type: "select-nodes", mode: "replace", nodeIds: ["hero", "detail"], primaryNodeId: "detail" }); });
    expect(screen.queryByRole("tablist", { name: "Properties" })).toBeNull();
  });

  it.each(["ambient", "hemisphere", "directional", "point", "spot"])("adds, selects, edits and removes a %s light", (kind) => {
    const editor = createEditor();
    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByRole("tab", { name: "Scene" }));
    selectInspectorOption(screen.getByLabelText("Add light"), kind);
    const light = Object.values(editor.getSnapshot().lights)[0]!;
    expect(light.kind).toBe(kind);
    expect(editor.getSnapshot().nodes[editor.getSnapshot().selection.nodeId!].kind).toBe("light");
    fireEvent.change(screen.getByLabelText("Intensity"), { target: { value: "2" } });
    fireEvent.keyDown(screen.getByLabelText("Intensity"), { key: "Enter" });
    expect(editor.getSnapshot().lights[light.id].intensity).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove light" }));
    expect(Object.keys(editor.getSnapshot().lights)).toHaveLength(0);
  });

  it("retains independent environment sources, cubemap faces and flat-image diagnostics", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "image", kind: "image", label: "Backdrop" } });
    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByRole("tab", { name: "Environment" }));
    expect(inspectorOptionValues(screen.getByLabelText("Lighting source"))).toEqual(["none", "equirectangular", "hdr", "cubemap"]);
    fireEvent.click(screen.getByRole("tab", { name: "Background" }));
    expect(inspectorOptionValues(screen.getByLabelText("Background source"))).toEqual(["none", "solid", "flat-image", "equirectangular", "hdr", "cubemap"]);
    act(() => {
      for (const id of ["px", "nx", "py", "ny", "pz", "nz"]) editor.dispatch({ type: "register-asset", asset: { id, kind: "image", label: id } });
    });
    fireEvent.click(screen.getByRole("button", { name: "Use six textures for both" }));
    selectInspectorOption(screen.getByLabelText("Background asset"), "image");
    selectInspectorOption(screen.getByLabelText("Background source"), "flat-image");
    expect(editor.getSnapshot().environment.lighting.source.kind).toBe("cubemap");
    fireEvent.click(screen.getByRole("tab", { name: "Lighting" }));
    const faces = screen.getAllByRole("combobox").filter((select) => select.getAttribute("aria-label")?.startsWith("Lighting ") && !["Lighting source", "Lighting asset"].includes(select.getAttribute("aria-label")!));
    expect(faces).toHaveLength(6);
    for (const face of faces) selectInspectorOption(face, "image");
    expect(editor.getSnapshot().environment.lighting.source.kind).toBe("cubemap");
    expect(editor.getSnapshot().environment.background.source).toEqual({ kind: "flat-image", assetId: "image" });
    fireEvent.click(screen.getByRole("tab", { name: "Background" }));
    fireEvent.change(screen.getByLabelText("Background blur"), { target: { value: "0.4" } });
    fireEvent.keyDown(screen.getByLabelText("Background blur"), { key: "Enter" });
    expect(screen.getByLabelText("Background blur").getAttribute("aria-describedby")).toBeTruthy();
  });

  it("clears environment asset sources independently from the None option", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "hdr", kind: "hdr" } });
    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByRole("tab", { name: "Environment" }));
    fireEvent.click(screen.getByRole("button", { name: "Shared lighting/background" }));
    selectInspectorOption(screen.getByLabelText("Lighting asset"), "");
    expect(editor.getSnapshot().environment.lighting.source).toEqual({ kind: "none" });
    expect(editor.getSnapshot().environment.background.source).toEqual({ kind: "hdr", assetId: "hdr" });
    fireEvent.click(screen.getByRole("tab", { name: "Background" }));
    selectInspectorOption(screen.getByLabelText("Background asset"), "");
    expect(editor.getSnapshot().environment.background.source).toEqual({ kind: "none" });
    act(() => { editor.undo(); });
    expect(editor.getSnapshot().environment.background.source).toEqual({ kind: "hdr", assetId: "hdr" });
  });

  it("selects an HDR environment asset from the default scene state", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "studio-hdr", kind: "hdr", label: "Studio HDR" } });

    render(<InspectorPanel editor={editor} />);
    fireEvent.click(screen.getByRole("tab", { name: "Environment" }));
    selectInspectorOption(screen.getByLabelText("Lighting asset"), "studio-hdr");

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
    selectInspectorOption(addLight, "point");
    expect(addLight.textContent).toBe("Add");
    selectInspectorOption(addLight, "point");

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
    fireEvent.click(screen.getByRole("tab", { name: "Camera views" }));
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
    fireEvent.click(screen.getByRole("tab", { name: "Camera views" }));
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
    fireEvent.click(screen.getByRole("tab", { name: "Camera views" }));
    fireEvent.click(screen.getByText("Capture"));
    fireEvent.click(screen.getByText("Apply"));

    expect(editor.getSnapshot().cameras["view-a"]).toBeDefined();
    expect(applyCameraView).toHaveBeenCalledWith(editor.getSnapshot().cameras["view-a"]);
    fireEvent.click(screen.getByRole("button", { name: "Set default" }));
    expect(editor.getSnapshot().presentation.defaultCameraId).toBe("view-a");
    fireEvent.click(screen.getByRole("button", { name: "Clear default" }));
    expect(editor.getSnapshot().presentation.defaultCameraId).toBeNull();
    captureCameraView.mockReturnValueOnce({ ok: true, view: { ...editor.getSnapshot().cameras["view-a"], position: [3, 4, 5] } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(editor.getSnapshot().cameras["view-a"].position).toEqual([3, 4, 5]);
    fireEvent.click(screen.getByRole("button", { name: "Delete view" }));
    expect(Object.keys(editor.getSnapshot().cameras)).toHaveLength(0);
    expect(screen.getByText("Capture a camera view to author presentation state.")).toBeTruthy();
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
