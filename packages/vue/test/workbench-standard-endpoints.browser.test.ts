import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { expect, it } from "vitest";
import { page } from "vitest/browser";
import { createApp, h, markRaw } from "vue";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";
import "../src/styles.css";

it("distinguishes a valid empty endpoint response, malformed data, and HTTP failure", async () => {
  const editor = createEditor({
    executor: async (request) => {
      const response = await fetch(request.url, { signal: request.signal });
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        body: await response.text()
      };
    }
  });
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({
    render: () => h(EditorWorkbench, { editor: markRaw(editor), locale: "en", rendererFactory: fakeRenderer })
  });
  app.mount(host);
  try {
    expect(editor.dispatch({
      type: "create-data-connection",
      connection: {
        name: "Standard API",
        baseUrl: `${window.location.origin}/__fixtures__/http-data-source`,
        auth: { kind: "none" },
        headers: {},
        timeoutMs: 5000
      }
    }).ok).toBe(true);
    await page.getByRole("button", { name: /^Data / }).click();
    await page.getByRole("button", { name: "Configure device realtime data for Standard API" }).click();
    const dialog = page.getByRole("dialog", { name: "Device realtime data" });
    const path = dialog.getByRole("textbox", { name: "Request path" });
    const run = dialog.getByRole("button", { name: "Run request" });
    const result = dialog.getByRole("region", { name: "Test result" });
    await path.fill("/standard-empty");
    await dialog.getByRole("button", { name: "Save endpoint" }).click();
    await dialog.getByRole("button", { name: "Close request" }).click();
    await page.getByRole("button", { name: "Configure device realtime data for Standard API" }).click();
    await expect.element(path).toHaveValue("/standard-empty");
    for (const test of [
      { path: "/standard-empty", status: "success", message: "0 records" },
      { path: "/standard-iso-time", status: "success", message: "2 records" },
      { path: "/standard-invalid", status: "error", message: "Response does not match the device interface at $[0].data[0].value." },
      { path: "/standard-http-failure", status: "error", message: "The service returned HTTP 503." }
    ]) {
      await path.fill(test.path);
      await run.click();
      await expect.element(result).toHaveAttribute("data-status", test.status);
      await expect.element(result).toHaveTextContent(test.message);
    }
  } finally {
    app.unmount();
    editor.dispose();
    host.remove();
  }
});

function fakeRenderer(container: HTMLElement): RendererLike {
  return { domElement: container.ownerDocument.createElement("canvas"), setSize() {}, render() {}, dispose() {} };
}
