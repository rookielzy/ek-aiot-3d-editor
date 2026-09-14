import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Empty public Vue demo: seed only through its visible import and light controls.
const url = process.argv[2] ?? "http://127.0.0.1:5181/";
const output = "docs/design/desktop-workbench-refresh/screenshots/vue-shell";
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
    await page.locator("canvas").waitFor();
    await capture(width, "empty");
    await page.getByRole("button", { name: /^Assets \d/ }).click();
    await page.getByLabel("Import assets", { exact: true }).setInputFiles("examples/react-proof-loop/src/showcase/ToyCar.glb");
    await page.getByRole("button", { name: /^Scene \d/ }).click();
    const object = page.locator(".ek-workbench__tree-row").filter({ hasText: "ToyCar" }).first();
    await object.click();
    await page.getByLabel("Add light", { exact: true }).selectOption("ambient");
    await object.click();
    // The CC0 ToyCar is authored at 0.0001 scale; match the React visual fixture via UI.
    for (const axis of ["X", "Y", "Z"]) {
      const scale = page.getByRole("spinbutton", { name: `Scale ${axis}`, exact: true });
      await scale.fill("70");
      await scale.press("Tab");
    }
    await page.getByRole("button", { name: "Camera", exact: true }).click();
    await page.getByRole("button", { name: "Frame sel", exact: true }).click();
    const position = page.getByRole("spinbutton", { name: "Position X", exact: true });
    await position.fill("2");
    await position.press("Tab");
    assert.equal(await position.inputValue(), "2");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.equal(await position.inputValue(), "0");
    await capture(width, "selected");
    await page.getByRole("button", { name: "Collapse left panel", exact: true }).click();
    await page.getByRole("button", { name: "Collapse right panel", exact: true }).click();
    await capture(width, "collapsed");
    await page.getByRole("button", { name: "Expand left panel", exact: true }).click();
    await page.getByRole("button", { name: "Expand right panel", exact: true }).click();
    await page.getByRole("button", { name: /^Assets \d/ }).click();
    await capture(width, "assets");
    await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
    await capture(width, "zh-CN");
  }
  assert.deepEqual(failures, []);
  await writeFile(`${output}/verification.json`, JSON.stringify({ url, failures, records }, null, 2) + "\n");
  console.log(`Verified ${records.length} states; saved screenshots to ${output}`);
} finally {
  await browser.close();
}
