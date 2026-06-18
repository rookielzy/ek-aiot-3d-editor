# 集成指南：React

`@ek-aiot/3d-editor-react` 是 `@ek-aiot/3d-editor-core` 的 React 适配层。默认路径是安装包、导入 CSS、渲染 `EditorWorkbench`，它会直接给出完整 editor shell：顶部工具栏、左侧 hierarchy/assets/project 面板、中心 3D viewport、右侧 inspector/problems 面板和底部状态栏。

## 安装

```bash
pnpm add @ek-aiot/3d-editor-core @ek-aiot/3d-editor-react three react react-dom
```

React 和 React DOM 是 peer dependencies。

## 样式

包产物包含 `dist/index.css`，package manifest 的 `style` 字段会指向该文件。推荐从公开 CSS 子路径显式导入样式：

```ts
import "@ek-aiot/3d-editor-react/styles.css";
```

## Workbench 用法

```tsx
import { useMemo } from "react";
import { AssetResolverBridge, ThreeGltfLoaderAdapter } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, useEditor } from "@ek-aiot/3d-editor-react";
import "@ek-aiot/3d-editor-react/styles.css";

export function EditorPage() {
  const editor = useEditor();
  const resolver = useMemo(
    () =>
      new AssetResolverBridge((asset) =>
        asset.kind === "glb" ? { uri: `/assets/${asset.id}.glb` } : null
      ),
    []
  );
  const loader = useMemo(
    () =>
      new ThreeGltfLoaderAdapter({
        decoders: {
          // Host 提供 ready decoder 实例或 factory；core 不硬编码 decoder URL。
          // draco: () => dracoLoader,
          // ktx2: () => ktx2Loader,
          // meshopt: () => MeshoptDecoder
        }
      }),
    []
  );

  return (
    <EditorWorkbench
      editor={editor}
      resolver={resolver}
      loader={loader}
    />
  );
}
```

不传 `toolbar`、`leftPanel`、`rightPanel` 或 `status` 时，Workbench 会使用 package-owned 默认 UI。默认 toolbar 已包含 open/export、undo/redo、transform mode、snap、marquee selection 开关、grid/floor/axes/hover/bounds/snap guide helper、camera reset/frame、camera view capture/apply、copy/paste/duplicate/delete/group/ungroup/select controls；默认 viewport 开启 pointer picking，并保留左键拖拽给相机旋转。用户打开 toolbar 的 `Marquee` 后才启用 viewport marquee selection。默认右侧 inspector 包含 Camera views section，可以编辑 authored camera view、设置 default presentation view、删除 view，或把 view 应用回 transient editor camera。默认左栏会显示 hierarchy、可批量导入的 asset workspace、project summary、project/runtime problems 和缺失资产恢复入口。

## 双语 Workbench UI

默认 Workbench UI 内置 `en` 和 `zh-CN` 字典，默认语言是 English，不需要 `i18next`、`react-i18next`、FormatJS 或其他第三方 i18n runtime。宿主只需要继续从 package root 和公开 CSS 子路径导入：

```tsx
import {
  EditorWorkbench,
  type WorkbenchLocale,
  type WorkbenchTranslate
} from "@ek-aiot/3d-editor-react";
import "@ek-aiot/3d-editor-react/styles.css";
```

宿主拥有语言设置时，把 locale 放在 React state 或应用 store 中：

```tsx
const [locale, setLocale] = useState<WorkbenchLocale>("zh-CN");
const translate: WorkbenchTranslate = (descriptor, activeLocale) =>
  descriptor.key === "reactWorkbench.status.saved" && activeLocale === "zh-CN"
    ? "已保存"
    : undefined;

<EditorWorkbench
  locale={locale}
  onLocaleChange={setLocale}
  showLocaleSwitcher={false}
  localeSwitcherDisabled={isSaving}
  translate={translate}
  status={(context) => <span>{context.i18n.t("reactWorkbench.status.saved")}</span>}
/>;
```

