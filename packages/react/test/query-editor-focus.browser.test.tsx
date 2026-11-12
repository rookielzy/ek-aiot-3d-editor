import React from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
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
    const dialog = host.querySelector<HTMLDialogElement>('[role="dialog"]')!;
    const name = dialog.querySelector<HTMLInputElement>('[aria-label="Query name"]')!;
    await expect.poll(() => document.activeElement).toBe(name);

    const shape = dialog.querySelector<HTMLButtonElement>('[aria-label="Data shape"]')!;
    await expect.poll(() => shape.textContent).toBe("Single object");
    shape.focus();
    await userEvent.keyboard(" ");
    const listbox = page.getByRole("listbox");
    await expect.element(listbox).toBeVisible();
    await expect.poll(() => document.activeElement?.textContent?.trim()).toBe("Single object");
    await userEvent.keyboard("{Escape}");
    await expect.element(listbox).not.toBeInTheDocument();
    await expect.poll(() => document.activeElement).toBe(shape);
    expect(dialog.open).toBe(true);
    await userEvent.click(shape);
    await listbox.getByRole("option", { name: "Device array" }).click();
    await expect.poll(() => shape.textContent).toBe("Device array");

    await userEvent.click(button(dialog, "Close query configuration"));
    await expect.element(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect.poll(() => host.querySelector('[role="dialog"]')).toBeNull();
    await openQueryDialog(host);
    const focusCase = host.querySelector<HTMLElement>('[role="dialog"]')!;
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
    draftName.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", isComposing: true, bubbles: true, cancelable: true
    }));
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
    const example = page.getByRole("textbox", { name: "Example JSON" });
    await example.fill('{"value":42}');
    await userEvent.keyboard("{Escape}");
    await page.getByRole("button", { name: "Keep editing" }).click();
    await expect.element(example).toHaveValue('{"value":42}');
    await expect.element(example).toHaveFocus();
    const queryName = page.getByRole("textbox", { name: "Query name" });
    await queryName.fill("");
    await userEvent.click(button(host, "Save query"));
    await expect.element(queryName).toHaveAccessibleDescription("Enter a query name.");
    expect(editor.getHistoryState()).toEqual(history);
    await queryName.fill("Saved query");
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
