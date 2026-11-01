import { AssetRegistry } from "../assets/registry";
import { AssetResolverBridge } from "../assets/resolver";
import type { AssetInput } from "../assets/types";
import { importWorkbenchAssets } from "../assets/workspace-import";
import type { WorkbenchAssetImportOptions, WorkbenchAssetImportResult } from "../assets/workspace-import";
import {
  attachGlbImportManifestMetadata,
  createGlbImportDiagnosticsFromError,
  createGlbImportManifest,
  type GlbImportDiagnostic,
  normalizeGltfLoaderOutput,
  sanitizeGlbImportManifestForMetadata
} from "../assets/import-pipeline";
import { planGlbImportRemap } from "../assets/import-remap";
import { CommandDispatcher } from "../commands/dispatcher";
import type { Command, CommandResult } from "../commands/types";
import type { DataCredentialDescriptor } from "../data-sources/types";
import { CoreDataColorService, type EditorDataColorService } from "../data-sources/color-preview";
import { CoreDataService, type EditorDataService } from "../data-sources/service";
import { CommandHistory, type HistoryState } from "../history/history";
import { defaultArchiveAdapter } from "../project/archive-adapter";
import { blobToBytes, checksumBytes, normalizeProjectAssetSource, ProjectAssetStore } from "../project/asset-store";
import { exportProjectPackage } from "../project/export-project";
import { importProjectAssets } from "../project/import-project";
import { replaceProjectAsset } from "../project/replace-asset";
import type { ProjectAssetPayloadSummary, ProjectAssetSourceInput } from "../project/project-api";
import type { ProjectExportOptions, ProjectExportResult, ProjectImportOptions, ProjectImportResult, ReplaceAssetInput, ReplaceAssetResult } from "../project/project-api";
import { ThreeEditorRuntime, type EditorRuntime } from "../runtime/editor-runtime";
import { disposeObjectTree } from "../runtime/disposal";
import { GlbImportError, ThreeGltfLoaderAdapter } from "../runtime/gltf-loader-adapter";
import { EditorTransformModeState, type TransformModeSubscriber } from "../runtime/transform/transform-mode";
import type { SceneImportedGlbNode, SceneSnapshot, SerializedSceneSnapshot } from "../snapshot/types";
import { EditorMarqueeSelectionState, type MarqueeSelectionSubscriber } from "./marquee-selection-state";
import { createAdvancedEditorOperations, createMemoryClipboard, type AdvancedEditorOperations, type EditorClipboard } from "./operations";
import { EditorSnapState, type SnapSubscriber } from "./snap-state";
import { EditorViewportHelperState, IDLE_VIEWPORT_SNAP_FEEDBACK, type ViewportHelperSubscriber } from "./viewport-helper-state";
import { restoreSnapshot, serializeSnapshot } from "./serialization";
import { EditorStore } from "./store";
import type { AssetWorkspaceSubscriber, EditorOptions, EditorWithGlbImport, ImportGlbAssetOptions, ImportGlbAssetResult, MountRuntimeOptions, ReimportGlbAssetOptions, ReimportGlbAssetResult, RuntimeSubscriber, SnapshotSubscriber } from "./editor-api";

export class CoreEditor implements EditorWithGlbImport {
  readonly assets = new AssetRegistry();
  readonly projectAssets = new ProjectAssetStore();
  readonly history = new CommandHistory();
  readonly store: EditorStore;
  readonly dispatcher: CommandDispatcher;
  readonly clipboard: EditorClipboard = createMemoryClipboard();
  readonly operations: AdvancedEditorOperations;
  readonly snap = new EditorSnapState();
  readonly marqueeSelection = new EditorMarqueeSelectionState();
  readonly viewportHelpers = new EditorViewportHelperState();
  readonly transformMode = new EditorTransformModeState();
  #runtime: EditorRuntime | null = null;
  #runtimeSubscribers = new Set<RuntimeSubscriber>();
  #assetWorkspaceSubscribers = new Set<AssetWorkspaceSubscriber>();
  #assetWorkspaceVersion = 0;
  #resolver = new AssetResolverBridge(undefined, this.projectAssets);
  #dataCredentials: readonly DataCredentialDescriptor[] = [];
  #dataService: EditorDataService;
  #dataColorService: CoreDataColorService;
  #unsubscribePreviewLock: (() => void) | null = null;
  #disposed = false;

