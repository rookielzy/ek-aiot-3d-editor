import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("React package build config", () => {
  it("keeps React JSX runtimes external for browser consumers", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const config = readFileSync(resolve(here, "../vite.config.ts"), "utf8");

    expect(config).toContain("\"react/jsx-runtime\"");
    expect(config).toContain("\"react/jsx-dev-runtime\"");
  });
});
