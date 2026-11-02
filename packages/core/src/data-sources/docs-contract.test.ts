import { describe, expect, it } from "vitest";
import { findMissingContent, readRepoText, type RequiredContent } from "../../../test/docs-contract";

/**
 * The delivery claim of this issue is only true if the docs say the same thing
 * the tests prove: a data-bound `.ek3d` crosses frameworks, credentials stay a
 * host concern, and no framework owns request logic.
 */
describe("cross-framework data source documentation contract", () => {
  it("documents the React to Vue to vanilla delivery path and its evidence", () => {
    const docs: Array<{ path: string; required: RequiredContent[] }> = [
      {
        path: "docs/integration-vue.md",
        required: [
          { label: "Vue data workspace exists", pattern: /Vue Workbench 提供与 React 等价的数据工作区/ },
          { label: "Vue reuses core service", pattern: /editor\.getDataService\(\)/ },
          { label: "explicit preview start", pattern: /startPreview\(\)/ },
          { label: "cross-framework evidence test", pattern: /workbench-cross-framework\.test\.ts/ },
          { label: "browser delivery evidence", pattern: /cross-framework-data\.browser\.test\.tsx/ },
          { label: "reconnect outcome", pattern: /重新连接/ }
        ]
      },
      {
        path: "docs/integration-vanilla.md",
        required: [
          { label: "vanilla data section", pattern: /## 数据源（无框架宿主）/ },
          { label: "host executor", pattern: /DataRequestExecutor/ },
          { label: "frozen request descriptor", pattern: /请求描述是冻结的/ },
          { label: "capability repair", pattern: /setHostCapabilities/ },
          { label: "runtime stays out of durable state", pattern: /不进入 Snapshot、history 或 `\.ek3d`/ }
        ]
      },
      {
        path: "docs/project-package.md",
        required: [
          { label: "dataSources in scene", pattern: /`scene\.json\.dataSources`/ },
          { label: "secrets excluded", pattern: /认证秘密本身的取值/ },
          { label: "cross-framework transfer", pattern: /可以在 React、Vue 或无框架宿主之间传递/ }
        ]
      },
      {
        path: "docs/faq.md",
        required: [
          { label: "binding is supported", pattern: /HTTP 数据源与对象数据绑定已经支持/ },
          { label: "credentials are not packaged", pattern: /## 数据源的凭证会写进 `\.ek3d` 吗/ },
          { label: "core owns data logic", pattern: /映射求值、响应判定和预览调度都在 core/ }
        ]
      }
    ];

    for (const doc of docs) {
      expect(findMissingContent(readRepoText(doc.path), doc.required), doc.path).toEqual([]);
    }
  });

  it("keeps framework READMEs free of the retired no-UI claim", () => {
    const vueReadme = readRepoText("packages/vue/README.md");
    // The Vue package now ships the data workspace; the old caveat must be gone.
    expect(vueReadme).not.toMatch(/does not add binding or detail UI/i);
    expect(vueReadme).not.toMatch(/Vue owns no request UI/i);

    const required: RequiredContent[] = [
      { label: "data workspace parity", pattern: /same data workspace as the React package/ },
      { label: "core service reuse", pattern: /editor\.getDataService\(\)/ },
      { label: "capability repair", pattern: /setHostCapabilities\(\)/ },
      { label: "reconnect restore", pattern: /reconnect/ }
    ];
    expect(findMissingContent(vueReadme, required)).toEqual([]);
  });
});
