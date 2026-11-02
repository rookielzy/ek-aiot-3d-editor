import { mount, type VueWrapper } from "@vue/test-utils";
import { markRaw, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";

describe("Vue data source workspace", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens an empty searchable data workspace without network access", async () => {
    const editor = createEditor();
    const wrapper = mountWorkbench(editor);
    await openDataPanel(wrapper);

    expect(wrapper.text()).toContain("Data sources");
    expect(wrapper.text()).toContain("No connections yet");
    expect(findButton(wrapper, "New connection")).toBeTruthy();
    expect(wrapper.find('[aria-label="Search connections"]').exists()).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(editor.getSnapshot().dataSources).toEqual({ connections: {}, queries: {}, bindings: {} });
    wrapper.unmount();
  });

  it("creates, edits, duplicates, deletes, and undoes connections through core history", async () => {
    const editor = createEditor();
    const wrapper = mountWorkbench(editor);
    await openDataPanel(wrapper);

    await createConnection(wrapper, "Plant API", "https://api.example.test/v1");
    const created = Object.values(editor.getSnapshot().dataSources.connections);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      name: "Plant API",
      baseUrl: "https://api.example.test/v1",
      auth: { kind: "none" }
    });
    expect(editor.getHistoryState()).toEqual({ undoCount: 1, redoCount: 0 });

    await clickButton(wrapper, "Edit Plant API");
    await setInput(wrapper, "Connection name", "Plant API v2");
    await setInput(wrapper, "Timeout (seconds)", "15");
    await clickButton(wrapper, "Save connection");

    expect(editor.getSnapshot().dataSources.connections[created[0].id]).toMatchObject({
      name: "Plant API v2",
      timeoutMs: 15_000
    });
    expect(editor.getHistoryState()).toEqual({ undoCount: 2, redoCount: 0 });
    expect(wrapper.text()).toContain("Connection updated. Undo to revert.");

    const connectionId = created[0].id;
    await clickButton(wrapper, "Duplicate Plant API v2");
    const duplicated = Object.values(editor.getSnapshot().dataSources.connections);
    expect(duplicated).toHaveLength(2);
    const copy = duplicated.find((connection) => connection.id !== connectionId);
    expect(copy?.name).toBe("Plant API v2 copy");
    expect(copy?.id).not.toBe(connectionId);
    expect(editor.getSnapshot().dataSources.queries).toEqual({});
    expect(editor.getHistoryState()).toEqual({ undoCount: 3, redoCount: 0 });
    expect(wrapper.text()).toContain("Duplicated as Plant API v2 copy.");

    await clickButton(wrapper, "Delete Plant API v2 copy");
    expect(Object.keys(editor.getSnapshot().dataSources.connections)).toEqual([connectionId]);
    expect(editor.getHistoryState()).toEqual({ undoCount: 4, redoCount: 0 });
    expect(wrapper.find('[aria-label="Edit Plant API v2 copy"]').exists()).toBe(false);

    editor.undo();
    await nextTick();
    await nextTick();
    expect(Object.keys(editor.getSnapshot().dataSources.connections)).toHaveLength(2);
    expect(wrapper.find('[aria-label="Edit Plant API v2 copy"]').exists()).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("rejects invalid drafts without history and reports the problems", async () => {
    const editor = createEditor();
    const wrapper = mountWorkbench(editor);
    await openDataPanel(wrapper);

    await clickButton(wrapper, "New connection");
    await clickButton(wrapper, "Save connection");

    expect(wrapper.text()).toContain("Enter a connection name.");
    expect(editor.getHistoryState()).toEqual({ undoCount: 0, redoCount: 0 });
    expect(editor.getSnapshot().dataSources.connections).toEqual({});

    await setInput(wrapper, "Connection name", "Plant API");
    await setInput(wrapper, "Service URL", "https://user:secret@api.example.test");
    await clickButton(wrapper, "Save connection");
    expect(wrapper.text()).toContain("Remove embedded credentials from the URL.");

    await setInput(wrapper, "Service URL", "https://api.example.test/v1");
    await setInput(wrapper, "Timeout (seconds)", "0");
    await clickButton(wrapper, "Save connection");
    expect(wrapper.text()).toContain("Enter a positive timeout.");
    expect(editor.getSnapshot().dataSources.connections).toEqual({});

    await setInput(wrapper, "Timeout (seconds)", "10");
    await clickButton(wrapper, "Save connection");
    expect(Object.values(editor.getSnapshot().dataSources.connections)).toHaveLength(1);
    expect(editor.getHistoryState()).toEqual({ undoCount: 1, redoCount: 0 });
    wrapper.unmount();
  });

  it("uses host credentials and keeps their labels durable-free", async () => {
    const editor = createEditor({
      credentials: [{ ref: "credential-host", label: "Host token", available: true }]
    });
    const wrapper = mountWorkbench(editor);
    await openDataPanel(wrapper);

    await clickButton(wrapper, "New connection");
    await setInput(wrapper, "Connection name", "Host API");
    await setInput(wrapper, "Service URL", "https://host.example.test");
    await setSelect(wrapper, "Authentication", "bearer");
    await setSelect(wrapper, "Credential", "credential-host");
    await clickButton(wrapper, "Save connection");

    expect(wrapper.text()).toContain("Credential: Host token");
    expect(JSON.stringify(editor.serialize())).not.toContain("Host token");
    wrapper.unmount();
  });

  it("round-trips millisecond timeouts when editing other fields", async () => {
    const editor = createEditor();
    const wrapper = mountWorkbench(editor);
    await openDataPanel(wrapper);

    await clickButton(wrapper, "New connection");
    await setInput(wrapper, "Connection name", "Fast API");
    await setInput(wrapper, "Service URL", "https://fast.example.test");
    await setInput(wrapper, "Timeout (seconds)", "0.005");
    await clickButton(wrapper, "Save connection");

    const saved = Object.values(editor.getSnapshot().dataSources.connections)[0];
    expect(saved.timeoutMs).toBe(5);

    await clickButton(wrapper, "Edit Fast API");
    expect(inputValue(wrapper, "Timeout (seconds)")).toBe("0.005");
    await setInput(wrapper, "Connection name", "Fast API v2");
    await clickButton(wrapper, "Save connection");

    expect(editor.getSnapshot().dataSources.connections[saved.id]).toMatchObject({
      name: "Fast API v2",
      timeoutMs: 5
    });
    wrapper.unmount();
  });

  it("authors public headers and rejects reserved authentication headers", async () => {
    const editor = createEditor();
    const wrapper = mountWorkbench(editor);
    await openDataPanel(wrapper);

    await clickButton(wrapper, "New connection");
    await setInput(wrapper, "Connection name", "Header API");
    await setInput(wrapper, "Service URL", "https://headers.example.test");
    await clickButton(wrapper, "Add header");
    await setInput(wrapper, "Header name 1", "X-Tenant");
    await setInput(wrapper, "Header value 1", "plant-1");
    await clickButton(wrapper, "Save connection");

    const saved = Object.values(editor.getSnapshot().dataSources.connections)[0];
    expect(saved.headers).toEqual({ "X-Tenant": "plant-1" });
    expect(editor.getHistoryState()).toEqual({ undoCount: 1, redoCount: 0 });

    await clickButton(wrapper, "Edit Header API");
    expect(inputValue(wrapper, "Header name 1")).toBe("X-Tenant");
    await setInput(wrapper, "Header name 1", "Authorization");
    await setInput(wrapper, "Header value 1", "Bearer secret");
    await clickButton(wrapper, "Save connection");

    expect(wrapper.text()).toContain("Authentication headers cannot be set as public or query headers.");
    expect(editor.getSnapshot().dataSources.connections[saved.id].headers).toEqual({ "X-Tenant": "plant-1" });
    expect(editor.getHistoryState()).toEqual({ undoCount: 1, redoCount: 0 });
    wrapper.unmount();
  });

  it("asks before discarding an unsaved draft", async () => {
    const editor = createEditor();
    const wrapper = mountWorkbench(editor);
    await openDataPanel(wrapper);

    await clickButton(wrapper, "New connection");
    await setInput(wrapper, "Connection name", "Draft connection");
    await clickButton(wrapper, "Cancel");

    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Discard unsaved changes?");
    expect(inputValue(wrapper, "Connection name")).toBe("Draft connection");

    await clickButton(wrapper, "Keep editing");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(inputValue(wrapper, "Connection name")).toBe("Draft connection");

    await clickButton(wrapper, "Cancel");
    await clickButton(wrapper, "Discard changes");
    expect(wrapper.find('[aria-label="Connection name"]').exists()).toBe(false);
    expect(editor.getHistoryState()).toEqual({ undoCount: 0, redoCount: 0 });
    expect(editor.getSnapshot().dataSources.connections).toEqual({});
    wrapper.unmount();
  });

  it("asks before row actions discard a dirty draft", async () => {
    const editor = createEditor();
    const wrapper = mountWorkbench(editor);
    await openDataPanel(wrapper);
    await createConnection(wrapper, "Existing API", "https://existing.example.test");

    await clickButton(wrapper, "Edit Existing API");
    await setInput(wrapper, "Connection name", "Changed name");
    await clickButton(wrapper, "Duplicate Existing API");

    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true);
    expect(editor.getHistoryState()).toEqual({ undoCount: 1, redoCount: 0 });

    await clickButton(wrapper, "Keep editing");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(inputValue(wrapper, "Connection name")).toBe("Changed name");

    await clickButton(wrapper, "Duplicate Existing API");
    await clickButton(wrapper, "Discard changes");
    expect(Object.keys(editor.getSnapshot().dataSources.connections)).toHaveLength(2);
    expect(wrapper.find('[aria-label="Connection name"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("saves legal offline configuration without host credentials", async () => {
    const editor = createEditor();
    const wrapper = mountWorkbench(editor);
    await openDataPanel(wrapper);

    await clickButton(wrapper, "New connection");
    await setInput(wrapper, "Connection name", "Offline API");
    await setInput(wrapper, "Service URL", "https://offline.example.test");
    await setSelect(wrapper, "Authentication", "bearer");
    expect(wrapper.text()).toContain(
      "The host provides no credentials. Save without authentication or configure credentials in the host."
    );
    await clickButton(wrapper, "Save connection");
    expect(wrapper.text()).toContain("Select a credential or disable authentication.");
    expect(editor.getSnapshot().dataSources.connections).toEqual({});

    await setSelect(wrapper, "Authentication", "none");
    await clickButton(wrapper, "Save connection");
    expect(Object.values(editor.getSnapshot().dataSources.connections)[0]?.auth).toEqual({ kind: "none" });
    wrapper.unmount();
  });

  it("filters connections and preserves search and draft state across view and locale switches", async () => {
    const editor = createEditor();
    const wrapper = mountWorkbench(editor, { locale: "en" });
    await openDataPanel(wrapper);
    await createConnection(wrapper, "Zone A", "https://zone-a.example.test");
    await createConnection(wrapper, "Zone B", "https://zone-b.example.test");

    await setInput(wrapper, "Search connections", "zone b");
    expect(wrapper.find('[aria-label="Edit Zone B"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Edit Zone A"]').exists()).toBe(false);

    await clickNavButton(wrapper, /^Scene \d/);
    await clickNavButton(wrapper, /^Data \d/);
    expect(inputValue(wrapper, "Search connections")).toBe("zone b");

    await clickButton(wrapper, "New connection");
    await setInput(wrapper, "Connection name", "Draft connection");

    await wrapper.setProps({ locale: "zh-CN" });
    await nextTick();
    expect(inputValue(wrapper, "连接名称")).toBe("Draft connection");

    await clickButton(wrapper, "取消");
    await clickButton(wrapper, "放弃修改");
    expect(Object.keys(editor.getSnapshot().dataSources.connections)).toHaveLength(2);
    wrapper.unmount();
  });
});

