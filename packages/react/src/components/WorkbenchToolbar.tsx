import { useRef, useState, type ChangeEvent } from "react";
import { createAuthoredCameraViewInput, type ProjectExportResult } from "@ek-aiot/3d-editor-core";
import type { WorkbenchContext } from "../hooks/use-workbench";

export interface WorkbenchToolbarProps {
  context: WorkbenchContext;
  marqueeSelectionEnabled?: boolean;
  onToggleMarqueeSelection?(): void;
}

type ProjectActionStatus = {
  tone: "neutral" | "success" | "warning" | "error";
  label: string;
};

const ACCEPT_PROJECT_PACKAGE = ".ek3d,application/octet-stream";

export function WorkbenchToolbar({ context, marqueeSelectionEnabled = false, onToggleMarqueeSelection }: WorkbenchToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [projectStatus, setProjectStatus] = useState<ProjectActionStatus>({
    tone: "neutral",
    label: context.model.project.statusLabel
  });
  const toolbar = context.model.toolbar;

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
        setProjectStatus({ tone: "success", label: `Opened ${file.name}` });
      } else {
        setProjectStatus({ tone: "error", label: result.problems[0]?.message ?? "Project open failed" });
      }
    } catch (error) {
      setProjectStatus({ tone: "error", label: error instanceof Error ? error.message : "Project open failed" });
    }
  }

  async function exportProject(partial: boolean) {
    const result = context.exportProject({ partial });
    if (!result.packageBytes) {
      setProjectStatus({
        tone: "error",
        label: result.problems[0]?.message ?? "Project export failed"
      });
      return;
    }

    try {
      const packageBytes = await resolvePackageBytes(result);
      downloadPackage(packageBytes, `${context.model.project.sceneName || "scene"}.ek3d`);
      setProjectStatus({
        tone: result.ok ? "success" : "warning",
        label: result.ok ? "Exported project" : `Exported partial project (${result.problems.length} problems)`
      });
    } catch (error) {
      setProjectStatus({ tone: "error", label: error instanceof Error ? error.message : "Project export failed" });
    }
  }

  return (
    <div className="ek-workbench__default-toolbar" aria-label="Editor controls">
      <div className="ek-workbench__tool-group" aria-label="Project actions">
        <button type="button" onClick={() => fileInputRef.current?.click()} title="Open project package">
          Open
        </button>
        <input
          ref={fileInputRef}
          className="ek-workbench__file-input"
          type="file"
          accept={ACCEPT_PROJECT_PACKAGE}
          onChange={onOpenProject}
        />
        <button type="button" onClick={() => void exportProject(false)} title="Export complete project">
          Export
        </button>
        <button type="button" onClick={() => void exportProject(true)} title="Export partial project">
          Export partial
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label="History">
        <button type="button" onClick={() => context.runAction("undo")} disabled={!toolbar.canUndo} title="Undo">
          Undo
        </button>
        <button type="button" onClick={() => context.runAction("redo")} disabled={!toolbar.canRedo} title="Redo">
          Redo
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label="Transform mode">
        <button type="button" onClick={() => context.runAction("transform-translate")} aria-pressed={toolbar.transformMode === "translate"} title="Move mode">
          Move
        </button>
        <button type="button" onClick={() => context.runAction("transform-rotate")} aria-pressed={toolbar.transformMode === "rotate"} title="Rotate mode">
          Rotate
        </button>
        <button type="button" onClick={() => context.runAction("transform-scale")} aria-pressed={toolbar.transformMode === "scale"} title="Scale mode">
          Scale
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label="Snap">
        <button type="button" onClick={() => context.runAction("toggle-translate-snap")} aria-pressed={toolbar.snapEnabled.translate} title="Toggle move snap">
          Snap move
        </button>
        <button type="button" onClick={() => context.runAction("toggle-rotate-snap")} aria-pressed={toolbar.snapEnabled.rotate} title="Toggle rotate snap">
          Snap rotate
        </button>
        <button type="button" onClick={() => context.runAction("toggle-scale-snap")} aria-pressed={toolbar.snapEnabled.scale} title="Toggle scale snap">
          Snap scale
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label="Selection tools">
        <button type="button" onClick={onToggleMarqueeSelection} aria-pressed={marqueeSelectionEnabled} title="Toggle marquee selection">
          Marquee
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label="Viewport helpers">
        <button type="button" onClick={() => context.toggleViewportHelper("grid")} aria-pressed={toolbar.viewportHelpers.grid} title="Toggle viewport grid">
          Grid
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("floor")} aria-pressed={toolbar.viewportHelpers.floor} title="Toggle viewport floor">
          Floor
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("axes")} aria-pressed={toolbar.viewportHelpers.axes} title="Toggle viewport axes">
          Axes
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("hover")} aria-pressed={toolbar.viewportHelpers.hover} title="Toggle hover feedback">
          Hover
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("selectionBounds")} aria-pressed={toolbar.viewportHelpers.selectionBounds} title="Toggle selection bounds">
          Bounds
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("snapFeedback")} aria-pressed={toolbar.viewportHelpers.snapFeedback} title="Toggle snap feedback">
          Guide
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("lightGizmos")} aria-pressed={toolbar.viewportHelpers.lightGizmos} title="Toggle light gizmos">
          Lights
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("lightTargets")} aria-pressed={toolbar.viewportHelpers.lightTargets} title="Toggle light targets">
          Targets
        </button>
        <button type="button" onClick={() => context.toggleViewportHelper("shadowCameras")} aria-pressed={toolbar.viewportHelpers.shadowCameras} title="Toggle shadow camera helpers">
          Shadow cam
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label="Camera">
        <button type="button" onClick={context.resetCamera} disabled={!context.camera.ready} title="Reset camera">
          Reset
        </button>
        <button type="button" onClick={() => context.frameSelected()} disabled={!toolbar.canFrameSelected} title="Frame selected">
          Frame sel
        </button>
        <button type="button" onClick={() => context.frameAll()} disabled={!toolbar.canFrameAll} title="Frame all">
          Frame all
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
          title="Capture camera view"
        >
          Capture view
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
          title="Apply camera view"
        >
          Apply view
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label="Node operations">
        <button type="button" onClick={() => context.runAction("copy")} disabled={!toolbar.canCopy} title="Copy selection">
          Copy
        </button>
        <button type="button" onClick={() => context.runAction("paste")} disabled={!toolbar.canPaste} title="Paste objects">
          Paste
        </button>
        <button type="button" onClick={() => context.runAction("duplicate")} disabled={!toolbar.canDuplicate} title="Duplicate selection">
          Duplicate
        </button>
        <button type="button" onClick={() => context.runAction("delete")} disabled={!toolbar.canDelete} title="Delete selection">
          Delete
        </button>
        <button type="button" onClick={() => context.runAction("group")} disabled={!toolbar.canGroup} title="Group selection">
          Group
        </button>
        <button type="button" onClick={() => context.runAction("ungroup")} disabled={!toolbar.canUngroup} title="Ungroup selection">
          Ungroup
        </button>
        <button type="button" onClick={() => context.runAction("select-all")} disabled={!toolbar.canSelectAll} title="Select all">
          Select all
        </button>
        <button type="button" onClick={() => context.runAction("clear-selection")} disabled={!toolbar.canClearSelection} title="Clear selection">
          Clear
        </button>
      </div>
      <span className="ek-workbench__toolbar-status" data-tone={projectStatus.tone}>
        {projectStatus.label}
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
