import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { createApp, h, markRaw, type App } from "vue";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";
import "../src/styles.css";

const host = document.createElement("div");
const hierarchy = page.getByRole("region", { name: "Hierarchy" });
const assembly = hierarchy.getByRole("treeitem", { name: "Assembly" });
const robot = hierarchy.getByRole("treeitem", { name: "Robot" });
const light = hierarchy.getByRole("treeitem", { name: "Key light" });
const camera = hierarchy.getByRole("treeitem", { name: "Front view" });
let editor: ReturnType<typeof createEditor>;
let app: App;

beforeEach(() => {
  editor = createEditor();
  editor.dispatch({ type: "create-group", nodeId: "assembly", name: "Assembly" });
  editor.dispatch({ type: "import-glb", objectId: "robot", name: "Robot", asset: { id: "asset" }, parentId: "assembly" });
  editor.dispatch({ type: "add-light", light: { id: "light", name: "Key light", kind: "point" } });
  editor.dispatch({ type: "create-camera-view", view: { id: "front", name: "Front view" } });
  document.body.append(host);
  app = createApp({
    render: () => h(EditorWorkbench, {
      editor: markRaw(editor), locale: "en", rendererFactory: testRenderer, style: { "--ek-workbench-accent": "rgb(123, 45, 67)" }
    })
  });
  app.mount(host);
});

afterEach(() => {
  app.unmount();
  editor.dispose();
  host.remove();
});

it("browses and searches the scene tree without changing the Inspector target until selection", async () => {
  await robot.click();
  await expect.element(page.getByRole("spinbutton", { name: "Position X" })).toBeVisible();
  const before = editor.serialize();
  assembly.element().focus();
  await userEvent.keyboard("{ArrowLeft}{ArrowDown}");
  await expect.element(light).toHaveFocus();
  await expect.element(robot).not.toBeInTheDocument();
  await expect.element(page.getByRole("spinbutton", { name: "Position X" })).toBeVisible();
  expect(editor.serialize()).toEqual(before);
  await userEvent.keyboard("{ArrowUp}{ArrowRight}{ArrowDown}");
  await expect.element(robot).toHaveFocus();
  await expect.element(robot).toHaveAttribute("aria-selected", "true");
  await userEvent.keyboard("{ArrowDown}");
  light.element().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true }));
  await expect.element(light).toHaveAttribute("aria-selected", "false");
  await userEvent.keyboard("{Enter}");
  await expect.element(light).toHaveAttribute("aria-selected", "true");
  await expect.element(robot).toHaveAttribute("aria-selected", "false");
  await userEvent.keyboard("{Escape}");
  await expect.element(light).toHaveAttribute("aria-selected", "true");
  await expect.element(light).not.toHaveFocus();

  const search = hierarchy.getByRole("searchbox", { name: "Search hierarchy" });
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await search.click();
  await userEvent.keyboard("w");
  await expect.element(search).toHaveValue("w");
  expect(editor.transformMode.get()).toBe("rotate");
  await search.fill("robot");
  await expect.element(assembly).toBeVisible();
  await expect.element(robot).toBeVisible();
  await expect.element(camera).not.toBeInTheDocument();
  await search.fill("does not exist");
  await expect.element(hierarchy.getByRole("status")).toHaveTextContent("No matching nodes");
});

it("opens row actions from the pointer and keyboard, with capability and focus owned by the row", async () => {
  await robot.click();
  const before = editor.serialize();
  const cameraActions = page.getByRole("menu", { name: "Actions for Front view" });
  camera.element().focus();
  await userEvent.keyboard("{Shift>}{F10}{/Shift}");
  await expect.element(cameraActions).toHaveFocus();
  await expect.element(cameraActions.getByRole("menuitem", { name: "Delete" })).toHaveAccessibleDescription("Remove camera views from the inspector.");
  await userEvent.keyboard("{Escape}");
  await expect.element(cameraActions).not.toBeInTheDocument();
  await expect.element(camera).toHaveFocus();

  const lightActions = page.getByRole("menu", { name: "Actions for Key light" });
  light.element().focus();
  await userEvent.keyboard("{ContextMenu}");
  await expect.element(lightActions.getByRole("menuitem", { name: "Copy" })).toHaveFocus();
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  await expect.element(lightActions).not.toBeInTheDocument();
  await expect.element(hierarchy.getByRole("searchbox")).toHaveFocus();

  await hierarchy.getByRole("button", { name: "Actions for Key light" }).click();
  await expect.element(lightActions.getByRole("menuitem", { name: "Copy" })).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.element(light).toHaveFocus();
  await expect.element(lightActions).not.toBeInTheDocument();
  expect(editor.serialize()).toEqual(before);
  await page.getByRole("button", { name: "Node operations" }).click();
  const paste = page.getByRole("menuitem", { name: "Paste", exact: true });
  await expect.element(paste).not.toHaveAttribute("aria-disabled");
  await paste.click();
  const copiedLight = hierarchy.getByRole("treeitem", { name: "Key light", exact: true }).and(hierarchy.getByRole("treeitem", { selected: true }));
  await expect.element(copiedLight).toBeVisible();
  expect(Object.keys(editor.getSnapshot().lights)).toEqual(["light", "copy:light"]);
  expect(Object.keys(editor.getSnapshot().objects)).toEqual(["robot"]);
});

it("removes the row targeted by the menu and keeps keyboard navigation in the tree", async () => {
  await light.click();
  await hierarchy.getByRole("button", { name: "Actions for Robot" }).click();
  const actions = page.getByRole("menu", { name: "Actions for Robot" });
  await expect.element(light).toHaveAttribute("aria-selected", "true");
  await expect.element(actions.getByRole("menuitem", { name: "Delete" })).not.toHaveAttribute("aria-disabled");
  await actions.getByRole("menuitem", { name: "Delete" }).click();
  await expect.element(actions).not.toBeInTheDocument();
  await expect.element(robot).not.toBeInTheDocument();
  await expect.element(light).toHaveAttribute("aria-selected", "true");
  await expect.element(light).toHaveFocus();
  await userEvent.keyboard("{ArrowUp}");
  await expect.element(assembly).toHaveFocus();
});

function testRenderer(): RendererLike {
  return { domElement: document.createElement("canvas"), setSize() {}, render() {}, dispose() {} };
}
