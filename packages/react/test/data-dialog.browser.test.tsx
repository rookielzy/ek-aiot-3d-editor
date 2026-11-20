import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

// Acceptance sizes come from vitest.browser.config.ts (1440x900, 1920x1080,
// 1100x800) plus the pre-existing instances. Geometry assertions are scoped to
// widths at or above the smallest required acceptance size so the mobile
// instance keeps passing while the real sizes are checked strictly.
const MIN_ACCEPTANCE_WIDTH = 1100;

beforeEach(() => {
  window.localStorage.removeItem("ek-aiot.workbench.locale");
});

afterEach(() => {
  document.body.innerHTML = "";
});

it("keeps the connection dialog usable, focused, and draft-safe in the real workbench", async () => {
  const editor = createEditor();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<EditorWorkbench editor={editor} locale="en" rendererFactory={fakeRenderer} rightPanel={() => null} />);

  try {
    await expect.poll(() => host.querySelector('[aria-label="Workspace views"] button[aria-label^="Data "]')).toBeTruthy();
    await userEvent.click(host.querySelector('[aria-label="Workspace views"] button[aria-label^="Data "]')!);
    const newButton = button(host, "New connection");
    await userEvent.click(newButton);

    const dialog = host.querySelector<HTMLDialogElement>('dialog[aria-label="New connection"]')!;
    expect(dialog.open).toBe(true);
    // The dialog must own enough room for a longer flow without clipping.
    const box = dialog.getBoundingClientRect();
    expect(box.width).toBeGreaterThan(Math.min(600, window.innerWidth - 64));
    expect(box.bottom).toBeLessThanOrEqual(window.innerHeight + 1);

    const name = dialog.querySelector<HTMLInputElement>('[aria-label="Connection name"]')!;
    await expect.poll(() => document.activeElement).toBe(name);
    // Record the rendered dialog for review; screenshots are refreshed on each run.
    await page.screenshot({
      path: `__screenshots__/data-dialog.browser.test.tsx/connection-dialog-${window.innerWidth}x${window.innerHeight}.png`
    });

    // Sections are labelled groups so the longer flow stays scannable.
    const groups = [...dialog.querySelectorAll<HTMLElement>("fieldset, [role='group']")]
      .map((group) => group.getAttribute("aria-label") ?? group.querySelector("legend")?.textContent ?? null);
    expect(groups).toEqual(expect.arrayContaining(["Connection", "Authentication settings", "Public headers"]));
    const scene = host.querySelector<HTMLButtonElement>('[aria-label="Workspace views"] button[aria-label^="Scene "]')!;
    scene.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);
    // Typing then Escape asks before throwing the draft away.
    await userEvent.fill(name, "Draft connection");
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => dialog.querySelector('[role="alertdialog"]')).toBeTruthy();
    const keep = button(dialog, "Keep editing");
    await expect.poll(() => document.activeElement).toBe(keep);
    await userEvent.click(keep);
    await expect.poll(() => dialog.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(name);
    expect(name.value).toBe("Draft connection");

    // Escape on an untouched dialog closes it and returns focus to the trigger.
    await userEvent.fill(name, "");
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => host.querySelector('dialog[aria-label="New connection"]')).toBeNull();
    expect(document.activeElement).toBe(newButton);
    expect(editor.getHistoryState()).toEqual({ undoCount: 0, redoCount: 0 });

    // Invalid input keeps field errors next to the field and overall problems visible.
    await userEvent.click(newButton);
    const reopened = host.querySelector<HTMLDialogElement>('dialog[aria-label="New connection"]')!;
    await userEvent.fill(reopened.querySelector<HTMLInputElement>('[aria-label="Connection name"]')!, "Broken API");
    const url = reopened.querySelector<HTMLInputElement>('[aria-label="Service URL"]')!;
    await userEvent.fill(url, "https://user:secret@api.example.test");
    await userEvent.click(button(reopened, "Save connection"));
    await expect.poll(() => url.getAttribute("aria-invalid")).toBe("true");
    expect(reopened.querySelector('[role="alert"]')).toBeTruthy();
    expect(document.activeElement).toBe(url);
    expect(editor.getSnapshot().dataSources.connections).toEqual({});
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => reopened.querySelector('[role="alertdialog"]')).toBeTruthy();
    await userEvent.click(button(reopened, "Keep editing"));
    expect(document.activeElement).toBe(url);
  } finally {
    root.unmount();
    editor.dispose();
    host.remove();
  }
}, 20_000);

