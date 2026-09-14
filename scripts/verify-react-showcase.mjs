import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Run against the React demo dev server. Assets and all screenshots stay local.
const url = process.argv[2] ?? "http://127.0.0.1:5180/";
const output = "docs/design/desktop-workbench-refresh/screenshots/showcase";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const failures = [];
const records = [];
page.on("pageerror", (error) => failures.push(error.message));
async function settled() {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function screenshot(width, state) {
  await page.mouse.move(10, 10);
  await settled();
  const layout = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const status = document.querySelector(".ek-workbench__status");
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      statusBottom: status.getBoundingClientRect().bottom,
      canvas: { width: canvas.clientWidth, height: canvas.clientHeight },
      viewportHeight: innerHeight
    };
  });
  assert.equal(layout.overflow, false);
  assert.ok(layout.statusBottom <= layout.viewportHeight);
  assert.ok(layout.canvas.width > 200 && layout.canvas.height > 200);
  const path = `${output}/${width}-${state}.png`;
  await page.screenshot({ path });
  records.push({ width, state, path, ...layout });
}
try {
  for (const [width, height] of [[1440, 900], [1920, 1080], [1100, 800]]) {
    await page.setViewportSize({ width, height });
    await page.goto(url);
    const car = page.locator(".ek-workbench__tree-row").filter({ hasText: /^Toy Car/ }).first();
    await car.waitFor();
    await page.locator("canvas").waitFor();
    await page.waitForTimeout(1200);
    await screenshot(width, "default");
    await car.click();
    await page.getByRole("spinbutton", { name: "Position X", exact: true }).waitFor();
    await screenshot(width, "selected");
    await page.getByRole("button", { name: "Collapse left panel", exact: true }).click();
    await page.getByRole("button", { name: "Collapse right panel", exact: true }).click();
    await screenshot(width, "collapsed");
    await page.getByRole("button", { name: "Expand left panel", exact: true }).click();
    await page.getByRole("button", { name: "Expand right panel", exact: true }).click();
    await page.getByRole("button", { name: "Problem details", exact: true }).click();
    await screenshot(width, "problems");
    await page.getByRole("button", { name: "Close details", exact: true }).click();
    await page.getByRole("tab", { name: "Environment", exact: true }).click();
    await screenshot(width, "environment");
    await page.getByRole("tab", { name: "Scene", exact: true }).click();
    await page.locator(".ek-inspector-light-list button").filter({ hasText: "Key light" }).click();
    await page.getByLabel("Shadow normal bias", { exact: true }).scrollIntoViewIfNeeded();
    await screenshot(width, "deep-light");
    await page.getByRole("tab", { name: "Properties", exact: true }).click();
    // Both keyboard and pointer resizing retain truthful separator values.
    const separator = page.getByRole("separator", { name: "Resize left panel" });
    await separator.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    const initial = Number(await separator.getAttribute("aria-valuenow"));
    const box = await separator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    const resized = Number(await separator.getAttribute("aria-valuenow"));
    assert.equal(resized, initial + 24);
    const actual = await page.getByLabel("Project panel", { exact: true }).boundingBox();
    if (actual) assert.equal(actual.width, resized);
    records.push({ width, state: "resize", initial, resized });
  }
  // Localized chrome does not replace user-authored model/light/camera names.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url);
  await page.locator(".ek-workbench__tree-row").filter({ hasText: /^Toy Car/ }).first().waitFor();
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  await page.getByRole("button", { name: "项目菜单", exact: true }).click();
  await page.getByRole("tab", { name: "环境", exact: true }).click();
  await screenshot(1440, "zh-CN");
  assert.deepEqual(failures, []);
  await writeFile(`${output}/verification.json`, JSON.stringify({ url, failures, records }, null, 2) + "\n");
  console.log(`Verified ${records.length} states; saved screenshots to ${output}`);
} finally {
  await browser.close();
}
