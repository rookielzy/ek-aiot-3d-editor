import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_I18N_RUNTIME_PACKAGE_PREFIXES,
  FORBIDDEN_I18N_RUNTIME_PACKAGES,
  findForbiddenI18nRuntimeDependencies
} from "../../scripts/package-manifest-contract.mjs";

describe("package manifest i18n runtime contract", () => {
  it("rejects common i18n runtime packages from every publishable dependency surface", () => {
    expect(FORBIDDEN_I18N_RUNTIME_PACKAGES).toEqual(expect.arrayContaining([
      "i18next",
      "react-i18next",
      "react-intl",
      "vue-i18n",
      "@intlify/vue-i18n",
      "intl-messageformat",
      "@formatjs/intl",
    ]));
    expect(FORBIDDEN_I18N_RUNTIME_PACKAGE_PREFIXES).toEqual(expect.arrayContaining([
      "@formatjs/",
      "@intlify/",
    ]));
    expect(findForbiddenI18nRuntimeDependencies({
      dependencies: {
        "react-intl": "^8.0.0",
      },
      peerDependencies: {
        "@formatjs/icu-messageformat-parser": "^3.0.0",
      },
      optionalDependencies: {
        "@intlify/core-base": "^12.0.0",
      },
    })).toEqual([
      "@formatjs/icu-messageformat-parser",
      "@intlify/core-base",
      "react-intl",
    ]);
  });

  it("allows framework peers and the core workspace dependency", () => {
    expect(findForbiddenI18nRuntimeDependencies({
      dependencies: {
        "@ek-aiot/3d-editor-core": "workspace:^0.2.0",
      },
      peerDependencies: {
        react: "^19.0.0",
        vue: "^3.5.0",
      },
    })).toEqual([]);
  });
});