it("keeps the request tester modal, draft-safe, and returns focus to its row trigger", async () => {
  await withWorkbench("en", async ({ editor, host }) => {
    await openDataPanel(host, EN);
    await createConnection(host, EN, "Plant API", "https://api.example.test/v1");
    const before = editor.getSnapshot();
    const trigger = button(host, EN.testAria("Plant API"));
    await userEvent.click(trigger);

    const dialog = await waitForDialog(host, EN.requestLabel);
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.querySelector("h3")?.textContent).toContain("Plant API");
    const path = requireElement<HTMLInputElement>(dialog, `[aria-label="${EN.requestPath}"]`);
    await expect.poll(() => document.activeElement).toBe(path);

    // The tester groups its fields into visible, laid out sections.
    for (const section of [EN.requestConnection, EN.requestSection, EN.requestResult]) {
      const group = requireElement<HTMLElement>(dialog, `section[role="group"][aria-label="${section}"]`);
      const rect = group.getBoundingClientRect();
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }
    if (window.innerWidth >= MIN_ACCEPTANCE_WIDTH) {
      const box = dialog.getBoundingClientRect();
      expect(box.width).toBeGreaterThan(Math.min(600, window.innerWidth - 64));
      expect(box.bottom).toBeLessThanOrEqual(window.innerHeight + 1);
      expect(box.right).toBeLessThanOrEqual(window.innerWidth + 1);
    }
    await page.screenshot({
      path: `__screenshots__/data-dialog.browser.test.tsx/request-tester-${window.innerWidth}x${window.innerHeight}.png`
    });

    // The panel behind the modal cannot take focus while it is up.
    const scene = requireElement<HTMLButtonElement>(host, `[aria-label="${EN.nav}"] button[aria-label^="Scene "]`);
    scene.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);
    path.focus();
    expect(document.activeElement).toBe(path);
    await userEvent.fill(path, "https://elsewhere.example.test/devices");
    await userEvent.click(button(dialog, "Run request"));
    await expect.element(page.getByRole("textbox", { name: EN.requestPath }))
      .toHaveAccessibleDescription("Use a relative path, not an absolute URL.");
    await expect.element(page.getByRole("group", { name: EN.requestResult })).toHaveTextContent("Failed");
    await userEvent.fill(path, "/devices/plant-1");
    // A typed draft survives the discard prompt: Escape asks, keeping edits
    // returns focus to the draft, and only "Discard changes" closes the modal.
    await userEvent.keyboard("{Escape}");
    const prompt = await waitForElement<HTMLElement>(dialog, '[role="alertdialog"]');
    expect(prompt.textContent).toContain(EN.discardTitle);
    // The panel behind is inert while the prompt is up, so the prompt's own
    // controls own the tab order.
    const keep = button(prompt, EN.keepEditing);
    const discard = button(prompt, EN.discardChanges);
    await expect.poll(() => document.activeElement).toBe(keep);
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(discard);
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(keep);
    await userEvent.click(keep);
    await expect.poll(() => dialog.querySelector('[role="alertdialog"]')).toBeNull();
    expect(path.value).toBe("/devices/plant-1");
    await expect.poll(() => document.activeElement).toBe(path);

    await userEvent.click(button(dialog, EN.closeRequest));
    const closePrompt = await waitForElement<HTMLElement>(dialog, '[role="alertdialog"]');
    await userEvent.click(button(closePrompt, EN.discardChanges));
    await expect.poll(() => host.querySelector(`dialog[aria-label="${EN.requestLabel}"]`)).toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger);
    expect(editor.getSnapshot().dataSources).toEqual(before.dataSources);
  });
}, 30_000);

