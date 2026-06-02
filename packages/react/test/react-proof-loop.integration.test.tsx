import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Group } from "three";
import { describe, expect, it } from "vitest";
import { AssetResolverBridge, createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import { App as ReactProofLoopApp } from "../../../examples/react-proof-loop/src/App";

describe("React proof-loop parity", () => {
  it("renders a restored core snapshot without React-local editor behavior", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture" } });
    editor.registerAsset({ id: "hdr-a", kind: "hdr" });
    editor.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr" } });
    editor.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { color: "#ffffff", textures: { map: { assetId: "texture-a" } } }
    });
    editor.dispatch({
      type: "set-environment",
      environment: {
        mode: "hdr",
        environment: { assetId: "hdr-a", intensity: 1, rotation: { x: 0, y: 0, z: 0 } },
        background: { mode: "hdr", assetId: "hdr-a" }
      }
    });
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    editor.dispatch({ type: "update-light", lightId: "light-a", patch: { intensity: 2 } });
    editor.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [6, 0, 0] } });
    const restored = createEditor({ snapshot: editor.serialize() });

    render(
      <EditorWorkbench
        editor={restored}
        resolver={new AssetResolverBridge((asset) => asset.kind === "glb" ? { uri: "/box.glb" } : null)}
        loader={{ load: async () => new Group() }}
        rendererFactory={fakeRenderer}
        status={({ runtimeProblems }) => <span>Runtime problems {runtimeProblems.length}</span>}
      />
    );
    await act(async () => {
      await restored.getRuntime()?.project();
    });

    expect(restored.getSnapshot().objects["object-a"].transform.position).toEqual([6, 0, 0]);
    expect(restored.getSnapshot().materials.definitions["material:object:object-a"].override.textures?.map?.assetId).toBe("texture-a");
    expect(restored.getSnapshot().environment.environment.assetId).toBe("hdr-a");
    expect(restored.getSnapshot().lights["light-a"].intensity).toBe(2);
    expect(restored.getRuntime()?.getObject("object-a")).toBeTruthy();
    expect(restored.getRuntime()?.getProblems()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "environment-asset-unresolved", assetId: "hdr-a", metadata: { role: "background" } }),
      expect.objectContaining({ code: "environment-asset-unresolved", assetId: "hdr-a", metadata: { role: "environment" } })
    ]));
    expect(await screen.findByText("Runtime problems 2")).toBeTruthy();
    expect(JSON.stringify(restored.serialize())).not.toContain("environment-asset-unresolved");
  });

  it("turns the local proof-loop app into a hierarchy, asset, and checklist validation surface", async () => {
    render(<ReactProofLoopApp rendererFactory={fakeRenderer} />);
    await act(async () => undefined);

    const hierarchy = await screen.findByTestId("demo-hierarchy");
    expect(within(hierarchy).getByText("Simple box")).toBeTruthy();
    expect(within(hierarchy).getByText("simple-box")).toBeTruthy();
    expect(within(hierarchy).getByText("Recoverable asset")).toBeTruthy();
    expect(screen.getByTestId("demo-selection-count").textContent).toContain("Simple box (1)");
    expect(screen.getByTestId("demo-assets").textContent).toContain("recoverable-box");

    await act(async () => {
      await clickButton("Nudge primary");
    });
    expect(screen.getByText("Transform command changed history").closest("li")?.dataset.complete).toBe("true");
    expect(screen.getByText("Undo is available").closest("li")?.dataset.complete).toBe("true");

    await clickButton("Undo");
    expect(screen.getByText("Redo is available").closest("li")?.dataset.complete).toBe("true");
    await clickButton("Redo");

    await clickButton("Frame selected");
    expect(screen.getByText("Camera helper used").closest("li")?.dataset.complete).toBe("true");

    await clickButton("Snap move");
    expect(screen.getByText("Snap/mode status visible").closest("li")?.dataset.complete).toBe("true");

    await clickButton("Duplicate");
    expect(screen.getByText("Copy/paste or duplicate ran").closest("li")?.dataset.complete).toBe("true");

    await clickButton("Group demo");
    expect(screen.getByText("Hierarchy operation changed nesting").closest("li")?.dataset.complete).toBe("true");

    await clickButton("Export project");
    expect(screen.getByText("Project exported").closest("li")?.dataset.complete).toBe("true");

    await clickButton("Reopen package");
    expect(screen.getByText("Project reopened").closest("li")?.dataset.complete).toBe("true");
    expect(screen.getByTestId("demo-status").textContent).not.toContain("OK");

    await waitFor(() => {
      expect(screen.getByText("Missing asset surfaced").closest("li")?.dataset.complete).toBe("true");
      expect(screen.getByTestId("demo-problem-badge").textContent).toContain("1 problems");
    });
    expect(screen.getByTestId("demo-status").textContent).not.toContain("asset-unresolved");

    await act(async () => {
      await clickButton("Replace missing asset");
    });
    expect(await screen.findByText("Missing asset recovered")).toBeTruthy();
    expect(screen.getByText("Missing asset recovered").closest("li")?.dataset.complete).toBe("true");
    expect(screen.getByTestId("demo-problem-badge").textContent).toContain("0 problems");
    expect(screen.getByTestId("demo-assets").textContent).toContain("recoverable-box");
  }, 10000);
});

async function clickButton(name: string): Promise<void> {
  const button = screen.getAllByRole("button", { name }).at(-1);
  expect(button, `Expected button ${name}`).toBeTruthy();
  fireEvent.click(button!);
  await act(async () => undefined);
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