不需要宿主控制时，可以用 `defaultLocale="zh-CN"` 让 Workbench 自己维护初始语言。`showLocaleSwitcher={false}` 会隐藏内置切换器，`localeSwitcherDisabled={isSaving}` 会保留切换器但禁止交互。

`locale`、switch visibility、disabled 状态、dictionary、translated copy 和 translate callback 都是宿主/session UI state。不要写入 `SceneSnapshot`、`.ek3d`、command history、asset records 或 runtime metadata。文件名、asset label、object name、project metadata 是 authored values；它们作为插值显示，不默认翻译。

## 初始化场景

```tsx
import { useEffect } from "react";

useEffect(() => {
  if (editor.getSnapshot().objects.box) {
    return;
  }

  editor.dispatch({
    type: "import-glb",
    objectId: "box",
    asset: { id: "simple-box", kind: "glb", label: "Simple box" }
  });
  editor.dispatch({ type: "select-object", objectId: "box" });
}, [editor]);
```

React StrictMode 下 effect 可能在开发环境重复执行，因此初始化逻辑应检查对象是否已经存在。

## 宿主状态和 Store

React app store 可以镜像可序列化的项目 metadata、当前 route、最近保存的 `SceneSnapshot` 或 `.ek3d` bytes。不要把 `Editor`、`EditorRuntime`、Three.js 对象、`File`、`Blob`、object URL、resolver 输出或 runtime problem 对象写进 durable store；这些对象应保持在 client-owned editor/runtime 边界内。

如果需要把编辑状态同步给宿主 UI，优先通过 `useWorkbench()` 或 `EditorWorkbench` render props 读取派生 context，再把必要的 serializable projection 写入宿主 store。持久化变更仍通过 core commands、project import/export 和 snapshot/project package API 完成。

Authored camera views 位于 `snapshot.cameras`，默认展示入口是 `snapshot.presentation.defaultCameraId`。默认 Workbench 的 Capture view 会把当前 runtime camera 转换成 plain JSON data 后 dispatch `create-camera-view`；Apply view 只调用 runtime apply helper，不会改变 Snapshot。自定义 React toolbar/inspector 应复用 context 中的 `activeCameraViewId`、`setActiveCameraViewId()`、`captureCameraView()`、`applyCameraView()` 或 core 的 `resolveDefaultPresentationView()`，不要保存 Three.js `Camera`、`OrbitControls` 或 controls target object。

资产面板应优先读取 `workbench.model.assets.workspace`。该 workspace 已经合并 Snapshot asset registry、对象/材质/环境引用位置、项目包 payload 摘要、GLB import manifest diagnostics、GLB reimport remap problem 和资产问题，并提供 core 统一的搜索/过滤/排序 helper。`replaceAsset()` 这类 payload-only 更新不会改变 Snapshot，但 React hook 会订阅 core asset workspace 版本并重新计算 model；宿主不需要也不应该读取 transient project store、`Blob` 或 object URL。

默认 React material inspector 已支持 object-level broad override 和 imported material-slot target。`MaterialInspectorSection.targets` 由 core 统一派生，React 只渲染 target radio group、显示 unresolved/disabled 状态，并把 active target 传回 core `buildSetMaterialCommand()`。Active target、字段草稿和 controlled warning 都是组件本地 UI state，不进入 `SceneSnapshot` 或 `.ek3d`。自定义 React inspector 也应优先使用同一 core inspector model，而不是自行扫描 `materialSlots` 后拼 command target。

默认左栏的资产区支持多文件选择、拖放和 registered GLB reimport。`.glb` 导入会通过 `context.assets.importFiles()` 调用 core 的 decoder-aware GLB import bridge，并使用传给 `EditorWorkbench` 的同一个 `loader` prop；已注册的 GLB row 会通过 `context.assets.reimportGlbAsset()` 调用 core reimport lifecycle。`.hdr` 会注册为 HDR asset；PNG/JPG/WebP/SVG 等 raster 文件需要用户在 UI 中显式选择 `texture` 或 `image` intent。导入队列、drag hover、file input value 和失败提示是 React transient state，不进入 `SceneSnapshot` 或 `.ek3d` JSON。