it("keeps standard endpoint configuration inside the viewport without mapping fields", async () => {
  await withWorkbench("en", async ({ editor, host }) => {
    await openDataPanel(host, EN);
    await createConnection(host, EN, "Plant API", "https://api.example.test/v1");
    const before = editor.getSnapshot();
    expect(findButton(host, "New query for Plant API")).toBeFalsy();
    await userEvent.click(button(host, EN.realtimeAria("Plant API")));

    const dialog = await waitForDialog(host, EN.realtimeLabel);
    expect(dialog.open).toBe(true);
    const sections = [...dialog.querySelectorAll<HTMLElement>("[role='group']")];
    const labels = sections.map((section) => section.getAttribute("aria-label"));
    expect(labels).toEqual(["Connection", "Request", "Test result"]);
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }
    if (window.innerWidth >= MIN_ACCEPTANCE_WIDTH) {
      const box = dialog.getBoundingClientRect();
      expect(box.bottom).toBeLessThanOrEqual(window.innerHeight + 1);
      expect(box.right).toBeLessThanOrEqual(window.innerWidth + 1);
    }
    await userEvent.click(button(dialog, EN.closeRequest));
    await expect.poll(() => host.querySelector(`dialog[aria-label="${EN.realtimeLabel}"]`)).toBeNull();
    await expect.poll(() => document.activeElement).toBe(button(host, EN.realtimeAria("Plant API")));
    expect(editor.getSnapshot().dataSources.queries).toEqual(before.dataSources.queries);
  });
}, 30_000);

it("keeps connection editing and the request tester usable with a long unbroken name", async () => {
  const longName = "PlantApi".repeat(15);
  expect(longName).toHaveLength(120);

  await withWorkbench("en", async ({ host }) => {
    await openDataPanel(host, EN);
    await createConnection(host, EN, longName, "https://api.example.test/v1");
    await userEvent.click(button(host, `Edit ${longName}`));

    const dialog = await waitForDialog(host, EN.editTitle);
    const name = requireElement<HTMLInputElement>(dialog, `[aria-label="${EN.connectionName}"]`);
    expect(name.value).toBe(longName);
    await page.screenshot({
      path: `__screenshots__/data-dialog.browser.test.tsx/connection-dialog-long-name-${window.innerWidth}x${window.innerHeight}.png`
    });

    if (window.innerWidth >= MIN_ACCEPTANCE_WIDTH) {
      const box = dialog.getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(window.innerWidth + 1);
      expect(box.bottom).toBeLessThanOrEqual(window.innerHeight + 1);
      // A long label must wrap or truncate inside the dialog, never widen it.
      expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth + 1);
    }

    await userEvent.keyboard("{Escape}");
    await expect.poll(() => host.querySelector(`dialog[aria-label="${EN.editTitle}"]`)).toBeNull();
    await expect.poll(() => document.activeElement).toBe(button(host, `Edit ${longName}`));

    const trigger = button(host, EN.testAria(longName));
    await userEvent.click(trigger);
    const tester = await waitForDialog(host, EN.requestLabel);
    const close = button(tester, EN.closeRequest);
    expect(close.getBoundingClientRect().right).toBeLessThanOrEqual(tester.getBoundingClientRect().right);
    await userEvent.click(close);
    await expect.poll(() => document.activeElement).toBe(trigger);
  });
}, 30_000);

