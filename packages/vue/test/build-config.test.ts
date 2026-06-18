import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_I18N_RUNTIME_PACKAGES, findForbiddenI18nRuntimeDependencies } from "../../../scripts/package-manifest-contract.mjs";

describe("Vue package build config", () => {
  it("keeps Vue and core external for browser consumers", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const config = readFileSync(resolve(here, "../vite.config.ts"), "utf8");

    expect(config).toContain("\"vue\"");
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
      optionalDependencies?: Record<string, string>;
    };

    expect(FORBIDDEN_I18N_RUNTIME_PACKAGES).toContain("vue-i18n");
    expect(findForbiddenI18nRuntimeDependencies(packageJson)).toEqual([]);
  });
});
