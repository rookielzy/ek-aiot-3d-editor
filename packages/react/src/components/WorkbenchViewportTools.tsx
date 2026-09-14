import { useEffect, useId, useRef, useState } from "react";
import { createAuthoredCameraViewInput } from "@ek-aiot/3d-editor-core";
import type { WorkbenchMessageKey } from "../i18n/workbench-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { WorkbenchIcon, type WorkbenchIconName } from "./WorkbenchIcon";

interface WorkbenchViewportToolsProps {
  context: ResolvedWorkbenchContext;
  marqueeSelectionEnabled: boolean;
  onToggleMarqueeSelection(): void;
}

interface CommandButton {
  key: string;
  icon: WorkbenchIconName;
  label: WorkbenchMessageKey;
  title: WorkbenchMessageKey;
  onClick(): void;
  disabled?: boolean;
  pressed?: boolean;
}

type CommandGroupKey = "history" | "transform" | "snap" | "selection" | "helpers" | "camera" | "node";

interface CommandGroup {
  key: CommandGroupKey;
  label: WorkbenchMessageKey;
  commands: CommandButton[];
}

export function WorkbenchViewportTools({ context, marqueeSelectionEnabled, onToggleMarqueeSelection }: WorkbenchViewportToolsProps) {
  const toolbar = context.model.toolbar;
  const t = context.i18n.t;
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [openGroup, setOpenGroup] = useState<CommandGroupKey | null>(null);

  useEffect(() => {
    if (!openGroup) return;
    panelRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpenGroup(null);
      }
    }
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [openGroup]);

  function closeGroup() {
    setOpenGroup(null);
    triggerRef.current?.focus();
  }

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
          onClick: () => context.runAction("transform-translate")
        },
        {
          key: "rotate",
          icon: "rotate",
          label: "reactWorkbench.toolbar.transform.rotate.label",
          title: "reactWorkbench.toolbar.transform.rotate.title",
          pressed: toolbar.transformMode === "rotate",
          onClick: () => context.runAction("transform-rotate")
        },
        {
          key: "scale",
          icon: "scale",
          label: "reactWorkbench.toolbar.transform.scale.label",
          title: "reactWorkbench.toolbar.transform.scale.title",
          pressed: toolbar.transformMode === "scale",
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
          icon: "move",
          label: "reactWorkbench.toolbar.snap.move.label",
          title: "reactWorkbench.toolbar.snap.move.title",
          pressed: toolbar.snapEnabled.translate,
          onClick: () => context.runAction("toggle-translate-snap")
        },
        {
          key: "snap-rotate",
          icon: "rotate",
          label: "reactWorkbench.toolbar.snap.rotate.label",
          title: "reactWorkbench.toolbar.snap.rotate.title",
          pressed: toolbar.snapEnabled.rotate,
          onClick: () => context.runAction("toggle-rotate-snap")
        },
        {
          key: "snap-scale",
          icon: "scale",
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

  const directGroups = commandGroups.filter((group) => !["helpers", "camera", "node"].includes(group.key));
  const menus = commandGroups.filter((group) => ["helpers", "camera", "node"].includes(group.key));
  function renderCommand(command: CommandButton, compact: boolean) {
    return (
      <button
        key={command.key}
        className={`ek-workbench__command-button${compact ? " ek-workbench__command-button--icon" : ""}`}
        type="button"
        onClick={() => {
          command.onClick();
          if (!compact && openGroup !== "helpers") closeGroup();
        }}
        disabled={command.disabled}
        aria-label={t(command.label)}
        aria-pressed={command.pressed}
        title={t(command.title)}
      >
        <WorkbenchIcon name={command.icon} />
        {command.key.startsWith("snap-") ? <i className="ek-workbench__snap-mark" aria-hidden="true"><WorkbenchIcon name="snap" /></i> : null}
        <span>{t(command.label)}</span>
      </button>
    );
  }

  return (
    <div ref={rootRef} className="ek-workbench__viewport-tools"
      onKeyDownCapture={(event) => {
        if (openGroup && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeGroup();
        }
      }}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpenGroup(null);
      }}
    >
      <div className="ek-workbench__viewport-tool-strip">
        {directGroups.map((group) => (
          <div key={group.key} className="ek-workbench__tool-group" role="group" aria-label={t(group.label)}>
            {group.commands.map((command) => renderCommand(command, true))}
          </div>
        ))}
        <div className="ek-workbench__tool-group">
          {menus.map((group) => (
            <button key={group.key} type="button" className="ek-workbench__command-button ek-workbench__command-button--icon"
              aria-label={t(group.label)} title={t(group.label)} aria-expanded={openGroup === group.key}
              aria-controls={`${id}-${group.key}`}
              onClick={(event) => {
                triggerRef.current = event.currentTarget;
                setOpenGroup(openGroup === group.key ? null : group.key);
              }}
            >
              <WorkbenchIcon name={group.key === "helpers" ? "grid" : group.key === "camera" ? "capture-view" : "group"} />
              <span>{t(group.label)}</span>
            </button>
          ))}
        </div>
      </div>
      {menus.map((group) => (
        <div key={group.key} id={`${id}-${group.key}`} hidden={openGroup !== group.key}
          ref={openGroup === group.key ? panelRef : undefined}
          className="ek-workbench__tool-popover" role="group" aria-label={t(group.label)}>
          <strong>{t(group.label)}</strong>
          {group.commands.map((command) => renderCommand(command, false))}
        </div>
      ))}
    </div>
  );
}