export function mountWorkbench(
  editor: ReturnType<typeof createEditor>,
  props: Record<string, unknown> = {}
): VueWrapper {
  return mount(EditorWorkbench, {
    props: { editor: markRaw(editor), rendererFactory: fakeRenderer, locale: "en", ...props },
    attachTo: document.body
  });
}

export async function openDataPanel(wrapper: VueWrapper): Promise<void> {
  await clickNavButton(wrapper, /^Data \d/);
}

async function clickNavButton(wrapper: VueWrapper, name: RegExp): Promise<void> {
  const navigation = wrapper.get('[aria-label="Workspace views"]');
  const button = navigation.findAll("button").find((candidate) => name.test((candidate.attributes("aria-label") ?? "").trim()));
  if (!button) {
    throw new Error(`Navigation button ${name} not found`);
  }
  await button.trigger("click");
  await settle();
}

async function createConnection(wrapper: VueWrapper, name: string, baseUrl: string): Promise<void> {
  await clickButton(wrapper, "New connection");
  await setInput(wrapper, "Connection name", name);
  await setInput(wrapper, "Service URL", baseUrl);
  await clickButton(wrapper, "Save connection");
  await findByLabel(wrapper, `Edit ${name}`);
}

function findButton(wrapper: VueWrapper, label: string) {
  return wrapper.findAll("button").find((button) => button.attributes("aria-label") === label || button.text().trim() === label);
}

async function clickButton(wrapper: VueWrapper, label: string): Promise<void> {
  const button = findButton(wrapper, label);
  if (!button) {
    throw new Error(`Button "${label}" not found. Buttons: ${wrapper.findAll("button").map((item) => item.text().trim()).join(" | ")}`);
  }
  await button.trigger("click");
  await settle();
}

async function findByLabel(wrapper: VueWrapper, label: string): Promise<void> {
  await settle();
  if (wrapper.find(`[aria-label="${label}"]`).exists()) {
    return;
  }
  throw new Error(`Element "${label}" not found`);
}

async function setInput(wrapper: VueWrapper, label: string, value: string): Promise<void> {
  const input = wrapper.get(`[aria-label="${label}"]`);
  await input.setValue(value);
  await settle();
}

async function setSelect(wrapper: VueWrapper, label: string, value: string): Promise<void> {
  const select = wrapper.get(`[aria-label="${label}"]`);
  await select.setValue(value);
  await settle();
}

function inputValue(wrapper: VueWrapper, label: string): string {
  return (wrapper.get(`[aria-label="${label}"]`).element as HTMLInputElement).value;
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
