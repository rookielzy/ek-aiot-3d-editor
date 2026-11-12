import React from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

// Draft protection in the real workbench. Runs on every configured browser
// instance, including the spec's review sizes (1440×900, 1920×1080,
// 1100×800) and the existing boundary and mobile viewports.
it("asks before discarding an edited query draft and keeps it when asked", async () => {
  const editor = createEditor();
  editor.dispatch({
    type: "create-data-connection",
    connection: {
      id: "c",
      name: "Plant API",
      baseUrl: "https://api.example.test/v1",
      auth: { kind: "none" },
      headers: {},
      timeoutMs: 10_000
    }
  });
  editor.dispatch({
    type: "create-data-query",
    query: {
      id: "q",
      connectionId: "c",
      name: "Query",
      path: "/pumps",
      parameters: [{ name: "region", type: "string", defaultValue: "north" }],
      mapping: {
        mode: "single",
        root: [],
        identity: { kind: "literal", value: "001" },
        displayName: null,
        properties: [
          {
            key: "value",
            label: "Value",
            type: "number",
            nullable: false,
            unit: null,
            source: [{ kind: "key", key: "value" }],
            transform: { kind: "raw" },
            range: null,
            allowed: null
          }
        ],
        observedAt: null,
        sourceQuality: null
      }
    }
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<EditorWorkbench editor={editor} locale="en" rendererFactory={fakeRenderer} rightPanel={() => null} />);

  try {
    await expect
      .poll(() => host.querySelector('[aria-label="Workspace views"] button[aria-label^="Data "]'))
      .toBeTruthy();
    await userEvent.click(host.querySelector('[aria-label="Workspace views"] button[aria-label^="Data "]')!);
    const editQuery = () => button(host, "Edit query Query");

    await userEvent.click(editQuery());
    await expect.poll(() => host.querySelector('dialog[aria-label="Query configuration"]')).toBeTruthy();
    const dialog = host.querySelector<HTMLDialogElement>('dialog[aria-label="Query configuration"]')!;
    const name = dialog.querySelector<HTMLInputElement>('[aria-label="Query name"]');
    if (!name) throw new Error("Expected the query name field");
    await userEvent.fill(name, "Edited query");
    const history = editor.getHistoryState();

    // Closing an edited draft asks first; keeping it preserves the edit.
    await userEvent.click(button(dialog, "Close query configuration"));
    const prompt = await waitForElement<HTMLElement>(dialog, '[role="alertdialog"]');
    expect(prompt.textContent).toContain("Discard unsaved query?");
    await userEvent.click(button(prompt, "Keep editing"));
    await expect.poll(() => dialog.querySelector('[role="alertdialog"]')).toBeNull();
    expect(name.value).toBe("Edited query");
    await expect.poll(() => document.activeElement).toBe(name);
    expect(host.querySelector('dialog[aria-label="Query configuration"]')).toBe(dialog);

    // Escape follows the same path: the prompt asks, and discarding closes the
    // dialog without touching the durable snapshot.
    await userEvent.keyboard("{Escape}");
    const escapePrompt = await waitForElement<HTMLElement>(dialog, '[role="alertdialog"]');
    await userEvent.click(button(escapePrompt, "Discard changes"));
    await expect.poll(() => host.querySelector('dialog[aria-label="Query configuration"]')).toBeNull();
    expect(document.activeElement).toBe(editQuery());
    expect(editor.getHistoryState()).toEqual(history);
    expect(editor.getSnapshot().dataSources.queries.q.name).toBe("Query");

    const beforeOverrides = editor.serialize();
    await userEvent.click(editQuery());
    await page.getByRole("checkbox", { name: "Override parameter 1" }).click();
    const testValue = page.getByRole("textbox", { name: "Parameter 1 test value" });
    await testValue.fill("south");
    await userEvent.keyboard("{Escape}");
    await page.getByRole("button", { name: "Keep editing" }).click();
    await expect.element(testValue).toHaveValue("south");
    await expect.element(testValue).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect.element(page.getByRole("dialog", { name: "Query configuration" })).not.toBeInTheDocument();
    expect(editor.serialize()).toEqual(beforeOverrides);
    expect(editor.getHistoryState()).toEqual(history);
  } finally {
    root.unmount();
    editor.dispose();
    host.remove();
  }
}, 30_000);

async function waitForElement<T extends HTMLElement>(host: ParentNode, selector: string): Promise<T> {
  await expect.poll(() => host.querySelector(selector)).toBeTruthy();
  const element = host.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element ${selector}`);
  return element;
}

function button(host: ParentNode, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.getAttribute("aria-label") === label || candidate.textContent?.trim() === label
  );
  if (!found) throw new Error(`Expected button ${label}`);
  return found;
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return { domElement: container.ownerDocument.createElement("canvas"), setSize() {}, render() {}, dispose() {} };
}
