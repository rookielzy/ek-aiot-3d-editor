import { useRef, useState, type ChangeEvent } from "react";
import { createAuthoredCameraViewInput } from "@ek-aiot/3d-editor-core";
import type { WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { WorkbenchIcon, type WorkbenchIconName } from "./WorkbenchIcon";

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

interface CommandButton {
  key: string;
  icon: WorkbenchIconName;
  label: WorkbenchMessageKey;
  title: WorkbenchMessageKey;
  onClick(): void;
  disabled?: boolean;
  pressed?: boolean;
  priority?: "primary" | "secondary";
}

interface CommandGroup {
  key: string;
  label: WorkbenchMessageKey;
  commands: CommandButton[];
}

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
  const commandGroups: CommandGroup[] = [
    {
      key: "history",
      label: "reactWorkbench.toolbar.history.label",
      commands: [
        {
          key: "undo",
          icon: "undo",
          label: "reactWorkbench.toolbar.history.undo.label",
          title: "reactWorkbench.toolbar.history.undo.title",
          disabled: !toolbar.canUndo,
          onClick: () => context.runAction("undo")
        },
        {
          key: "redo",
          icon: "redo",
          label: "reactWorkbench.toolbar.history.redo.label",
          title: "reactWorkbench.toolbar.history.redo.title",
          disabled: !toolbar.canRedo,
          onClick: () => context.runAction("redo")
        }
      ]
    },
    {
      key: "transform",
      label: "reactWorkbench.toolbar.transform.label",
      commands: [
        {
          key: "move",
          icon: "move",
          label: "reactWorkbench.toolbar.transform.move.label",
          title: "reactWorkbench.toolbar.transform.move.title",
          pressed: toolbar.transformMode === "translate",
          priority: "primary",
          onClick: () => context.runAction("transform-translate")
        },
        {
          key: "rotate",
          icon: "rotate",
          label: "reactWorkbench.toolbar.transform.rotate.label",
          title: "reactWorkbench.toolbar.transform.rotate.title",
          pressed: toolbar.transformMode === "rotate",
          priority: "primary",
          onClick: () => context.runAction("transform-rotate")
        },
        {
          key: "scale",
          icon: "scale",
          label: "reactWorkbench.toolbar.transform.scale.label",
          title: "reactWorkbench.toolbar.transform.scale.title",
          pressed: toolbar.transformMode === "scale",
          priority: "primary",
          onClick: () => context.runAction("transform-scale")
        }
      ]
    },
    {
      key: "snap",
      label: "reactWorkbench.toolbar.snap.label",
      commands: [
        {
          key: "snap-move",
          icon: "snap",
          label: "reactWorkbench.toolbar.snap.move.label",
          title: "reactWorkbench.toolbar.snap.move.title",
          pressed: toolbar.snapEnabled.translate,
          onClick: () => context.runAction("toggle-translate-snap")
        },
        {
          key: "snap-rotate",
          icon: "snap",
          label: "reactWorkbench.toolbar.snap.rotate.label",
          title: "reactWorkbench.toolbar.snap.rotate.title",
          pressed: toolbar.snapEnabled.rotate,
          onClick: () => context.runAction("toggle-rotate-snap")
        },
        {
          key: "snap-scale",
          icon: "snap",
          label: "reactWorkbench.toolbar.snap.scale.label",
          title: "reactWorkbench.toolbar.snap.scale.title",
          pressed: toolbar.snapEnabled.scale,
          onClick: () => context.runAction("toggle-scale-snap")
        }
      ]
    },
    {
      key: "selection",
      label: "reactWorkbench.toolbar.selection.label",
      commands: [
        {
          key: "marquee",
          icon: "marquee",
          label: "reactWorkbench.toolbar.selection.marquee.label",
          title: "reactWorkbench.toolbar.selection.marquee.title",
          pressed: marqueeSelectionEnabled,
          onClick: () => onToggleMarqueeSelection?.()
        }
      ]
    },
    {
      key: "helpers",
      label: "reactWorkbench.toolbar.helpers.label",
      commands: [
        {
          key: "grid",
          icon: "grid",
          label: "reactWorkbench.toolbar.helpers.grid.label",
          title: "reactWorkbench.toolbar.helpers.grid.title",
          pressed: toolbar.viewportHelpers.grid,
          onClick: () => context.toggleViewportHelper("grid")
        },
        {
          key: "floor",
          icon: "floor",
          label: "reactWorkbench.toolbar.helpers.floor.label",
          title: "reactWorkbench.toolbar.helpers.floor.title",
          pressed: toolbar.viewportHelpers.floor,
          onClick: () => context.toggleViewportHelper("floor")
        },
        {
          key: "axes",
          icon: "axes",
          label: "reactWorkbench.toolbar.helpers.axes.label",
          title: "reactWorkbench.toolbar.helpers.axes.title",
          pressed: toolbar.viewportHelpers.axes,
          onClick: () => context.toggleViewportHelper("axes")
        },
        {
          key: "hover",
          icon: "hover",
          label: "reactWorkbench.toolbar.helpers.hover.label",
          title: "reactWorkbench.toolbar.helpers.hover.title",
          pressed: toolbar.viewportHelpers.hover,
          onClick: () => context.toggleViewportHelper("hover")
        },
        {
          key: "bounds",
          icon: "bounds",
          label: "reactWorkbench.toolbar.helpers.bounds.label",
          title: "reactWorkbench.toolbar.helpers.bounds.title",
          pressed: toolbar.viewportHelpers.selectionBounds,
          onClick: () => context.toggleViewportHelper("selectionBounds")
        },
        {
          key: "guide",
          icon: "snap",
          label: "reactWorkbench.toolbar.helpers.guide.label",
          title: "reactWorkbench.toolbar.helpers.guide.title",
          pressed: toolbar.viewportHelpers.snapFeedback,
          onClick: () => context.toggleViewportHelper("snapFeedback")
        },
        {
          key: "lights",
          icon: "lights",
          label: "reactWorkbench.toolbar.helpers.lights.label",
          title: "reactWorkbench.toolbar.helpers.lights.title",
          pressed: toolbar.viewportHelpers.lightGizmos,
          onClick: () => context.toggleViewportHelper("lightGizmos")
        },
        {
          key: "targets",
          icon: "targets",
          label: "reactWorkbench.toolbar.helpers.targets.label",
          title: "reactWorkbench.toolbar.helpers.targets.title",
          pressed: toolbar.viewportHelpers.lightTargets,
          onClick: () => context.toggleViewportHelper("lightTargets")
        },
        {
          key: "shadow-camera",
          icon: "shadow-camera",
          label: "reactWorkbench.toolbar.helpers.shadowCam.label",
          title: "reactWorkbench.toolbar.helpers.shadowCam.title",
          pressed: toolbar.viewportHelpers.shadowCameras,
          onClick: () => context.toggleViewportHelper("shadowCameras")
        }
      ]
    },
    {
      key: "camera",
      label: "reactWorkbench.toolbar.camera.label",
      commands: [
        {
          key: "reset-camera",
          icon: "reset-camera",
          label: "reactWorkbench.toolbar.camera.reset.label",
          title: "reactWorkbench.toolbar.camera.reset.title",
          disabled: !context.camera.ready,
          onClick: context.resetCamera
        },
        {
          key: "frame-selected",
          icon: "frame-selected",
          label: "reactWorkbench.toolbar.camera.frameSelected.label",
          title: "reactWorkbench.toolbar.camera.frameSelected.title",
          disabled: !toolbar.canFrameSelected,
          onClick: () => context.frameSelected()
        },
        {
          key: "frame-all",
          icon: "frame-all",
          label: "reactWorkbench.toolbar.camera.frameAll.label",
          title: "reactWorkbench.toolbar.camera.frameAll.title",
          disabled: !toolbar.canFrameAll,
          onClick: () => context.frameAll()
        },
        {
          key: "capture-view",
          icon: "capture-view",
          label: "reactWorkbench.toolbar.camera.capture.label",
          title: "reactWorkbench.toolbar.camera.capture.title",
          disabled: !toolbar.canCaptureCameraView,
          onClick: () => {
            const captured = context.captureCameraView({ name: `Camera view ${context.model.project.cameraViewCount + 1}` });
            if (captured) {
              const view = createAuthoredCameraViewInput(context.snapshot.cameras, captured);
              const result = context.dispatch({ type: "create-camera-view", view });
              if (result.ok) {
                context.setActiveCameraViewId(view.id ?? null);
              }
            }
          }
        },
        {
          key: "apply-view",
          icon: "apply-view",
          label: "reactWorkbench.toolbar.camera.apply.label",
          title: "reactWorkbench.toolbar.camera.apply.title",
          disabled: !toolbar.canApplyCameraView,
          onClick: () => {
            const view = context.activeCameraViewId ? context.snapshot.cameras[context.activeCameraViewId] : null;
            if (view) {
              context.applyCameraView(view);
            }
          }
        }
      ]
    },
    {
      key: "node",
      label: "reactWorkbench.toolbar.node.label",
      commands: [
        {
          key: "copy",
          icon: "copy",
          label: "reactWorkbench.toolbar.node.copy.label",
          title: "reactWorkbench.toolbar.node.copy.title",
          disabled: !toolbar.canCopy,
          onClick: () => context.runAction("copy")
        },
        {
          key: "paste",
          icon: "paste",
          label: "reactWorkbench.toolbar.node.paste.label",
          title: "reactWorkbench.toolbar.node.paste.title",
          disabled: !toolbar.canPaste,
          onClick: () => context.runAction("paste")
        },
        {
          key: "duplicate",
          icon: "duplicate",
          label: "reactWorkbench.toolbar.node.duplicate.label",
          title: "reactWorkbench.toolbar.node.duplicate.title",
          disabled: !toolbar.canDuplicate,
          onClick: () => context.runAction("duplicate")
        },
        {
          key: "delete",
          icon: "delete",
          label: "reactWorkbench.toolbar.node.delete.label",
          title: "reactWorkbench.toolbar.node.delete.title",
          disabled: !toolbar.canDelete,
          onClick: () => context.runAction("delete")
        },
        {
          key: "group",
          icon: "group",
          label: "reactWorkbench.toolbar.node.group.label",
          title: "reactWorkbench.toolbar.node.group.title",
          disabled: !toolbar.canGroup,
          onClick: () => context.runAction("group")
        },
        {
          key: "ungroup",
          icon: "ungroup",
          label: "reactWorkbench.toolbar.node.ungroup.label",
          title: "reactWorkbench.toolbar.node.ungroup.title",
          disabled: !toolbar.canUngroup,
          onClick: () => context.runAction("ungroup")
        },
        {
          key: "select-all",
          icon: "select-all",
          label: "reactWorkbench.toolbar.node.selectAll.label",
          title: "reactWorkbench.toolbar.node.selectAll.title",
          disabled: !toolbar.canSelectAll,
          onClick: () => context.runAction("select-all")
        },
        {
          key: "clear-selection",
          icon: "clear-selection",
          label: "reactWorkbench.toolbar.node.clear.label",
          title: "reactWorkbench.toolbar.node.clear.title",
          disabled: !toolbar.canClearSelection,
          onClick: () => context.runAction("clear-selection")
        }
      ]
    }
  ];

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
      const packageBytes = await result.packageBytes;
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
      <div className="ek-workbench__tool-group ek-workbench__tool-group--project" aria-label={t("reactWorkbench.toolbar.project.label")}>
        <button className="ek-workbench__command-button ek-workbench__command-button--primary" type="button" onClick={() => fileInputRef.current?.click()} title={t("reactWorkbench.toolbar.project.open.title")}>
          <WorkbenchIcon name="open" />
          <span>{t("reactWorkbench.toolbar.project.open.label")}</span>
        </button>
        <input
          ref={fileInputRef}
          className="ek-workbench__file-input"
          type="file"
          accept={ACCEPT_PROJECT_PACKAGE}
          onChange={onOpenProject}
        />
        <button className="ek-workbench__command-button" type="button" onClick={() => void exportProject(false)} title={t("reactWorkbench.toolbar.project.export.title")}>
          <WorkbenchIcon name="export" />
          <span>{t("reactWorkbench.toolbar.project.export.label")}</span>
        </button>
        <button className="ek-workbench__command-button" type="button" onClick={() => void exportProject(true)} title={t("reactWorkbench.toolbar.project.exportPartial.title")}>
          <WorkbenchIcon name="export-partial" />
          <span>{t("reactWorkbench.toolbar.project.exportPartial.label")}</span>
        </button>
      </div>
      {commandGroups.map((group) => (
        <div key={group.key} className="ek-workbench__tool-group" aria-label={t(group.label)}>
          {group.commands.map((command) => (
            <button
              key={command.key}
              className={command.priority === "primary" ? "ek-workbench__command-button ek-workbench__command-button--primary" : "ek-workbench__command-button"}
              type="button"
              onClick={command.onClick}
              disabled={command.disabled}
              aria-pressed={typeof command.pressed === "boolean" ? command.pressed : undefined}
              title={t(command.title)}
            >
              <WorkbenchIcon name={command.icon} />
              <span>{t(command.label)}</span>
            </button>
          ))}
        </div>
      ))}
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
        <span className="ek-workbench__toolbar-status-label">{t("reactWorkbench.toolbar.status.label")}</span>
        {projectStatusLabel}
      </span>
    </div>
  );
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
