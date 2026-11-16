import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { createApp, h, markRaw, type App } from "vue";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";
import "../src/styles.css";

const host = document.createElement("div");
let editor: ReturnType<typeof createEditor>;
let app: App;

beforeEach(() => {
  editor = createSeedEditor();
  document.body.append(host);
  app = createApp({
    render: () => h(EditorWorkbench, {
      editor: markRaw(editor),
      locale: "en",
      rendererFactory: fakeRenderer
    })
  });
  app.mount(host);
});

afterEach(() => {
  app.unmount();
  editor.dispose();
  host.remove();
});

it("keeps the binding draft behind confirmation and locates the object from the dialog", async () => {
  await page.getByRole("button", { name: /^Data / }).click();
  const manage = page.getByRole("button", { name: "Manage bindings for Pump status" });
  await manage.click();

  const dialog = page.getByRole("dialog", { name: "Bindings for Pump status" });
  await expect.element(dialog).toBeVisible();
  await expect.poll(() => dialog.element().getBoundingClientRect().width)
    .toBeGreaterThan(Math.min(600, window.innerWidth - 64));
  const device = dialog.getByRole("textbox", { name: "Device ID" });
  await device.fill("pump-draft");
  await userEvent.keyboard("{Escape}");
  const prompt = dialog.getByRole("alertdialog", { name: "Discard binding changes?" });
  await expect.element(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "Keep editing" }).click();
  await expect.element(device).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await prompt.getByRole("button", { name: "Discard changes" }).click();
  await expect.element(dialog).not.toBeInTheDocument();
  expect(editor.getSnapshot().dataSources.bindings["object-a"]!.deviceId).toBe("pump-01");

  await manage.click();
  const reopened = page.getByRole("dialog", { name: "Bindings for Pump status" });
  await reopened.getByRole("button", { name: "Locate Pump object in the scene" }).click();
  await expect.element(reopened).not.toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: /^Scene / })).toHaveAttribute("aria-pressed", "true");
  await expect.element(page.getByRole("treeitem", { name: "Pump object" })).toHaveAttribute("aria-selected", "true");
});

function createSeedEditor() {
  const next = createEditor();
  const connection = next.dispatch({
    type: "create-data-connection",
    connection: {
      id: "connection-a",
      name: "Plant API",
      baseUrl: "https://api.example.test/v1",
      auth: { kind: "none" },
      headers: {},
      timeoutMs: 10_000
    }
  });
  if (!connection.ok) throw new Error(connection.error);
  const query = buildSaveDataQueryCommand(next.getSnapshot(), {
    id: "query-a",
    connectionId: "connection-a",
    name: "Pump status",
    path: "/pumps",
    parameters: [],
    mapping: {
      mode: "single",
      root: [],
      identity: { kind: "literal", value: "pump-01" },
      displayName: [{ kind: "key", key: "name" }],
      properties: [{
        key: "temperature",
        label: "Temperature",
        type: "number",
        nullable: false,
        unit: "C",
        source: [{ kind: "key", key: "temperature" }],
        transform: { kind: "raw" },
        range: null,
        allowed: null
      }],
      observedAt: null,
      sourceQuality: null
    }
  });
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  if (!next.dispatch(query.command).ok) throw new Error("Failed to save query");
  const imported = next.dispatch({ type: "import-glb", objectId: "object-a", name: "Pump object", asset: { id: "asset-a" } });
  if (!imported.ok) throw new Error(imported.error);
  const binding = buildSaveDataObjectBindingCommand(next.getSnapshot(), {
    objectNodeId: "object-a",
    queryId: "query-a",
    deviceId: "pump-01",
    enabled: true,
    details: [{ key: "temperature" }],
    color: null
  });
  if (!binding.ok) throw new Error(binding.problems.map((problem) => problem.message).join("\n"));
  if (!next.dispatch(binding.command).ok) throw new Error("Failed to save binding");
  return next;
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return { domElement: container.ownerDocument.createElement("canvas"), setSize() {}, render() {}, dispose() {} };
}
