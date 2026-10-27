import React from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

it("contains keyboard focus, isolates background shortcuts, and restores focus after query dialogs close", async () => {
  const editor = createEditor();
  expect(editor.dispatch({ type: "create-data-connection", connection: {
    id: "c", name: "API", baseUrl: "https://example.test", auth: { kind: "none" }, headers: {}, timeoutMs: 10_000
  } }).ok).toBe(true);
  expect(editor.dispatch({ type: "create-data-query", query: {
    id: "q", connectionId: "c", name: "Query", path: "/pumps", parameters: [],
    mapping: {
      mode: "single", root: [], identity: { kind: "literal", value: "001" }, displayName: null,
      properties: [{ key: "value", label: "Value", type: "number", nullable: false, unit: null,
        source: [{ kind: "key", key: "value" }], transform: { kind: "raw" }, range: null, allowed: null }],
      observedAt: null, sourceQuality: null
    }
  } }).ok).toBe(true);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<EditorWorkbench editor={editor} locale="en" rendererFactory={fakeRenderer} rightPanel={() => null} />);

  try {
    await expect.poll(() => host.querySelector('[aria-label="Workspace views"] button[aria-label^="Data "]')).toBeTruthy();
    await userEvent.click(host.querySelector('[aria-label="Workspace views"] button[aria-label^="Data "]')!);
    await userEvent.click(button(host, "Edit query Query"));
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    const name = dialog.querySelector<HTMLInputElement>('[aria-label="Query name"]')!;
    await expect.poll(() => document.activeElement).toBe(name);

    const shape = dialog.querySelector<HTMLSelectElement>('[aria-label="Data shape"]')!;
    shape.focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{Escape}");
    expect(host.querySelector('[role="dialog"]')).toBe(dialog);
    expect(shape.value).toBe("single");

    const close = button(dialog, "Close query configuration");
    const cancel = button(dialog, "Cancel");
    cancel.focus();
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(close);
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(cancel);

    const scene = host.querySelector<HTMLButtonElement>('[aria-label="Workspace views"] button[aria-label^="Scene "]')!;
    scene.focus();
    expect(document.activeElement).toBe(cancel);
    close.focus();
    const history = editor.getHistoryState();
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(editor.getHistoryState()).toEqual(history);
    expect(editor.getSnapshot().dataSources.queries.q.name).toBe("Query");

    await userEvent.fill(name, "Edited query");
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => dialog.querySelector('[role="alertdialog"]')).toBeTruthy();
    const keep = button(dialog, "Keep editing");
    const discard = button(dialog, "Discard changes");
    expect(document.activeElement).toBe(keep);
    discard.focus();
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(keep);
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(discard);
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => dialog.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(name);
    expect(name.value).toBe("Edited query");

    await userEvent.keyboard("{Escape}");
    await expect.poll(() => dialog.querySelector('[role="alertdialog"]')).toBeTruthy();
    await userEvent.click(button(dialog, "Discard changes"));
    await expect.poll(() => host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button(host, "Edit query Query"));
    expect(editor.getHistoryState()).toEqual(history);

    await userEvent.click(button(host, "Edit query Query"));
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button(host, "Edit query Query"));

    await userEvent.click(button(host, "Edit query Query"));
    await userEvent.fill(host.querySelector<HTMLInputElement>('[aria-label="Query name"]')!, "Saved query");
    await userEvent.click(button(host, "Save query"));
    await expect.poll(() => host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button(host, "Edit query Saved query"));
    expect(editor.getHistoryState().undoCount).toBe(history.undoCount + 1);
    scene.focus();
    expect(document.activeElement).toBe(scene);
  } finally {
    root.unmount();
    editor.dispose();
    host.remove();
  }
}, 15_000);

function button(host: HTMLElement, label: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.getAttribute("aria-label") === label || candidate.textContent?.trim() === label
  );
  if (!found) throw new Error(`Expected button ${label}`);
  return found;
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return { domElement: container.ownerDocument.createElement("canvas"), setSize() {}, render() {}, dispose() {} };
}
