import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { createApp, h, markRaw, type App } from "vue";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";
import "../src/styles.css";

const host = document.createElement("div");
const project = page.getByRole("button", { name: "Project menu", exact: true });
const helpers = page.getByRole("button", { name: "Viewport helpers", exact: true });
let editor: ReturnType<typeof createEditor>;
let app: App;

beforeEach(async () => {
  editor = createEditor();
  document.body.append(host);
  app = createApp({
    render: () => h(EditorWorkbench, {
      editor: markRaw(editor), locale: "en", rendererFactory: fakeRenderer, style: { "--ek-workbench-text": "#24365d" }
    }, {
      toolbar: () => h("input", { "aria-label": "Host notes" })
    })
  });
  app.mount(host);
  await expect.element(project).toBeVisible();
});

afterEach(() => {
  app.unmount();
  editor.dispose();
  host.remove();
});

it("reaches both project export commands from the keyboard and restores focus on Escape", async () => {
  project.element().focus();
  await userEvent.keyboard("{Enter}");
  const menu = page.getByRole("menu", { name: "Project actions" });
  await expect.element(menu.getByRole("menuitem", { name: "Open", exact: true })).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(menu.getByRole("menuitem", { name: "Export", exact: true })).toHaveFocus();
  await userEvent.keyboard("{End}");
  const partial = menu.getByRole("menuitem", { name: "Export partial", exact: true });
  await expect.element(partial).toHaveFocus();
  await userEvent.keyboard("{Home}{ArrowUp}");
  await expect.element(partial).toHaveFocus();
  let escapedToHost = false;
  const onHostKey = (event: KeyboardEvent) => { if (event.key === "Escape") escapedToHost = true; };
  document.addEventListener("keydown", onHostKey);
  try {
    await userEvent.keyboard("{Escape}");
    expect(escapedToHost).toBe(false);
  } finally {
    document.removeEventListener("keydown", onHostKey);
  }
  await expect.element(menu).not.toBeInTheDocument();
  await expect.element(project).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}{Tab}");
  await expect.element(menu).not.toBeInTheDocument();
  await expect.element(page.getByRole("combobox", { name: "Language" })).toHaveFocus();
});

it("keeps helper toggles open and dismisses the menu without changing the scene selection", async () => {
  expect(editor.dispatch({ type: "create-group", nodeId: "assembly", name: "Assembly" }).ok).toBe(true);
  expect(editor.dispatch({ type: "select-nodes", nodeIds: ["assembly"], mode: "replace" }).ok).toBe(true);
  const before = editor.serialize();
  await helpers.click();
  const menu = page.getByRole("menu", { name: "Viewport helpers" });
  const grid = menu.getByRole("menuitemcheckbox", { name: "Grid", exact: true });
  const initial = editor.viewportHelpers.get().visibility.grid;
  await grid.click();
  await expect.element(grid).toHaveAttribute("aria-checked", String(!initial));
  await userEvent.keyboard("{Enter}");
  await expect.element(grid).toHaveAttribute("aria-checked", String(initial));
  const all = menu.getByRole("menuitemcheckbox", { name: "All helpers" });
  await all.click();
  await expect.element(all).toHaveAttribute("aria-checked", "true");
  expect(Object.values(editor.viewportHelpers.get().visibility).every(Boolean)).toBe(true);
  await all.click();
  await expect.element(all).toHaveAttribute("aria-checked", "false");
  expect(Object.values(editor.viewportHelpers.get().visibility).some(Boolean)).toBe(false);
  await userEvent.keyboard("{Escape}");
  await expect.element(menu).not.toBeInTheDocument();
  await expect.element(helpers).toHaveFocus();
  expect(editor.serialize()).toEqual(before);
});

it("keeps menus within the viewport, closes on outside input and isolates scene shortcuts", async () => {
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await helpers.click();
  const menu = page.getByRole("menu", { name: "Viewport helpers" });
  await expect.element(menu).toBeVisible();
  await userEvent.keyboard("w");
  expect(editor.transformMode.get()).toBe("rotate");
  await expect.poll(() => {
    const bounds = menu.element().getBoundingClientRect();
    const viewport = page.getByRole("region", { name: "3D viewport" }).element().getBoundingClientRect();
    return bounds.left >= viewport.left && bounds.right <= viewport.right && bounds.top >= viewport.top && bounds.bottom <= viewport.bottom;
  }).toBe(true);
  expect(getComputedStyle(menu.element()).color).toBe("rgb(36, 54, 93)");
  const notes = page.getByRole("textbox", { name: "Host notes" });
  await notes.click();
  await userEvent.keyboard("write");
  await expect.element(notes).toHaveValue("write");
  await expect.element(menu).not.toBeInTheDocument();
  const rotate = page.getByRole("button", { name: "Rotate", exact: true });
  rotate.element().focus();
  rotate.element().dispatchEvent(new KeyboardEvent("keydown", { key: "w", bubbles: true, isComposing: true }));
  await expect.element(rotate).toHaveAttribute("aria-pressed", "true");
});

it("runs a one-time command, returns focus and exposes disabled reasons and shortcuts", async () => {
  const trigger = page.getByRole("button", { name: "Node operations", exact: true });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Node operations" });
  const remove = menu.getByRole("menuitem", { name: "Delete", exact: true });
  await expect.element(remove).toHaveAttribute("aria-disabled", "true");
  await expect.element(remove).toHaveAccessibleDescription("Select a node first.");
  await expect.element(remove).toHaveAttribute("aria-keyshortcuts", "Delete Backspace");
  await userEvent.keyboard("{Escape}");
  await expect.element(trigger).toHaveFocus();

  expect(editor.dispatch({ type: "create-group", nodeId: "assembly", name: "Assembly" }).ok).toBe(true);
  expect(editor.dispatch({ type: "select-nodes", nodeIds: ["assembly"], mode: "replace" }).ok).toBe(true);
  await userEvent.keyboard("{ArrowDown}");
  const clear = menu.getByRole("menuitem", { name: "Clear", exact: true });
  await userEvent.keyboard("{End}");
  await expect.element(clear).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.element(menu).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
  expect(editor.getSnapshot().selection.nodeIds).toEqual([]);
});

it("closes an open menu before the Problems drawer and restores each trigger's focus", async () => {
  expect(editor.dispatch({ type: "create-group", nodeId: "assembly", name: "Assembly" }).ok).toBe(true);
  expect(editor.dispatch({ type: "select-nodes", nodeIds: ["assembly"], mode: "replace" }).ok).toBe(true);
  const problems = page.getByRole("button", { name: "Problem details", exact: true });
  await problems.click();
  const drawer = page.getByRole("region", { name: "Problem details" });
  await expect.element(drawer).toBeVisible();
  await helpers.click();
  await expect.element(page.getByRole("menu", { name: "Viewport helpers" })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(helpers).toHaveFocus();
  await expect.element(drawer).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(drawer).not.toBeInTheDocument();
  await expect.element(problems).toHaveFocus();
  expect(editor.getSnapshot().selection.nodeIds).toEqual(["assembly"]);
});

function fakeRenderer(): RendererLike {
  return { domElement: document.createElement("canvas"), setSize() {}, render() {}, dispose() {} };
}