自定义 left panel 也可以调用同一个 core-owned 入口：

```tsx
await context.assets.importFiles({
  rasterKind: "texture",
  files: [
    { name: file.name, mimeType: file.type, source: file }
  ]
});
```

该调用返回每个文件的 label、kind、status、asset ID/object ID、manifest 和可显示 diagnostics；返回值本身不包含 `File`、`Blob`、object URL、Three.js scene 或 decoder 对象。

## Decoder-aware GLB

真实用户 GLB 可能依赖 Draco、KTX2/Basis 或 Meshopt。React 适配层只把 `loader` prop 原样传给 core runtime，不解释 decoder 语义。宿主应在应用层创建 `ThreeGltfLoaderAdapter`，并提供已经配置好的 decoder 实例、异步 factory 或完整 `loaderFactory`。

`editor.importGlbAsset()` 可以在提交 `import-glb` 命令前执行异步分析。成功结果会把 JSON-compatible `glbImportManifest` 写入 asset metadata；失败结果返回结构化 diagnostics，不会默认注册 asset/object。`editor.reimportGlbAsset()` 对现有 GLB asset 执行同样的异步分析，并返回 remap summary；`commit: false` 可用于预览，提交成功后 core 会在同一 lifecycle 内替换 payload、提交 `reimport-glb`、刷新 runtime/workspace。Manifest 可以被资产 workspace 读取，用来显示 `importStatus` 和 import diagnostics。不要持久化 `GLTFLoader`、parser、`Object3D`、`Texture`、`File`、`Blob`、object URL、resolver 输出或 decoder 对象。

## Primitive 组件

如果不使用 `EditorWorkbench`，可以直接组合：

```tsx
import { EditorViewport, InspectorPanel, useEditor } from "@ek-aiot/3d-editor-react";

function CustomEditor() {
  const editor = useEditor();

  return (
    <>
      <EditorViewport editor={editor} />
      <InspectorPanel editor={editor} />
    </>
  );
}
```

## Workbench 扩展区域

React workbench 支持 render prop：

- `toolbar`
- `leftPanel`
- `sidePanel`（兼容旧名称，推荐新代码使用 `leftPanel`）
- `viewportOverlay`
- `rightPanel`
- `status`

每个 render prop 接收同一个 `WorkbenchContext`：

```ts
interface WorkbenchContext {
  editor: EditorWithGlbImport;
  snapshot: SceneSnapshot;
  inspector: InspectorModel;
  runtimeProblems: Problem[];
  runtime: EditorRuntime | null;
  runtimeReady: boolean;
  activeLightId: string | null;
  activeLightNodeId: string | null;
  activeCameraViewId: string | null;
  selectedCameraViewId: string | null;
  selection: { cameraViewId: string | null };
  operations: AdvancedEditorOperations;
  historyState: HistoryState;
  selectionCount: number;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedNodeKind: InspectorModel["selection"]["nodeKind"];
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  selectedLightId: string | null;
  snap: SnapSettings;
  viewportHelperState: ViewportHelperStateSnapshot;
  transformMode: TransformMode;
  setActiveLightId(value: string | null): void;
  setActiveCameraViewId(value: string | null): void;
  setTransformMode(mode: TransformMode): void;
  toggleSnap(channel: SnapChannel, increment?: number): SnapSettings;
  toggleViewportHelper(key: ViewportHelperKey): ViewportHelperStateSnapshot;
  runAction(action: EditorAction): EditorActionResult;
  resetCamera(): void;
  frameSelected(options?: RuntimeCameraFrameOptions): boolean;
  frameAll(options?: RuntimeCameraFrameOptions): boolean;
  captureCameraView(input?: Pick<AuthoredCameraViewInput, "id" | "name" | "metadata">): AuthoredCameraViewInput | null;
  applyCameraView(view: AuthoredCameraView): boolean;
  refreshProblems(): void;
  dispatch(command: Command): CommandResult;
  importProject(packageBytes: Uint8Array, options?: ProjectImportOptions): ProjectImportResult;
  exportProject(options?: ProjectExportOptions): ProjectExportResult;
  importAssetFiles(options: WorkbenchAssetImportOptions): Promise<WorkbenchAssetImportResult[]>;
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
  assets: {
    importFiles(options: WorkbenchAssetImportOptions): Promise<WorkbenchAssetImportResult[]>;
    replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
    reimportGlbAsset(input: ReimportGlbAssetOptions): Promise<ReimportGlbAssetResult>;
  };
  viewportHelpers: {
    state: ViewportHelperStateSnapshot;
    toggle(key: ViewportHelperKey): ViewportHelperStateSnapshot;
  };
}
```

