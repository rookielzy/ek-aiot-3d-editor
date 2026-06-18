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

const REACT_PRIVATE_IMPORTS = privateImportsForPackage("@ek-aiot/3d-editor-react");
const SHARED_PRIVATE_IMPORTS = [
  ...REACT_PRIVATE_IMPORTS,
  ...privateImportsForPackage("@ek-aiot/3d-editor-vue"),
];

describe("React package documentation contract", () => {
  it("documents the bilingual React Workbench package surface", () => {
    const readme = readRepoText("packages/react/README.md");
    const required: RequiredContent[] = [
      { label: "default English", pattern: /defaults? to English/i },
      { label: "controlled zh-CN locale", pattern: /locale=\{locale\}[\s\S]*"zh-CN"/ },
      { label: "uncontrolled default locale", pattern: /defaultLocale="zh-CN"/ },
      { label: "locale switcher visibility", pattern: /showLocaleSwitcher=\{false\}/ },
      { label: "locale switcher disabled state", pattern: /localeSwitcherDisabled=\{isSaving\}/ },
      { label: "host translation callback", pattern: /translate=\{translate\}/ },
      { label: "render prop i18n access", pattern: /status=\{\(\{ i18n \}\)/ },
      ...publicPackageImports("@ek-aiot/3d-editor-react"),
      { label: "durable state warning", pattern: DURABLE_I18N_STATE_PATTERN },
      { label: "authored values guidance", pattern: /authored file names, asset labels, object names, and project metadata/i },
    ];

    expect(findMissingContent(readme, required)).toEqual([]);
    expect(findForbiddenDeepImportLines(readme, REACT_PRIVATE_IMPORTS)).toEqual([]);
  });

  it("keeps React integration docs explicit about host/session locale state", () => {
    const integration = readRepoText("docs/integration-react.md");
    const required: RequiredContent[] = [
      { label: "controlled locale prop", pattern: "locale={locale}" },
      { label: "default locale prop", pattern: "defaultLocale=\"zh-CN\"" },
      { label: "locale switcher controls", pattern: "showLocaleSwitcher={false}" },
      { label: "host translation callback", pattern: "translate={translate}" },
      { label: "render prop i18n", pattern: "context.i18n" },
      { label: "locale is host/session state", pattern: /`?locale`?、switch visibility、disabled 状态、dictionary、translated copy 和 translate callback 都是宿主\/session UI state/ },
      { label: "not scene snapshot", pattern: CHINESE_DURABLE_I18N_STATE_PATTERN },
      { label: "authored values stay authored", pattern: /文件名、asset label、object name、project metadata 是 authored values/ },
    ];

    expect(findMissingContent(integration, required)).toEqual([]);
    expect(findForbiddenDeepImportLines(integration, REACT_PRIVATE_IMPORTS)).toEqual([]);
  });

  it("keeps repository and release docs aligned with package-facing i18n boundaries", () => {
    const rootReadme = readRepoText("README.md");
    const docsIndex = readRepoText("docs/README.md");
    const release = readRepoText("docs/release.md");

    expect(findMissingContent(rootReadme, [
      { label: "React/Vue package docs", pattern: /React and Vue package READMEs/ },
      { label: "built-in zh-CN", pattern: /built-in `en` and `zh-CN` Workbench UI/ },
      { label: "no persisted language preference", pattern: /no persisted language preference/i },
    ])).toEqual([]);
    expect(findMissingContent(docsIndex, [
      { label: "bilingual workbench docs", pattern: /双语 Workbench/ },
      { label: "session state boundary", pattern: /locale\/switch\/dictionary\/translated copy 属于宿主或 session UI state/ },
    ])).toEqual([]);
    expect(findMissingContent(release, [
      { label: "public i18n types", pattern: /public i18n types/i },
      { label: "package README changes", pattern: /package README changes/i },
      { label: "bilingual Workbench behavior", pattern: /bilingual Workbench behavior/i },
      { label: "i18n root imports", pattern: /documented i18n root-import surface/i },
      { label: "no required i18n runtime", pattern: /must not add required `i18next`, `react-i18next`, Vue I18n, FormatJS, or `intl-messageformat`/ },
    ])).toEqual([]);
    expect(findForbiddenDeepImportLines(`${rootReadme}\n${docsIndex}\n${release}`, SHARED_PRIVATE_IMPORTS)).toEqual([]);
  });

  it("keeps docs contract checks bounded to real durable-state and private-import guidance", () => {
    expect(findMissingContent([
      "SceneSnapshot is mentioned here.",
      "",
      ".ek3d, command history, asset records, and runtime metadata are mentioned elsewhere."
    ].join("\n"), [
      { label: "durable state warning", pattern: DURABLE_I18N_STATE_PATTERN },
    ])).toEqual(["durable state warning"]);
    expect(findForbiddenDeepImportLines("import \"@ek-aiot/3d-editor-react/components\";", REACT_PRIVATE_IMPORTS)).toEqual([
      "1: import \"@ek-aiot/3d-editor-react/components\";"
    ]);
    expect(findForbiddenDeepImportLines("import \"@ek-aiot/3d-editor-react/hooks/use-editor\";", REACT_PRIVATE_IMPORTS)).toEqual([
      "1: import \"@ek-aiot/3d-editor-react/hooks/use-editor\";"
    ]);
    expect(findForbiddenDeepImportLines("import \"@ek-aiot/3d-editor-react/dist/index.css\";", REACT_PRIVATE_IMPORTS)).toEqual([
      "1: import \"@ek-aiot/3d-editor-react/dist/index.css\";"
    ]);
    expect(findForbiddenDeepImportLines("import \"@ek-aiot/3d-editor-react/styles.css\";", REACT_PRIVATE_IMPORTS)).toEqual([]);
  });
});
