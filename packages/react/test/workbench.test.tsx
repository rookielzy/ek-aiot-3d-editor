import React, { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Group } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  AssetResolverBridge,
  createEditor,
  type EditorRuntimeOptions,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import { useWorkbench } from "../src/hooks/use-workbench";

describe("React EditorWorkbench", () => {
  it("composes viewport, inspector, and render regions around one core editor", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });

    render(
      <EditorWorkbench
        editor={editor}
        rendererFactory={fakeRenderer}
        toolbar={({ snapshot }) => <span>Objects {Object.keys(snapshot.objects).length}</span>}
        status={({ inspector }) => <span>Problems {inspector.problems.problems.length}</span>}
      />
    );

    expect(screen.getByText("Objects 1")).toBeTruthy();
    expect(screen.getByText("Problems 0")).toBeTruthy();
    expect(screen.getByText("Transform")).toBeTruthy();
    expect(screen.getByText("Material")).toBeTruthy();
    expect(screen.getByText("Lights")).toBeTruthy();
  });

  it("lets render-prop extensions dispatch core commands and observe the shared snapshot", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    render(
      <EditorWorkbench
        editor={editor}
        rendererFactory={fakeRenderer}
        toolbar={({ dispatch, snapshot }) => (
          <>
            <button onClick={() => dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [2, 0, 0] } })}>
              Move object
            </button>
            <span>Position {snapshot.objects["object-a"].transform.position[0]}</span>
          </>
        )}
      />
    );

    fireEvent.click(screen.getByText("Move object"));

    expect(screen.getByText("Position 2")).toBeTruthy();
    expect((screen.getByLabelText("Position X") as HTMLInputElement).value).toBe("2");
  });

  it("exposes advanced operation state and routes shortcuts outside editable controls", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    const { container } = render(
      <EditorWorkbench
        editor={editor}
        rendererFactory={fakeRenderer}
        toolbar={({ operations, selectionCount, snap }) => (
          <>
            <button onClick={() => operations.duplicate()}>Duplicate</button>
            <span>Selected {selectionCount}</span>
            <span>Translate snap {snap.translate ?? "off"}</span>
            <input aria-label="Toolbar input" />
          </>
        )}
      />
    );
    const root = container.querySelector(".ek-workbench") as HTMLElement;

    expect(screen.getByText("Selected 1")).toBeTruthy();
    fireEvent.keyDown(root, { key: "d", ctrlKey: true });
    expect(Object.keys(editor.getSnapshot().objects)).toHaveLength(3);

    const input = screen.getByLabelText("Toolbar input");
    fireEvent.keyDown(input, { key: "a", ctrlKey: true });
    expect(editor.getSnapshot().selection.objectIds).not.toEqual(["object-a", "object-b"]);

    fireEvent.keyDown(root, { key: "w", ctrlKey: true, altKey: true });
    expect(screen.getByText("Translate snap 0.5")).toBeTruthy();
  });

  it("shares active light state between render context and the built-in inspector", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    editor.dispatch({ type: "add-light", light: { id: "light-b", kind: "point" } });

    render(
      <EditorWorkbench
        editor={editor}
        rendererFactory={fakeRenderer}
        status={({ activeLightId }) => <span>Active {activeLightId}</span>}
      />
    );

    expect(screen.getByText("Active light-a")).toBeTruthy();

    fireEvent.click(screen.getByText("Point light"));

    expect(screen.getByText("Active light-b")).toBeTruthy();
  });

  it("forwards runtime options to the core viewport boundary", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const resolver = new AssetResolverBridge((asset) => asset.kind === "glb" ? { uri: "/box.glb" } : null);
    const loader: EditorRuntimeOptions["loader"] = { load: vi.fn(async () => new Group()) };

    render(<EditorWorkbench editor={editor} resolver={resolver} loader={loader} rendererFactory={fakeRenderer} />);

    await act(async () => {
      await editor.getRuntime()?.project();
    });

    expect(loader.load).toHaveBeenCalledWith(expect.objectContaining({ uri: "/box.glb" }));
  });

  it("exposes runtime problems through built-in UI and render context without serialization", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });

    render(
      <EditorWorkbench
        editor={editor}
        resolver={new AssetResolverBridge(() => null)}
        rendererFactory={fakeRenderer}
        status={({ runtimeProblems }) => <span>Runtime problems {runtimeProblems.length}</span>}
      />
    );

    await act(async () => {
      await editor.getRuntime()?.project();
    });

    expect(await screen.findByText("Runtime problems 1")).toBeTruthy();
    expect(screen.getByText("Asset could not be resolved")).toBeTruthy();
    expect(JSON.stringify(editor.serialize())).not.toContain("asset-unresolved");
  });

  it("routes problem-panel replacement files through the core project API", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const replaceAsset = vi.spyOn(editor, "replaceAsset");

    render(
      <EditorWorkbench
        editor={editor}
        resolver={new AssetResolverBridge(() => null)}
        rendererFactory={fakeRenderer}
      />
    );

    await act(async () => {
      await editor.getRuntime()?.project();
    });

    const input = document.querySelector(".ek-inspector-file-action input") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "box.glb", { type: "model/gltf-binary" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(replaceAsset).toHaveBeenCalledWith({
      assetId: "asset-a",
      source: file,
      label: "box.glb",
      mimeType: "model/gltf-binary"
    });
  });

  it("does not dispose a host-owned editor on unmount", () => {
    const editor = createEditor();
    const { unmount } = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);

    unmount();

    expect(editor.disposed).toBe(false);
    expect(editor.getSnapshot().version).toBe(3);
  });

  it("disposes a shell-created editor when the workbench unmounts", async () => {
    let capturedEditor = createEditor();
    const { unmount } = render(
      <EditorWorkbench
        rendererFactory={fakeRenderer}
        toolbar={({ editor }) => {
          capturedEditor = editor;
          return null;
        }}
      />
    );

    unmount();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(capturedEditor.disposed).toBe(true);
  });

  it("balances runtime cleanup under React StrictMode", () => {
    const editor = createEditor();
    const rendererDispose = vi.fn();

    const { unmount } = render(
      <StrictMode>
        <EditorWorkbench editor={editor} rendererFactory={(container) => fakeRenderer(container, rendererDispose)} />
      </StrictMode>
    );

    unmount();

    expect(rendererDispose.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(editor.disposed).toBe(false);
    expect(editor.getRuntime()?.disposed ?? true).toBe(true);
  });

  it("keeps a shell-created editor alive during React StrictMode effect replay", async () => {
    let capturedEditor = createEditor();
    const { unmount } = render(
      <StrictMode>
        <EditorWorkbench
          rendererFactory={fakeRenderer}
          toolbar={({ editor }) => {
            capturedEditor = editor;
            return <span>Workbench ready</span>;
          }}
        />
      </StrictMode>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(capturedEditor.disposed).toBe(false);

    unmount();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(capturedEditor.disposed).toBe(true);
  });

  it("keeps useWorkbench ownership explicit", () => {
    const editor = createEditor();
    const { result, unmount } = renderHookWithResult(() => useWorkbench({ editor }));

    expect(result().editor).toBe(editor);
    expect(result().ownsEditor).toBe(false);
    expect(result().exportProject().ok).toBe(true);

    unmount();
    expect(editor.disposed).toBe(false);
  });
});

function fakeRenderer(container: HTMLElement, dispose: () => void = () => {}): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose
  };
}

function renderHookWithResult<T>(callback: () => T) {
  let value: T;
  function Harness() {
    value = callback();
    return null;
  }

  const view = render(<Harness />);
  return {
    ...view,
    result: () => value!
  };
}
