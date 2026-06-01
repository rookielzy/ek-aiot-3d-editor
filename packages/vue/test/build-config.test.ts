import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vue package build config", () => {
  it("keeps Vue and core external for browser consumers", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const config = readFileSync(resolve(here, "../vite.config.ts"), "utf8");

    expect(config).toContain("\"vue\"");
    expect(config).toContain("\"@ek-aiot/3d-editor-core\"");
  });

  it("keeps workbench CSS inside the package source boundary", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(here, "../src/components/workbench.css"), "utf8");

    expect(css).toContain(".ek-workbench");
    expect(css).not.toContain("body");
  });

  it("contains inspector overflow so panel scrolling does not extend the page", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(here, "../src/components/inspector.css"), "utf8");

    expect(css).toContain("overflow: auto;");
    expect(css).toContain("contain: paint;");
  });
});