it("localizes the connection, request tester, and standard endpoint dialogs in zh-CN", async () => {
  const connectionName = "车间接口";

  await withWorkbench("zh-CN", async ({ host }) => {
    await openDataPanel(host, ZH);
    await userEvent.click(button(host, ZH.newConnection));

    const connectionDialog = await waitForDialog(host, ZH.createTitle);
    expectLocalized(connectionDialog);
    await userEvent.fill(requireElement(connectionDialog, `[aria-label="${ZH.connectionName}"]`), connectionName);
    await userEvent.fill(requireElement(connectionDialog, `[aria-label="${ZH.baseUrl}"]`), "https://api.example.test/v1");
    await page.screenshot({
      path: `__screenshots__/data-dialog.browser.test.tsx/connection-dialog-zh-${window.innerWidth}x${window.innerHeight}.png`
    });
    await userEvent.click(button(connectionDialog, ZH.save));
    await expect.poll(() => host.querySelector(`dialog[aria-label="${ZH.createTitle}"]`)).toBeNull();
    await expect.poll(() => findButton(host, ZH.testAria(connectionName))).toBeTruthy();

    await userEvent.click(button(host, ZH.testAria(connectionName)));
    const testerDialog = await waitForDialog(host, ZH.requestLabel);
    expectLocalized(testerDialog);
    expect(testerDialog.querySelector("h3")?.textContent).toContain(connectionName);
    const path = requireElement<HTMLInputElement>(testerDialog, `[aria-label="${ZH.requestPath}"]`);
    await expect.poll(() => document.activeElement).toBe(path);
    await page.screenshot({
      path: `__screenshots__/data-dialog.browser.test.tsx/request-tester-zh-${window.innerWidth}x${window.innerHeight}.png`
    });
    await userEvent.click(button(testerDialog, ZH.closeRequest));
    await expect.poll(() => host.querySelector(`dialog[aria-label="${ZH.requestLabel}"]`)).toBeNull();

    await userEvent.click(button(host, ZH.realtimeAria(connectionName)));
    const endpointDialog = await waitForDialog(host, ZH.realtimeLabel);
    expectLocalized(endpointDialog);
    expect(endpointDialog.querySelector("h3")?.textContent).toContain(connectionName);
    await userEvent.click(button(endpointDialog, ZH.closeRequest));
    await expect.poll(() => host.querySelector(`dialog[aria-label="${ZH.realtimeLabel}"]`)).toBeNull();
  });
}, 30_000);

type Workbench = {
  editor: ReturnType<typeof createEditor>;
  host: HTMLDivElement;
  root: Root;
};

async function withWorkbench(
  locale: "en" | "zh-CN",
  run: (workbench: Workbench) => Promise<void>
): Promise<void> {
  const editor = createEditor();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<EditorWorkbench editor={editor} locale={locale} rendererFactory={fakeRenderer} rightPanel={() => null} />);
  try {
    await run({ editor, host, root });
  } finally {
    root.unmount();
    editor.dispose();
    host.remove();
  }
}

type Copy = {
  nav: string;
  dataPrefix: string;
  newConnection: string;
  createTitle: string;
  editTitle: string;
  connectionName: string;
  baseUrl: string;
  save: string;
  testAria: (name: string) => string;
  requestLabel: string;
  requestConnection: string;
  requestSection: string;
  requestResult: string;
  requestPath: string;
  closeRequest: string;
  keepEditing: string;
  discardChanges: string;
  discardTitle: string;
  realtimeAria: (name: string) => string;
  realtimeLabel: string;
};

const EN: Copy = {
  nav: "Workspace views",
  dataPrefix: "Data ",
  newConnection: "New connection",
  createTitle: "New connection",
  editTitle: "Edit connection",
  connectionName: "Connection name",
  baseUrl: "Service URL",
  save: "Save connection",
  testAria: (name) => `Test request for ${name}`,
  requestLabel: "Request tester",
  requestConnection: "Connection",
  requestSection: "Request",
  requestResult: "Test result",
  requestPath: "Request path",
  closeRequest: "Close request",
  keepEditing: "Keep editing",
  discardChanges: "Discard changes",
  discardTitle: "Discard unsaved changes?",
  realtimeAria: (name) => `Configure device realtime data for ${name}`,
  realtimeLabel: "Device realtime data"
};

