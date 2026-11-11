import { createEditor } from "@ek-aiot/3d-editor-core";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeEach, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

const editor = createEditor();
const host = document.createElement("div");
const root = createRoot(host);

afterAll(() => {
  root.unmount();
  editor.dispose();
});

beforeEach(async () => {
  document.body.append(host);
  root.render(<EditorWorkbench editor={editor} locale="en" style={{ height: "100vh" }}
    rightPanel={() => <input aria-label="Host notes" />} />);
  await expect.element(page.getByRole("button", { name: "Project menu", exact: true })).toBeVisible();
});

afterEach(async () => {
  root.render(null);
  await expect.element(page.getByRole("button", { name: "Project menu", exact: true })).not.toBeInTheDocument();
  host.remove();
});

it("dismisses a pointer-opened viewport menu and allows typing in the host panel", async () => {
  await page.getByRole("button", { name: "Viewport helpers", exact: true }).click();
  await expect.element(page.getByRole("menu", { name: "Viewport helpers" })).toBeVisible();
  await page.getByRole("textbox", { name: "Host notes" }).click();
  await userEvent.keyboard("editable");
  await expect.element(page.getByRole("textbox", { name: "Host notes" })).toHaveValue("editable");
  await expect.element(page.getByRole("menu", { name: "Viewport helpers" })).not.toBeInTheDocument();
  expect(editor.transformMode.get()).toBe("translate");
});

it("reaches both project export commands using keyboard navigation", async () => {
  page.getByRole("button", { name: "Project menu", exact: true }).element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByRole("menuitem", { name: "Open", exact: true })).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(page.getByRole("menuitem", { name: "Export", exact: true })).toHaveFocus();
  await userEvent.keyboard("{End}");
  await expect.element(page.getByRole("menuitem", { name: "Export partial", exact: true })).toHaveFocus();
  await userEvent.keyboard("{Home}{ArrowUp}");
  await expect.element(page.getByRole("menuitem", { name: "Export partial", exact: true })).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("button", { name: "Project menu", exact: true })).toHaveFocus();
});

it("keeps helper toggles usable when switching from pointer to keyboard", async () => {
  const initial = editor.viewportHelpers.get().visibility.grid;
  await page.getByRole("button", { name: "Viewport helpers", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Grid", exact: true }).click();
  expect(editor.viewportHelpers.get().visibility.grid).toBe(!initial);
  await userEvent.keyboard("{Enter}");
  expect(editor.viewportHelpers.get().visibility.grid).toBe(initial);
  await userEvent.keyboard(" ");
  expect(editor.viewportHelpers.get().visibility.grid).toBe(!initial);
  await expect.element(page.getByRole("menu", { name: "Viewport helpers" })).toBeVisible();
});
