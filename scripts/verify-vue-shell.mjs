import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Public Vue demo: capture the shared authored showcase at fixed desktop states.
const url = process.argv[2] ?? "http://127.0.0.1:5181/";
const output = "docs/design/desktop-workbench-refresh/screenshots/showcase-vue";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const failures = [];
const records = [];
page.on("pageerror", (error) => failures.push(error.message));

async function capture(width, state) {
  await page.mouse.move(10, 10);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    statusBottom: document.querySelector(".ek-workbench__status").getBoundingClientRect().bottom,
    height: innerHeight,
    canvasWidth: document.querySelector("canvas").clientWidth,
    canvasHeight: document.querySelector("canvas").clientHeight
  }));
  assert.equal(layout.overflow, false);
  assert.ok(layout.statusBottom <= layout.height);
  assert.ok(layout.canvasWidth > 200 && layout.canvasHeight > 200);
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
    await capture(width, "default");
    await car.click();
    await capture(width, "selected");
    await page.getByRole("button", { name: "Collapse left panel", exact: true }).click();
    await page.getByRole("button", { name: "Collapse right panel", exact: true }).click();
    await capture(width, "collapsed");
    await page.getByRole("button", { name: "Expand left panel", exact: true }).click();
    await page.getByRole("button", { name: "Expand right panel", exact: true }).click();
    await page.getByRole("button", { name: "Problem details", exact: true }).click();
    await capture(width, "problems");
    await page.getByRole("button", { name: "Close details", exact: true }).click();
    await page.getByRole("tab", { name: "Environment", exact: true }).click();
    await capture(width, "environment");
    await page.getByRole("tab", { name: "Scene", exact: true }).click();
    await page.locator(".ek-inspector-light-list button").filter({ hasText: "Key light" }).click();
    await page.getByLabel("Shadow normal bias", { exact: true }).scrollIntoViewIfNeeded();
    await capture(width, "deep-light");
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url);
  await page.locator(".ek-workbench__tree-row").filter({ hasText: /^Toy Car/ }).first().waitFor();
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  await page.getByRole("button", { name: "项目菜单", exact: true }).click();
  await page.getByRole("tab", { name: "环境", exact: true }).click();
  await capture(1440, "zh-CN");
  assert.deepEqual(failures, []);
  await writeFile(`${output}/verification.json`, JSON.stringify({ url, failures, records }, null, 2) + "\n");
  console.log(`Verified ${records.length} states; saved screenshots to ${output}`);
} finally {
  await browser.close();
}