const ZH: Copy = {
  nav: "工作区视图",
  dataPrefix: "数据 ",
  newConnection: "新建连接",
  createTitle: "新建连接",
  editTitle: "编辑连接",
  connectionName: "连接名称",
  baseUrl: "服务地址",
  save: "保存连接",
  testAria: (name) => `测试 ${name} 的请求`,
  requestLabel: "请求测试",
  requestConnection: "连接",
  requestSection: "请求",
  requestResult: "测试结果",
  requestPath: "请求路径",
  closeRequest: "关闭请求",
  keepEditing: "继续编辑",
  discardChanges: "放弃修改",
  discardTitle: "放弃未保存的更改？",
  realtimeAria: (name) => `配置 ${name} 的设备实时数据接口`,
  realtimeLabel: "设备实时数据"
};

// Every dialog heading must be translated: Chinese text, no leftover English.
function expectLocalized(dialog: HTMLElement): void {
  const headings = [...dialog.querySelectorAll<HTMLElement>("h3, h4, legend")].map((element) =>
    element.textContent?.trim() ?? ""
  );
  expect(headings.length).toBeGreaterThan(0);
  for (const heading of headings) {
    expect(heading).toMatch(/[\u4e00-\u9fff]/);
    expect(heading).not.toMatch(/[A-Za-z]/);
  }
}

async function openDataPanel(host: HTMLElement, copy: Copy): Promise<void> {
  const selector = `[aria-label="${copy.nav}"] button[aria-label^="${copy.dataPrefix}"]`;
  await expect.poll(() => host.querySelector(selector)).toBeTruthy();
  await userEvent.click(requireElement(host, selector));
}

async function createConnection(host: HTMLElement, copy: Copy, name: string, baseUrl: string): Promise<void> {
  await userEvent.click(button(host, copy.newConnection));
  const dialog = await waitForDialog(host, copy.createTitle);
  await userEvent.fill(requireElement<HTMLInputElement>(dialog, `[aria-label="${copy.connectionName}"]`), name);
  await userEvent.fill(requireElement<HTMLInputElement>(dialog, `[aria-label="${copy.baseUrl}"]`), baseUrl);
  await userEvent.click(button(dialog, copy.save));
  await expect.poll(() => host.querySelector(`dialog[aria-label="${copy.createTitle}"]`)).toBeNull();
  await expect.poll(() => findButton(host, copy.testAria(name))).toBeTruthy();
}

async function waitForDialog(host: HTMLElement, label: string): Promise<HTMLDialogElement> {
  const selector = `dialog[aria-label="${label}"]`;
  await expect.poll(() => host.querySelector(selector)).toBeTruthy();
  return requireElement<HTMLDialogElement>(host, selector);
}

async function waitForElement<T extends Element>(host: ParentNode, selector: string): Promise<T> {
  await expect.poll(() => host.querySelector(selector)).toBeTruthy();
  return requireElement<T>(host, selector);
}

function requireElement<T extends Element>(host: ParentNode, selector: string): T {
  const found = host.querySelector<T>(selector);
  if (!found) throw new Error(`Expected element ${selector}`);
  return found;
}

function findButton(host: HTMLElement, label: string): HTMLButtonElement | null {
  return (
    [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.getAttribute("aria-label") === label || candidate.textContent?.trim() === label
    ) ?? null
  );
}

function button(host: HTMLElement, label: string) {
  const found = findButton(host, label);
  if (!found) throw new Error(`Expected button ${label}`);
  return found;
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return { domElement: container.ownerDocument.createElement("canvas"), setSize() {}, render() {}, dispose() {} };
}
