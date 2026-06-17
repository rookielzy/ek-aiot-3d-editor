import { useRef, useState, type ChangeEvent } from "react";
import { createAuthoredCameraViewInput, type ProjectExportResult } from "@ek-aiot/3d-editor-core";
import type { WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";

export interface WorkbenchToolbarProps {
  context: ResolvedWorkbenchContext;
  marqueeSelectionEnabled?: boolean;
  onToggleMarqueeSelection?(): void;
  showLocaleSwitcher?: boolean;
  localeSwitcherDisabled?: boolean;
}

type ProjectActionStatus = {
  tone: "neutral" | "success" | "warning" | "error";
  message?: {
    key: WorkbenchMessageKey;
    fallback: string;
    values?: WorkbenchMessageValues;
  };
  fallback?: string;
};

const ACCEPT_PROJECT_PACKAGE = ".ek3d,application/octet-stream";

export function WorkbenchToolbar({
  context,
  marqueeSelectionEnabled = false,
  onToggleMarqueeSelection,
  showLocaleSwitcher = true,
  localeSwitcherDisabled = false
}: WorkbenchToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [projectStatus, setProjectStatus] = useState<ProjectActionStatus>({
    tone: "neutral"
  });
  const toolbar = context.model.toolbar;
  const t = context.i18n.t;
  const projectStatusLabel = projectStatus.message
    ? t(projectStatus.message)
    : projectStatus.fallback ?? t(context.model.project.statusLabelDescriptor ?? {
        key: "workbench.project.status.partial.label",
        fallback: context.model.project.statusLabel
      });

  async function onOpenProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    try {
      const packageBytes = new Uint8Array(await file.arrayBuffer());
      const result = context.importProject(packageBytes);
      if (result.ok) {
        setProjectStatus({
          tone: "success",
          message: {
            key: "reactWorkbench.toolbar.status.opened.message",
            fallback: "Opened {fileName}",
            values: { fileName: file.name }
          }
        });
      } else {
        setProjectStatus(errorProjectStatus(
          result.problems[0]?.message,
          "reactWorkbench.toolbar.status.openFailed.message",
          "Project open failed"
        ));
      }
    } catch (error) {
      setProjectStatus(errorProjectStatus(
        error instanceof Error ? error.message : undefined,
        "reactWorkbench.toolbar.status.openFailed.message",
        "Project open failed"
      ));
    }
  }

  async function exportProject(partial: boolean) {
    const result = context.exportProject({ partial });
    if (!result.packageBytes) {
      setProjectStatus(errorProjectStatus(
        result.problems[0]?.message,
        "reactWorkbench.toolbar.status.exportFailed.message",
        "Project export failed"
      ));
      return;
    }

    try {
      const packageBytes = await resolvePackageBytes(result);
      downloadPackage(packageBytes, `${context.model.project.sceneName || "scene"}.ek3d`);
      setProjectStatus({
        tone: result.ok ? "success" : "warning",
        message: result.ok
          ? {
              key: "reactWorkbench.toolbar.status.exported.message",
              fallback: "Exported project"
            }
          : {
              key: "reactWorkbench.toolbar.status.exportedPartial.message",
              fallback: "Exported partial project ({problemCount} problems)",
              values: { problemCount: result.problems.length }
            }
      });
    } catch (error) {
      setProjectStatus(errorProjectStatus(
        error instanceof Error ? error.message : undefined,
        "reactWorkbench.toolbar.status.exportFailed.message",
        "Project export failed"
      ));
    }
  }

  return (
    <div className="ek-workbench__default-toolbar" aria-label={t("reactWorkbench.toolbar.controls.label")}>
      <div className="ek-workbench__tool-group" aria-label={t("reactWorkbench.toolbar.project.label")}>
        <button type="button" onClick={() => fileInputRef.current?.click()} title={t("reactWorkbench.toolbar.project.open.title")}>
          {t("reactWorkbench.toolbar.project.open.label")}
        </button>
        <input
          ref={fileInputRef}
          className="ek-workbench__file-input"
          type="file"
          accept={ACCEPT_PROJECT_PACKAGE}
          onChange={onOpenProject}
        />
        <button type="button" onClick={() => void exportProject(false)} title={t("reactWorkbench.toolbar.project.export.title")}>
          {t("reactWorkbench.toolbar.project.export.label")}
        </button>
        <button type="button" onClick={() => void exportProject(true)} title={t("reactWorkbench.toolbar.project.exportPartial.title")}>
          {t("reactWorkbench.toolbar.project.exportPartial.label")}
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label={t("reactWorkbench.toolbar.history.label")}>
        <button type="button" onClick={() => context.runAction("undo")} disabled={!toolbar.canUndo} title={t("reactWorkbench.toolbar.history.undo.title")}>
          {t("reactWorkbench.toolbar.history.undo.label")}
        </button>
        <button type="button" onClick={() => context.runAction("redo")} disabled={!toolbar.canRedo} title={t("reactWorkbench.toolbar.history.redo.title")}>
          {t("reactWorkbench.toolbar.history.redo.label")}
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label={t("reactWorkbench.toolbar.transform.label")}>
        <button type="button" onClick={() => context.runAction("transform-translate")} aria-pressed={toolbar.transformMode === "translate"} title={t("reactWorkbench.toolbar.transform.move.title")}>
          {t("reactWorkbench.toolbar.transform.move.label")}
        </button>
        <button type="button" onClick={() => context.runAction("transform-rotate")} aria-pressed={toolbar.transformMode === "rotate"} title={t("reactWorkbench.toolbar.transform.rotate.title")}>
          {t("reactWorkbench.toolbar.transform.rotate.label")}
        </button>
        <button type="button" onClick={() => context.runAction("transform-scale")} aria-pressed={toolbar.transformMode === "scale"} title={t("reactWorkbench.toolbar.transform.scale.title")}>
          {t("reactWorkbench.toolbar.transform.scale.label")}
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label={t("reactWorkbench.toolbar.snap.label")}>
        <button type="button" onClick={() => context.runAction("toggle-translate-snap")} aria-pressed={toolbar.snapEnabled.translate} title={t("reactWorkbench.toolbar.snap.move.title")}>
          {t("reactWorkbench.toolbar.snap.move.label")}
        </button>
        <button type="button" onClick={() => context.runAction("toggle-rotate-snap")} aria-pressed={toolbar.snapEnabled.rotate} title={t("reactWorkbench.toolbar.snap.rotate.title")}>
          {t("reactWorkbench.toolbar.snap.rotate.label")}
        </button>
        <button type="button" onClick={() => context.runAction("toggle-scale-snap")} aria-pressed={toolbar.snapEnabled.scale} title={t("reactWorkbench.toolbar.snap.scale.title")}>
          {t("reactWorkbench.toolbar.snap.scale.label")}
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label={t("reactWorkbench.toolbar.selection.label")}>
        <button type="button" onClick={onToggleMarqueeSelection} aria-pressed={marqueeSelectionEnabled} title={t("reactWorkbench.toolbar.selection.marquee.title")}>
          {t("reactWorkbench.toolbar.selection.marquee.label")}
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label={t("reactWorkbench.toolbar.helpers.label")}>
        <button type="button" onClick={() => context.toggleViewportHelper("grid")} aria-pressed={toolbar.viewportHelpers.grid} title={t("reactWorkbench.toolbar.helpers.grid.title")}>
          {t("reactWorkbench.toolbar.helpers.grid.label")}
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("floor")} aria-pressed={toolbar.viewportHelpers.floor} title={t("reactWorkbench.toolbar.helpers.floor.title")}>
          {t("reactWorkbench.toolbar.helpers.floor.label")}
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("axes")} aria-pressed={toolbar.viewportHelpers.axes} title={t("reactWorkbench.toolbar.helpers.axes.title")}>
          {t("reactWorkbench.toolbar.helpers.axes.label")}
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("hover")} aria-pressed={toolbar.viewportHelpers.hover} title={t("reactWorkbench.toolbar.helpers.hover.title")}>
          {t("reactWorkbench.toolbar.helpers.hover.label")}
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("selectionBounds")} aria-pressed={toolbar.viewportHelpers.selectionBounds} title={t("reactWorkbench.toolbar.helpers.bounds.title")}>
          {t("reactWorkbench.toolbar.helpers.bounds.label")}
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("snapFeedback")} aria-pressed={toolbar.viewportHelpers.snapFeedback} title={t("reactWorkbench.toolbar.helpers.guide.title")}>
          {t("reactWorkbench.toolbar.helpers.guide.label")}
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("lightGizmos")} aria-pressed={toolbar.viewportHelpers.lightGizmos} title={t("reactWorkbench.toolbar.helpers.lights.title")}>
          {t("reactWorkbench.toolbar.helpers.lights.label")}
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("lightTargets")} aria-pressed={toolbar.viewportHelpers.lightTargets} title={t("reactWorkbench.toolbar.helpers.targets.title")}>
          {t("reactWorkbench.toolbar.helpers.targets.label")}
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("shadowCameras")} aria-pressed={toolbar.viewportHelpers.shadowCameras} title={t("reactWorkbench.toolbar.helpers.shadowCam.title")}>
          {t("reactWorkbench.toolbar.helpers.shadowCam.label")}
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label={t("reactWorkbench.toolbar.camera.label")}>
        <button type="button" onClick={context.resetCamera} disabled={!context.camera.ready} title={t("reactWorkbench.toolbar.camera.reset.title")}>
          {t("reactWorkbench.toolbar.camera.reset.label")}
        </button>
        <button type="button" onClick={() => context.frameSelected()} disabled={!toolbar.canFrameSelected} title={t("reactWorkbench.toolbar.camera.frameSelected.title")}>
          {t("reactWorkbench.toolbar.camera.frameSelected.label")}
        </button>
        <button type="button" onClick={() => context.frameAll()} disabled={!toolbar.canFrameAll} title={t("reactWorkbench.toolbar.camera.frameAll.title")}>
          {t("reactWorkbench.toolbar.camera.frameAll.label")}
        </button>
        <button
          type="button"
          onClick={() => {
            const captured = context.captureCameraView({ name: `Camera view ${context.model.project.cameraViewCount + 1}` });
            if (captured) {
              const view = createAuthoredCameraViewInput(context.snapshot.cameras, captured);
              const result = context.dispatch({ type: "create-camera-view", view });
              if (result.ok) {
                context.setActiveCameraViewId(view.id ?? null);
              }
            }
          }}
          disabled={!toolbar.canCaptureCameraView}
          title={t("reactWorkbench.toolbar.camera.capture.title")}
        >
          {t("reactWorkbench.toolbar.camera.capture.label")}
        </button>
        <button
          type="button"
          onClick={() => {
            const view = context.activeCameraViewId ? context.snapshot.cameras[context.activeCameraViewId] : null;
            if (view) {
              context.applyCameraView(view);
            }
          }}
          disabled={!toolbar.canApplyCameraView}
          title={t("reactWorkbench.toolbar.camera.apply.title")}
        >
          {t("reactWorkbench.toolbar.camera.apply.label")}
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label={t("reactWorkbench.toolbar.node.label")}>
        <button type="button" onClick={() => context.runAction("copy")} disabled={!toolbar.canCopy} title={t("reactWorkbench.toolbar.node.copy.title")}>
          {t("reactWorkbench.toolbar.node.copy.label")}
        </button>
        <button type="button" onClick={() => context.runAction("paste")} disabled={!toolbar.canPaste} title={t("reactWorkbench.toolbar.node.paste.title")}>
          {t("reactWorkbench.toolbar.node.paste.label")}
        </button>
        <button type="button" onClick={() => context.runAction("duplicate")} disabled={!toolbar.canDuplicate} title={t("reactWorkbench.toolbar.node.duplicate.title")}>
          {t("reactWorkbench.toolbar.node.duplicate.label")}
        </button>
        <button type="button" onClick={() => context.runAction("delete")} disabled={!toolbar.canDelete} title={t("reactWorkbench.toolbar.node.delete.title")}>
          {t("reactWorkbench.toolbar.node.delete.label")}
        </button>
        <button type="button" onClick={() => context.runAction("group")} disabled={!toolbar.canGroup} title={t("reactWorkbench.toolbar.node.group.title")}>
          {t("reactWorkbench.toolbar.node.group.label")}
        </button>
        <button type="button" onClick={() => context.runAction("ungroup")} disabled={!toolbar.canUngroup} title={t("reactWorkbench.toolbar.node.ungroup.title")}>
          {t("reactWorkbench.toolbar.node.ungroup.label")}
        </button>
        <button type="button" onClick={() => context.runAction("select-all")} disabled={!toolbar.canSelectAll} title={t("reactWorkbench.toolbar.node.selectAll.title")}>
          {t("reactWorkbench.toolbar.node.selectAll.label")}
        </button>
        <button type="button" onClick={() => context.runAction("clear-selection")} disabled={!toolbar.canClearSelection} title={t("reactWorkbench.toolbar.node.clear.title")}>
          {t("reactWorkbench.toolbar.node.clear.label")}
        </button>
      </div>
      {showLocaleSwitcher ? (
        <label className="ek-workbench__locale-switcher">
          <span>{t("reactWorkbench.toolbar.locale.switch.label")}</span>
          <select
            aria-label={t("reactWorkbench.toolbar.locale.switch.label")}
            title={t("reactWorkbench.toolbar.locale.switch.title")}
            value={context.i18n.locale}
            disabled={localeSwitcherDisabled}
            onChange={(event) => {
              if (localeSwitcherDisabled) {
                return;
              }
              context.i18n.setLocale(event.target.value as typeof context.i18n.locale);
            }}
          >
            {context.i18n.supportedLocales.map((locale) => (
              <option key={locale} value={locale}>
                {context.i18n.localeLabel(locale)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <span className="ek-workbench__toolbar-status" data-tone={projectStatus.tone}>
        {projectStatusLabel}
      </span>
    </div>
  );
}

async function resolvePackageBytes(result: ProjectExportResult): Promise<Uint8Array> {
  const packageBytes = result.packageBytes;
  if (!packageBytes) {
    return new Uint8Array();
  }
  return packageBytes instanceof Uint8Array ? packageBytes : packageBytes;
}

function downloadPackage(packageBytes: Uint8Array, filename: string): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof Blob === "undefined"
  ) {
    return;
  }

  const payload = new ArrayBuffer(packageBytes.byteLength);
  new Uint8Array(payload).set(packageBytes);
  const blob = new Blob([payload], { type: "application/octet-stream" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = sanitizeFilename(filename);
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  if (typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(objectUrl);
  }
}

function sanitizeFilename(value: string): string {
  const trimmed = value.trim().replace(/[/\\?%*:|"<>]/g, "-");
  return trimmed.endsWith(".ek3d") ? trimmed : `${trimmed || "scene"}.ek3d`;
}

function errorProjectStatus(
  detail: string | undefined,
  key: WorkbenchMessageKey,
  fallback: string
): ProjectActionStatus {
  if (detail) {
    return {
      tone: "error",
      fallback: detail
    };
  }
  return {
    tone: "error",
    message: { key, fallback }
  };
}