  constructor(options: EditorOptions = {}) {
    this.store = new EditorStore(options.snapshot ? restoreSnapshot(options.snapshot) : undefined);
    this.dispatcher = new CommandDispatcher(this.store, this.history, this.assets, {
      guard: (command) => this.#dataEditGuard(command)
    });
    this.operations = createAdvancedEditorOperations(this, this.clipboard);
    this.#dataCredentials = Object.freeze([...(options.credentials ?? [])]);
    this.#dataService = new CoreDataService({
      getSnapshot: () => this.store.getSnapshot(),
      subscribeSnapshot: (listener) => this.store.subscribe(() => listener()),
      executor: options.executor ?? null,
      credentials: this.#dataCredentials,
      authRevision: options.authRevision,
      maxResponseBytes: options.maxResponseBytes
    });
    this.#dataColorService = new CoreDataColorService({
      getSnapshot: () => this.store.getSnapshot(),
      subscribeSnapshot: (listener) => this.store.subscribe(() => listener()),
      dataService: this.#dataService
    });
    this.#unsubscribePreviewLock = this.#dataService.subscribeObjectData((state) => {
      this.#runtime?.setTransformEnabled?.(!state.preview.enabled);
    });
  }

  getSnapshot(): SceneSnapshot {
    return this.store.getSnapshot();
  }

  subscribe(subscriber: SnapshotSubscriber): () => void {
    return this.store.subscribe(subscriber);
  }

  subscribeSnap(subscriber: SnapSubscriber): () => void {
    this.#assertActive();
    return this.snap.subscribe(subscriber);
  }

  subscribeMarqueeSelection(subscriber: MarqueeSelectionSubscriber): () => void {
    this.#assertActive();
    return this.marqueeSelection.subscribe(subscriber);
  }

  subscribeViewportHelpers(subscriber: ViewportHelperSubscriber): () => void {
    this.#assertActive();
    return this.viewportHelpers.subscribe(subscriber);
  }

  subscribeTransformMode(subscriber: TransformModeSubscriber): () => void {
    this.#assertActive();
    return this.transformMode.subscribe(subscriber);
  }

  dispatch(command: Command): CommandResult {
    // Suppress store notifications until project asset payloads are registered.
    // Runtime projection must not observe imported objects before their local
    // sources exist in projectAssets, or it will emit asset-unresolved permanently.
    const result = this.store.runWithoutNotify(() => this.dispatcher.dispatch(command));
    if (result.ok) {
      try {
        this.#registerCommandProjectAsset(command, result.snapshot);
      } catch {
        // Transient payload registration must not change durable command results.
      }
      this.store.flushNotify();
      this.#notifyAssetWorkspaceSubscribers();
    }
    return result;
  }

  undo(): CommandResult {
    this.#stopDataRuntime();
    const result = this.dispatcher.undo();
    if (result.ok) {
      this.#notifyAssetWorkspaceSubscribers();
    }
    return result;
  }

  redo(): CommandResult {
    this.#stopDataRuntime();
    const result = this.dispatcher.redo();
    if (result.ok) {
      this.#notifyAssetWorkspaceSubscribers();
    }
    return result;
  }

  getHistoryState(): HistoryState {
    return this.history.state;
  }

  serialize(): SerializedSceneSnapshot {
    return serializeSnapshot(this.store.getSnapshot());
  }

  restore(snapshot: SerializedSceneSnapshot): SceneSnapshot {
    this.#stopDataRuntime();
    const restored = restoreSnapshot(snapshot);
    this.history.clear();
    this.projectAssets.clear();
    this.clipboard.clear();
    this.snap.set({});
    this.marqueeSelection.reset();
    this.viewportHelpers.reset();
    this.transformMode.reset();
    const nextSnapshot = this.store.replaceSnapshot(restored);
    this.#notifyAssetWorkspaceSubscribers();
    return nextSnapshot;
  }

  registerAsset(asset: AssetInput) {
    const reference = this.assets.register(asset);
    const source = asset.source;
    if (isProjectAssetSource(source)) {
      this.projectAssets.register({ asset: reference, source });
      this.#notifyAssetWorkspaceSubscribers();
    }
    return reference;
  }

  getDataCredentials(): readonly DataCredentialDescriptor[] {
    return this.#dataCredentials;
  }

  getDataService(): EditorDataService {
    return this.#dataService;
  }

  getDataColorService(): EditorDataColorService {
    return this.#dataColorService;
  }

  getAssetWorkspacePayloads(): ProjectAssetPayloadSummary[] {
    this.#assertActive();
    return this.projectAssets.summaries();
  }

  getAssetWorkspaceVersion(): number {
    this.#assertActive();
    return this.#assetWorkspaceVersion;
  }

  subscribeAssetWorkspace(subscriber: AssetWorkspaceSubscriber): () => void {
    this.#assertActive();
    this.#assetWorkspaceSubscribers.add(subscriber);
    this.#notifyAssetWorkspaceSubscriber(subscriber, this.getAssetWorkspaceVersion());

    return () => {
      this.#assetWorkspaceSubscribers.delete(subscriber);
    };
  }

  importProject(packageBytes: Uint8Array, options: ProjectImportOptions = {}): ProjectImportResult {
    this.#assertActive();
    this.#stopDataRuntime();
    const previousAssets = [...this.projectAssets.entries()].map(([, asset]) => asset);
    const result = importProjectAssets(packageBytes, this.projectAssets, {
      ...options,
      archive: defaultArchiveAdapter
    });
    if (!result.ok) {
      this.projectAssets.replaceAll(previousAssets);
      this.#notifyAssetWorkspaceSubscribers();
      return {
        ...result,
        snapshot: this.store.getSnapshot()
      };
    }

    this.history.clear();
    this.marqueeSelection.reset();
    this.viewportHelpers.setHover(null);
    this.viewportHelpers.setSnapFeedback(IDLE_VIEWPORT_SNAP_FEEDBACK);
    const snapshot = this.store.replaceSnapshot(result.snapshot);
    this.#notifyAssetWorkspaceSubscribers();
    void this.#runtime?.project(snapshot);
    return {
      ...result,
      snapshot
    };
  }

  exportProject(options: ProjectExportOptions = {}): ProjectExportResult {
    this.#assertActive();
    return exportProjectPackage(this.store.getSnapshot(), this.projectAssets, defaultArchiveAdapter, options);
  }

  async importGlbAsset(options: ImportGlbAssetOptions): Promise<ImportGlbAssetResult> {
    this.#assertActive();
    const commit = options.commit ?? true;
    if (commit) {
      this.#stopDataRuntime();
    }
    const kind = options.asset.kind ?? "glb";
    if (kind !== "glb") {
      const diagnostic = createSourceInvalidDiagnostic("import-glb requires a GLB asset.");
      return {
        ok: false,
        diagnostics: [diagnostic],
        snapshot: this.store.getSnapshot(),
        committed: false
      };
    }

    let resolved;
    let revoke: (() => void) | undefined;
    try {
      ({ resolved, revoke } = await createResolvedAssetForImport(options.asset));
    } catch (error) {
      const diagnostic = createSourceInvalidDiagnostic(error instanceof Error ? error.message : String(error));
      return {
        ok: false,
        diagnostics: [diagnostic],
        snapshot: this.store.getSnapshot(),
        committed: false
      };
    }

    let loadResult;
    try {
      const adapter = options.loader ?? new ThreeGltfLoaderAdapter();
      loadResult = adapter.analyze
        ? await adapter.analyze(resolved)
        : normalizeGltfLoaderOutput(await adapter.load(resolved));
      const manifest = sanitizeGlbImportManifestForMetadata(loadResult.manifest ?? createGlbImportManifest({
        scene: loadResult.scene,
        resolved,
        diagnostics: loadResult.diagnostics
      }));
      const diagnostics = mergeDiagnostics(loadResult.diagnostics ?? [], manifest.diagnostics);

      if (!commit) {
        return {
          ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
          manifest,
          diagnostics,
          snapshot: this.store.getSnapshot(),
          committed: false
        };
      }

      if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        return {
          ok: false,
          manifest,
          diagnostics,
          snapshot: this.store.getSnapshot(),
          committed: false
        };
      }

      const commandResult = this.dispatch({
        type: "import-glb",
        objectId: options.objectId,
        name: options.name,
        parentId: options.parentId,
        transform: options.transform,
        expandImportedTargets: options.expandImportedTargets,
        asset: {
          ...options.asset,
          kind: "glb",
          metadata: attachGlbImportManifestMetadata(options.asset.metadata, manifest)
        }
      });
      return {
        ok: commandResult.ok,
        manifest,
        diagnostics,
        commandResult,
        snapshot: commandResult.snapshot,
        committed: commandResult.ok
      };
    } catch (error) {
      const diagnostics = error instanceof GlbImportError
        ? error.diagnostics
        : createGlbImportDiagnosticsFromError(error);
      return {
        ok: false,
        diagnostics,
        snapshot: this.store.getSnapshot(),
        committed: false
      };
    } finally {
      if (loadResult) {
        disposeObjectTree(loadResult.scene);
      }
      revoke?.();
    }
  }

  async reimportGlbAsset(options: ReimportGlbAssetOptions): Promise<ReimportGlbAssetResult> {
    this.#assertActive();
    const commit = options.commit ?? true;
    if (commit) {
      this.#stopDataRuntime();
    }
    const snapshot = this.store.getSnapshot();
    const asset = snapshot.assets[options.assetId];
    if (!asset || asset.kind !== "glb") {
      const diagnostic = createSourceInvalidDiagnostic(`GLB asset ${options.assetId} does not exist.`);
      return {
        ok: false,
        diagnostics: [diagnostic],
        snapshot,
        committed: false
      };
    }

    const ownerObjectId = options.ownerObjectId ?? Object.values(snapshot.objects)
      .find((object) => object.asset.id === options.assetId)?.id;
    if (!ownerObjectId) {
      const diagnostic = createSourceInvalidDiagnostic(`GLB asset ${options.assetId} is not referenced by an object.`);
      return {
        ok: false,
        diagnostics: [diagnostic],
        snapshot,
        committed: false
      };
    }

    let resolved;
    let revoke: (() => void) | undefined;
    let loadResult;
    try {
      ({ resolved, revoke } = await createResolvedAssetForImport({
        id: options.assetId,
        kind: "glb",
        source: options.source
      }));
      const adapter = options.loader ?? new ThreeGltfLoaderAdapter();
      loadResult = adapter.analyze
        ? await adapter.analyze(resolved)
        : normalizeGltfLoaderOutput(await adapter.load(resolved));
      const manifest = sanitizeGlbImportManifestForMetadata(loadResult.manifest ?? createGlbImportManifest({
        scene: loadResult.scene,
        resolved,
        diagnostics: loadResult.diagnostics
      }));
      const diagnostics = mergeDiagnostics(loadResult.diagnostics ?? [], manifest.diagnostics);
      const currentTargets = Object.values(snapshot.nodes).filter((node): node is SceneImportedGlbNode =>
        node.kind === "imported" && node.ownerObjectId === ownerObjectId
      );
      const remap = planGlbImportRemap({
        ownerObjectId,
        currentTargets,
        replacementManifest: manifest
      });

      if (!commit) {
        return {
          ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
          manifest,
          diagnostics,
          remap,
          snapshot,
          committed: false
        };
      }

      if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        return {
          ok: false,
          manifest,
          diagnostics,
          remap,
          snapshot,
          committed: false
        };
      }

      const previousAssets = [...this.projectAssets.entries()].map(([, stored]) => stored);
      const beforeSnapshot = this.store.getSnapshot();
      const replaced = await replaceProjectAsset(beforeSnapshot, this.projectAssets, {
        assetId: options.assetId,
        kind: "glb",
        source: options.source,
        metadata: attachGlbImportManifestMetadata(asset.metadata, manifest)
      });
      if (!replaced.ok) {
        this.projectAssets.replaceAll(previousAssets);
        this.#notifyAssetWorkspaceSubscribers();
        return {
          ok: false,
          manifest,
          diagnostics,
          remap,
          snapshot: beforeSnapshot,
          committed: false
        };
      }

      const commandResult = this.dispatch({
        type: "reimport-glb",
        ownerObjectId,
        assetId: options.assetId,
        manifest,
        remap
      });
      if (!commandResult.ok) {
        this.projectAssets.replaceAll(previousAssets);
        this.store.replaceSnapshot(beforeSnapshot);
        this.#notifyAssetWorkspaceSubscribers();
        return {
          ok: false,
          manifest,
          diagnostics,
          remap,
          commandResult,
          snapshot: beforeSnapshot,
          committed: false
        };
      }

      this.#notifyAssetWorkspaceSubscribers();
      void this.#runtime?.project(commandResult.snapshot);
      return {
        ok: true,
        manifest,
        diagnostics,
        remap,
        commandResult,
        snapshot: commandResult.snapshot,
        committed: true
      };
    } catch (error) {
      const diagnostics = error instanceof GlbImportError
        ? error.diagnostics
        : createGlbImportDiagnosticsFromError(error);
      return {
        ok: false,
        diagnostics,
        snapshot: this.store.getSnapshot(),
        committed: false
      };
    } finally {
      if (loadResult) {
        disposeObjectTree(loadResult.scene);
      }
      revoke?.();
    }
  }

  importWorkbenchAssets(options: WorkbenchAssetImportOptions): Promise<WorkbenchAssetImportResult[]> {
    this.#assertActive();
    return importWorkbenchAssets(this, options);
  }

  async replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult> {
    this.#assertActive();
    this.#stopDataRuntime();
    const result = await replaceProjectAsset(this.store.getSnapshot(), this.projectAssets, input);
    if (result.ok) {
      this.#notifyAssetWorkspaceSubscribers();
      void this.#runtime?.project(this.store.getSnapshot());
    }
    return result;
  }

  subscribeRuntime(subscriber: RuntimeSubscriber): () => void {
    this.#assertActive();
    this.#runtimeSubscribers.add(subscriber);
    subscriber(this.getRuntime());

    return () => {
      this.#runtimeSubscribers.delete(subscriber);
    };
  }

  mountRuntime(options: MountRuntimeOptions): EditorRuntime {
    this.#assertActive();
    this.#dataColorService.setSink(null);
    this.#dataColorService.endTrial();
    if (this.#runtime) {
      this.#runtime.dispose();
      this.#runtime = null;
      this.#notifyRuntimeSubscribers();
    }
    this.#resolver = options.resolver ?? this.#resolver;
    this.#resolver.setProjectAssets(this.projectAssets);
    this.#runtime = new ThreeEditorRuntime({
      ...options,
      store: this.store,
      dispatcher: this.dispatcher,
      resolver: this.#resolver,
      snap: this.snap,
      marqueeSelection: this.marqueeSelection,
      viewportHelpers: this.viewportHelpers,
      transformMode: this.transformMode
    });
    const runtime = this.#runtime;
    this.#dataColorService.setSink({
      setDataColors: (assignments) => runtime.setDataColors?.(assignments) ?? [],
      subscribeProjection: (subscriber) => runtime.subscribeProjection?.(subscriber) ?? (() => {})
    });
    runtime.setTransformEnabled?.(!this.#dataService.getObjectDataState().preview.enabled);
    this.#notifyRuntimeSubscribers();
    return this.#runtime;
  }

  getRuntime(): EditorRuntime | null {
    return this.#runtime?.disposed ? null : this.#runtime;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    this.#unsubscribePreviewLock?.();
    this.#unsubscribePreviewLock = null;
    this.#dataColorService.dispose();
    this.#dataService.dispose();
    this.#runtime?.dispose();
    this.#runtime = null;
    this.#notifyRuntimeSubscribers();
    this.#runtimeSubscribers.clear();
    this.#assetWorkspaceSubscribers.clear();
    this.assets.clear();
    this.projectAssets.clear();
    this.clipboard.clear();
    this.snap.clear();
    this.marqueeSelection.clear();
    this.viewportHelpers.clear();
    this.transformMode.clear();
    this.store.dispose();
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error("Editor has been disposed.");
    }
  }

  #stopDataRuntime(): void {
    if (this.#disposed) {
      return;
    }
    this.#dataColorService.endTrial();
    this.#dataService.stopPreview();
  }

  #dataEditGuard(command: Command): string | null {
    if (!this.#dataService.getObjectDataState().preview.enabled) {
      return null;
    }
    if (command.type === "import-glb") {
      this.#stopDataRuntime();
      return null;
    }
    return isCommandAllowedDuringPreview(command)
      ? null
      : "data-preview-locked: Stop data preview before changing scene transforms or materials.";
  }

  #notifyRuntimeSubscribers(): void {
    const runtime = this.getRuntime();
    for (const subscriber of [...this.#runtimeSubscribers]) {
      subscriber(runtime);
    }
  }

  #notifyAssetWorkspaceSubscribers(): void {
    this.#assetWorkspaceVersion += 1;
    for (const subscriber of [...this.#assetWorkspaceSubscribers]) {
      this.#notifyAssetWorkspaceSubscriber(subscriber, this.#assetWorkspaceVersion);
    }
  }

  #notifyAssetWorkspaceSubscriber(subscriber: AssetWorkspaceSubscriber, version: number): void {
    try {
      subscriber(version);
    } catch {
      // Subscriber failures must not change command or project lifecycle results.
    }
  }

  #registerCommandProjectAsset(command: Command, snapshot: SceneSnapshot): void {
    if (command.type === "batch") {
      for (const childCommand of command.commands) {
        this.#registerCommandProjectAsset(childCommand, snapshot);
      }
      return;
    }

    if ((command.type !== "import-glb" && command.type !== "register-asset") || !isProjectAssetSource(command.asset.source)) {
      return;
    }
    const assetId = command.asset.id;
    const reference = assetId ? snapshot.assets[assetId] : [...Object.values(snapshot.assets)].at(-1);
    if (!reference) {
      return;
    }
    this.projectAssets.register({
      asset: reference,
      source: command.asset.source,
      ...(command.asset.label ? { label: command.asset.label } : {}),
      ...(command.asset.metadata ? { metadata: command.asset.metadata } : {})
    });
  }
}

