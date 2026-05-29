import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("React package build config", () => {
  it("keeps React JSX runtimes external for browser consumers", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const config = readFileSync(resolve(here, "../vite.config.ts"), "utf8");

    expect(config).toContain("\"react\"");
    expect(config).toContain("\"react-dom\"");
    expect(config).toContain("\"react/jsx-runtime\"");
    expect(config).toContain("\"react/jsx-dev-runtime\"");
    expect(config).toContain("\"@ek-aiot/3d-editor-core\"");
  });

  it("keeps workbench CSS inside the package source boundary", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(here, "../src/components/workbench.css"), "utf8");

    expect(css).toContain(".ek-workbench");
    expect(css).not.toContain("body");
  });
});