`activeCameraViewId` 是 inspector 当前编辑的 authored camera view；`selectedCameraViewId` / `selection.cameraViewId` 只在 hierarchy selection 指向 camera node 时有值。

`viewportHelperState` 和 marquee overlay state 都是 session-only projection。Grid/floor/axes visibility、hover target、bounds toggle、snap guide feedback、drag rectangle 和 candidate IDs 不会写入 `SceneSnapshot` 或 `.ek3d`，也不会产生 undo history。Workbench 完成 marquee 时只把最终 ordered node IDs 通过 core `select-nodes` 命令写入 durable selection。

## 本地 proof-loop demo

本仓库的 React demo 可通过以下命令启动：

```bash
pnpm --filter @ek-aiot/react-proof-loop dev
```

示例首屏就是可操作 workbench，不是 landing page。示例代码只保留真实宿主通常需要拥有的部分：创建 editor、初始化 starter snapshot、配置 resolver/loader、选择可选 renderer factory，以及一个很薄的 viewport overlay。toolbar、hierarchy、assets、project status、missing-asset recovery、inspector 和 status 都来自 `@ek-aiot/3d-editor-react` 默认 Workbench。

默认 UI 可以完成 starter flow：选择 hierarchy row、viewport picking 或打开 `Marquee` 后使用 marquee selection，capture/edit/default/apply authored camera view，编辑 Transform/Material inspector、在 expanded GLB 上选择 broad object 或 material slot target、切换 helper/snap/transform、undo/redo、duplicate、export partial package、通过 Open 重新载入 `.ek3d`、从左栏恢复缺失资产，以及对 registered GLB 执行 reimport。缺失资产恢复使用同一个稳定 asset ID 调用 `replaceAsset()`，替换 payload 后 runtime 重新投影并清除派生 runtime problem；GLB reimport 使用 `context.assets.reimportGlbAsset()`，提交 replacement manifest 和 target remap，并在按钮反馈中显示 exact/remapped/new/unresolved summary。

浏览器证据通过仓库根目录命令运行：

```bash
pnpm test:browser
```

该命令使用 headless Chromium 验证 React starter 的默认 workbench 区域、selection、transform/history、material inspector smoke、project export/open、missing-asset recovery、problem status 和 canvas 非空渲染状态。它不是端到端托管发布测试，也不承诺完整资产库、外部 paste、数据绑定或事件编排能力。

## 宿主拥有 editor 生命周期

如果传入 `editor` prop，workbench 卸载时不会 dispose 宿主 editor。宿主需要在合适时机调用：

```ts
editor.dispose();
```

如果不传入 `editor`，workbench 会创建并在自身卸载时 dispose。

## 资产替换

Problems panel 对可恢复资产问题暴露文件替换入口。React 层会调用：

```ts
workbench.replaceAsset({
  assetId,
  source: file,
  label: file.name,
  mimeType: file.type
});
```

文件不会进入 Snapshot，只会作为 transient payload 被 core 使用。