const DATA_PREVIEW_COMMANDS = new Set<Command["type"]>([
  "select-node",
  "select-nodes",
  "select-object",
  "select-objects",
  "create-data-connection",
  "update-data-connection",
  "duplicate-data-connection",
  "delete-data-connection",
  "create-data-query",
  "update-data-query",
  "duplicate-data-query",
  "delete-data-query",
  "set-data-object-binding",
  "delete-data-object-binding"
]);

function isCommandAllowedDuringPreview(command: Command): boolean {
  if (command.type === "batch") {
    return command.commands.every(isCommandAllowedDuringPreview);
  }
  return DATA_PREVIEW_COMMANDS.has(command.type);
}

function isProjectAssetSource(source: AssetInput["source"]): source is ProjectAssetSourceInput {
  return source !== undefined && source !== null;
}

async function createResolvedAssetForImport(asset: AssetInput) {
  if (asset.source === undefined || asset.source === null) {
    throw new Error("GLB import analysis requires a local asset source.");
  }
  const normalized = normalizeProjectAssetSource(asset.source);
  const bytes = normalized.bytes ?? (normalized.blob ? await blobToBytes(normalized.blob) : undefined);
  const blob = normalized.blob ?? (bytes ? new Blob([toBlobArrayBuffer(bytes)], normalized.mimeType ? { type: normalized.mimeType } : undefined) : undefined);
  if (!blob) {
    throw new Error("GLB import analysis requires bytes or a Blob source.");
  }
  const uri = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(blob)
    : undefined;
  if (!uri) {
    throw new Error("GLB import analysis requires URL.createObjectURL support for local sources.");
  }
  return {
    resolved: {
      uri,
      ...(normalized.mimeType ? { mimeType: normalized.mimeType } : {}),
      metadata: {
        ...(normalized.metadata ?? {}),
        byteSize: bytes?.byteLength ?? blob.size,
        ...(bytes ? { checksum: checksumBytes(bytes) } : {})
      }
    },
    revoke: () => {
      if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(uri);
      }
    }
  };
}

function createSourceInvalidDiagnostic(message: string): GlbImportDiagnostic {
  return {
    id: "glb-source-invalid",
    severity: "error",
    code: "glb-source-invalid",
    target: { kind: "asset" },
    message,
    recoverability: "user-action",
    display: {
      title: "GLB source is invalid",
      detail: message,
      actionLabel: "Choose GLB"
    }
  };
}

function mergeDiagnostics(
  left: readonly GlbImportDiagnostic[],
  right: readonly GlbImportDiagnostic[]
): GlbImportDiagnostic[] {
  const diagnostics = new Map<string, GlbImportDiagnostic>();
  for (const diagnostic of [...left, ...right]) {
    diagnostics.set(diagnostic.id, diagnostic);
  }
  return [...diagnostics.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function toBlobArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
