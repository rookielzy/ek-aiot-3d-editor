import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEditor } from "@ek-aiot/3d-editor-core";
import { InspectorPanel } from "../src/components/InspectorPanel";

describe("React InspectorPanel", () => {
  it("renders disabled object sections and available scene sections with no selection", () => {
    const editor = createEditor();

    render(<InspectorPanel editor={editor} />);

    expect(screen.getByText("Select a GLB object to edit transform.")).toBeTruthy();
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

    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "set-transform", objectId: "object-a", transform: { position: [4, 0, 0] } });
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
});
