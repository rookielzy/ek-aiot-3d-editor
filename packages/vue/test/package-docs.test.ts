import { describe, expect, it } from "vitest";
import {
  CHINESE_DURABLE_I18N_STATE_PATTERN,
  DURABLE_I18N_STATE_PATTERN,
  findForbiddenDeepImportLines,
  findMissingContent,
  privateImportsForPackage,
  publicPackageImports,
  readRepoText,
  type RequiredContent
} from "../../test/docs-contract";

const VUE_PRIVATE_IMPORTS = privateImportsForPackage("@ek-aiot/3d-editor-vue");

describe("Vue package documentation contract", () => {
  it("documents the bilingual Vue Workbench package surface", () => {
    const readme = readRepoText("packages/vue/README.md");
    const required: RequiredContent[] = [
      { label: "default English", pattern: /defaults? to English/i },
      { label: "controlled zh-CN locale", pattern: /v-model:locale="locale"[\s\S]*"zh-CN"/ },
      { label: "uncontrolled default locale", pattern: /default-locale="zh-CN"/ },
      { label: "locale switcher visibility", pattern: /:show-locale-switcher="false"/ },
      { label: "locale switcher disabled state", pattern: /:locale-switcher-disabled="isSaving"/ },
      { label: "update locale event", pattern: /update:locale/ },
      { label: "host translation callback", pattern: /:translate="translate"/ },
      { label: "scoped slot i18n access", pattern: /#status="\{ i18n \}"/ },
      ...publicPackageImports("@ek-aiot/3d-editor-vue"),
      { label: "durable state warning", pattern: DURABLE_I18N_STATE_PATTERN },
      { label: "host store guidance", pattern: /Pinia or another host store/i },
    ];

    expect(findMissingContent(readme, required)).toEqual([]);
    expect(findForbiddenDeepImportLines(readme, VUE_PRIVATE_IMPORTS)).toEqual([]);
  });

  it("keeps Vue integration docs explicit about host/session locale state", () => {
    const integration = readRepoText("docs/integration-vue.md");
    const required: RequiredContent[] = [
      { label: "controlled locale binding", pattern: "v-model:locale=\"locale\"" },
      { label: "default locale prop", pattern: "default-locale=\"zh-CN\"" },
      { label: "locale switcher controls", pattern: ":show-locale-switcher=\"false\"" },
      { label: "host translation callback", pattern: ":translate=\"translate\"" },
      { label: "scoped slot i18n", pattern: "context.i18n" },
      { label: "locale is host/session state", pattern: /`?locale`?、switch visibility、disabled 状态、dictionary、translated copy 和 translate callback 都是 Vue\/host session UI state/ },
      { label: "not durable editor data", pattern: CHINESE_DURABLE_I18N_STATE_PATTERN },
      { label: "pinia host state", pattern: /Pinia 或其他宿主 store/ },
    ];

    expect(findMissingContent(integration, required)).toEqual([]);
    expect(findForbiddenDeepImportLines(integration, VUE_PRIVATE_IMPORTS)).toEqual([]);
  });

  it("flags exact private Vue i18n subpath imports", () => {
    expect(findForbiddenDeepImportLines("import \"@ek-aiot/3d-editor-vue/i18n\";", VUE_PRIVATE_IMPORTS)).toEqual([
      "1: import \"@ek-aiot/3d-editor-vue/i18n\";"
    ]);
    expect(findForbiddenDeepImportLines("import \"@ek-aiot/3d-editor-vue/components/EditorWorkbench.vue\";", VUE_PRIVATE_IMPORTS)).toEqual([
      "1: import \"@ek-aiot/3d-editor-vue/components/EditorWorkbench.vue\";"
    ]);
    expect(findForbiddenDeepImportLines("import \"@ek-aiot/3d-editor-vue/styles.css\";", VUE_PRIVATE_IMPORTS)).toEqual([]);
  });
});
