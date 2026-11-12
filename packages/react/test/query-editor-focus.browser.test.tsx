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
    await openQueryDialog(host);
    let dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    const name = dialog.querySelector<HTMLInputElement>('[aria-label="Query name"]')!;
    await expect.poll(() => document.activeElement).toBe(name);

    const shape = dialog.querySelector<HTMLButtonElement>('[aria-label="Data shape"]')!;
    await expect.poll(() => shape.textContent).toBe("Single object");
    shape.focus();
    await userEvent.keyboard(" ");
    const listOpen = host.ownerDocument.querySelectorAll('[role="option"]').length > 0;
    await userEvent.keyboard("{Escape}");
    if (listOpen) {
      // A select that opened consumes only its own Escape; the dialog stays.
      await expect.poll(() => host.ownerDocument.querySelectorAll('[role="option"]').length).toBe(0);
      expect(shape.textContent).toBe("Single object");
    } else {
      // The Escape reached the dialog itself, so reopen before continuing.
      await expect.poll(() => host.querySelector('[role="dialog"]')).toBeNull();
      await openQueryDialog(host);
      dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    }

    // A select popup owns its own focus while open, so start from a closed
    // editor state before asserting the dialog's tab cycle.
    const openDialog = host.querySelector<HTMLElement>('[role="dialog"]');
    if (openDialog) {
      await userEvent.click(button(openDialog, "Close query configuration"));
    }
    await expect.poll(() => host.querySelector('[role="dialog"]')).toBeNull();
    await openQueryDialog(host);
    dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    const focusCase = dialog;
    const close = button(focusCase, "Close query configuration");
    const cancel = button(focusCase, "Cancel");
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

    const draftName = focusCase.querySelector<HTMLInputElement>('[aria-label="Query name"]')!;
    await userEvent.fill(draftName, "Edited query");
    expect(focusCase.querySelector('[role="alertdialog"]')).toBeNull();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => focusCase.querySelector('[role="alertdialog"]')).toBeTruthy();
    const keep = button(focusCase, "Keep editing");
    const discard = button(focusCase, "Discard changes");
    await expect.poll(() => document.activeElement).toBe(keep);
    discard.focus();
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(keep);
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(discard);
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => focusCase.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(draftName);
    expect(draftName.value).toBe("Edited query");

    await userEvent.click(close);
    await expect.poll(() => focusCase.querySelector('[role="alertdialog"]')).toBeTruthy();
    await userEvent.click(button(focusCase, "Discard changes"));
    await expect.poll(() => host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button(host, "Edit query Query"));
    expect(editor.getHistoryState()).toEqual(history);

    await openQueryDialog(host);
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button(host, "Edit query Query"));

    await openQueryDialog(host);
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

async function openQueryDialog(host: HTMLElement): Promise<void> {
  await userEvent.click(button(host, "Edit query Query"));
  await expect.poll(() => host.querySelector('[role="dialog"]')).toBeTruthy();
}

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
