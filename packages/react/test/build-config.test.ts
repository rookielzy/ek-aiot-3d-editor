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

  it("publishes the workbench CSS through a stable package subpath", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const config = readFileSync(resolve(here, "../vite.config.ts"), "utf8");
    const packageJson = JSON.parse(readFileSync(resolve(here, "../package.json"), "utf8")) as {
      exports: Record<string, unknown>;
      sideEffects?: string[];
      style?: string;
    };

    expect(config).toContain("cssFileName: \"index\"");
    expect(packageJson.style).toBe("./dist/index.css");
    expect(packageJson.exports["./styles.css"]).toBe("./dist/index.css");
    expect(packageJson.sideEffects).toEqual(expect.arrayContaining(["./dist/index.css"]));
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

  it("does not require a third-party i18n runtime", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const packageJson = JSON.parse(readFileSync(resolve(here, "../package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const requiredPackages = {
      ...packageJson.dependencies,
      ...packageJson.peerDependencies
    };

    for (const packageName of ["i18next", "react-i18next", "vue-i18n", "formatjs", "@formatjs/intl"]) {
      expect(requiredPackages).not.toHaveProperty(packageName);
    }
  });
});
