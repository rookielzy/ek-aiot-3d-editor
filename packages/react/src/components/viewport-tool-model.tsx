import { createAuthoredCameraViewInput, type MessageDescriptor as WorkbenchMessageDescriptor } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import type { WorkbenchMessageKey } from "../i18n/workbench-i18n";
import type { WorkbenchIconName } from "./WorkbenchIcon";

export interface ViewportToolCommand {
  key: string;
  icon: WorkbenchIconName;
  label: WorkbenchMessageKey;
  title: WorkbenchMessageKey;
  /** Platform-ready key bindings announced as `aria-keyshortcuts`. */
  shortcut?: string;
  /** Translated availability reason, present whenever the command is disabled. */
  disabledReason?: string;
  onClick(): void;
  disabled?: boolean;
  pressed?: boolean;
}

export type ViewportToolGroupKey = "history" | "transform" | "snap" | "selection" | "helpers" | "camera" | "node";

export interface ViewportToolGroup {
  key: ViewportToolGroupKey;
  label: WorkbenchMessageKey;
  /** `pressed` groups toggle repeatedly and keep their menu open. */
  kind: "action" | "pressed";
  commands: ViewportToolCommand[];
}

export type ViewportToolEntry =
  | { kind: "group"; key: string; label: WorkbenchMessageKey; groups: ViewportToolGroup[] }
  | { kind: "menu"; key: string; label: WorkbenchMessageKey; group: ViewportToolGroup };

const MODIFIER = /^Ctrl\+/;
const DELETE_KEYS = "Delete Backspace";

function shortcut(binding: string, platform: string): string {
  if (!MODIFIER.test(binding)) return binding;
  const rest = binding.slice("Ctrl+".length);
  const primary = platform.startsWith("Mac") ? "Meta" : "Control";
  if (rest === "Z") return `${primary}+Z ${primary === "Meta" ? "Control" : "Meta"}+Z`;
  if (rest === "Y") return `${primary}+Y`;
  return `${primary}+${rest}`;
}

/**
 * Builds the viewport tool strip as direct commands plus the grouped menus that
 * hold helpers, camera, and lower-frequency node operations.
 */
export function buildViewportToolEntries(
  context: ResolvedWorkbenchContext,
  options: { marqueeSelectionEnabled: boolean; platform?: string; onToggleMarqueeSelection?(): void }
): ViewportToolEntry[] {
  const { marqueeSelectionEnabled, platform = globalThis.navigator?.platform ?? "" } = options;
  const toolbar = context.model.toolbar;
  const disabled = toolbar.disabledReasons;
  const sign = (binding: string) => shortcut(binding, platform);
  const describe = (reason: WorkbenchMessageDescriptor | undefined) => (reason ? context.i18n.t(reason) : undefined);

  const helpAllPressed = Object.values(toolbar.viewportHelpers).every(Boolean);

  const groups: ViewportToolGroup[] = [
    {
      kind: "action",
      key: "history",
      label: "reactWorkbench.toolbar.history.label",
      commands: [
        {
          key: "undo",
          icon: "undo",
          label: "reactWorkbench.toolbar.history.undo.label",
          title: "reactWorkbench.toolbar.history.undo.title",
          shortcut: `${sign("Ctrl+Z")}`,
          disabledReason: describe(disabled?.canUndo),
          disabled: !toolbar.canUndo,
          onClick: () => context.runAction("undo")
        },
        {
          key: "redo",
          icon: "redo",
          label: "reactWorkbench.toolbar.history.redo.label",
          title: "reactWorkbench.toolbar.history.redo.title",
          shortcut: `${sign("Ctrl+Shift+Z")} ${sign("Ctrl+Y")}`,
          disabledReason: describe(disabled?.canRedo),
          disabled: !toolbar.canRedo,
          onClick: () => context.runAction("redo")
        }
      ]
    },
    {
      kind: "pressed",
      key: "transform",
      label: "reactWorkbench.toolbar.transform.label",
      commands: [
        {
          key: "move",
          icon: "move",
          label: "reactWorkbench.toolbar.transform.move.label",
          title: "reactWorkbench.toolbar.transform.move.title",
          shortcut: "W",
          pressed: toolbar.transformMode === "translate",
          onClick: () => context.runAction("transform-translate")
        },
        {
          key: "rotate",
          icon: "rotate",
          label: "reactWorkbench.toolbar.transform.rotate.label",
          title: "reactWorkbench.toolbar.transform.rotate.title",
          shortcut: "E",
          pressed: toolbar.transformMode === "rotate",
          onClick: () => context.runAction("transform-rotate")
        },
        {
          key: "scale",
          icon: "scale",
          label: "reactWorkbench.toolbar.transform.scale.label",
          title: "reactWorkbench.toolbar.transform.scale.title",
          shortcut: "R",
          pressed: toolbar.transformMode === "scale",
          onClick: () => context.runAction("transform-scale")
        }
      ]
    },
    {
      kind: "pressed",
      key: "snap",
      label: "reactWorkbench.toolbar.snap.label",
      commands: [
        {
          key: "snap-move",
          icon: "move",
          label: "reactWorkbench.toolbar.snap.move.label",
          title: "reactWorkbench.toolbar.snap.move.title",
          shortcut: sign("Ctrl+Alt+W"),
          pressed: toolbar.snapEnabled.translate,
          onClick: () => context.runAction("toggle-translate-snap")
        },
        {
          key: "snap-rotate",
          icon: "rotate",
          label: "reactWorkbench.toolbar.snap.rotate.label",
          title: "reactWorkbench.toolbar.snap.rotate.title",
          shortcut: sign("Ctrl+Alt+E"),
          pressed: toolbar.snapEnabled.rotate,
          onClick: () => context.runAction("toggle-rotate-snap")
        },
        {
          key: "snap-scale",
          icon: "scale",
          label: "reactWorkbench.toolbar.snap.scale.label",
          title: "reactWorkbench.toolbar.snap.scale.title",
          shortcut: sign("Ctrl+Alt+R"),
          pressed: toolbar.snapEnabled.scale,
          onClick: () => context.runAction("toggle-scale-snap")
        }
      ]
    },
    {
      kind: "pressed",
      key: "selection",
      label: "reactWorkbench.toolbar.selection.label",
      commands: [
        {
          key: "marquee",
          icon: "marquee",
          label: "reactWorkbench.toolbar.selection.marquee.label",
          title: "reactWorkbench.toolbar.selection.marquee.title",
          pressed: marqueeSelectionEnabled,
          onClick: () => options.onToggleMarqueeSelection?.()
        }
      ]
    },
    {
      kind: "pressed",
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
        },
        {
          key: "helpers-all",
          icon: "grid",
          label: "reactWorkbench.toolbar.helpers.toggleAll",
          title: "reactWorkbench.toolbar.helpers.toggleAll",
          pressed: helpAllPressed,
          onClick: () => {
            const target = !helpAllPressed;
            for (const key of ["grid", "floor", "axes", "hover", "selectionBounds", "snapFeedback", "lightGizmos", "lightTargets", "shadowCameras"] as const) {
              if (toolbar.viewportHelpers[key] !== target) context.toggleViewportHelper(key);
            }
          }
        }
      ]
    },
    {
      kind: "action",
      key: "camera",
      label: "reactWorkbench.toolbar.camera.label",
      commands: [
        {
          key: "reset-camera",
          icon: "reset-camera",
          label: "reactWorkbench.toolbar.camera.reset.label",
          title: "reactWorkbench.toolbar.camera.reset.title",
          disabledReason: context.camera.ready ? undefined : context.i18n.t("reactWorkbench.toolbar.camera.reset.reason"),
          disabled: !context.camera.ready,
          onClick: context.resetCamera
        },
        {
          key: "frame-selected",
          icon: "frame-selected",
          label: "reactWorkbench.toolbar.camera.frameSelected.label",
          title: "reactWorkbench.toolbar.camera.frameSelected.title",
          disabledReason: describe(disabled?.canFrameSelected),
          disabled: !toolbar.canFrameSelected,
          onClick: () => context.frameSelected()
        },
        {
          key: "frame-all",
          icon: "frame-all",
          label: "reactWorkbench.toolbar.camera.frameAll.label",
          title: "reactWorkbench.toolbar.camera.frameAll.title",
          disabledReason: describe(disabled?.canFrameAll),
          disabled: !toolbar.canFrameAll,
          onClick: () => context.frameAll()
        },
        {
          key: "capture-view",
          icon: "capture-view",
          label: "reactWorkbench.toolbar.camera.capture.label",
          title: "reactWorkbench.toolbar.camera.capture.title",
          disabledReason: describe(disabled?.canCaptureCameraView),
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
          disabledReason: describe(disabled?.canApplyCameraView),
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
      kind: "action",
      key: "node",
      label: "reactWorkbench.toolbar.node.label",
      commands: [
        {
          key: "copy",
          icon: "copy",
          label: "reactWorkbench.toolbar.node.copy.label",
          title: "reactWorkbench.toolbar.node.copy.title",
          shortcut: sign("Ctrl+C"),
          disabledReason: describe(disabled?.canCopy),
          disabled: !toolbar.canCopy,
          onClick: () => context.runAction("copy")
        },
        {
          key: "paste",
          icon: "paste",
          label: "reactWorkbench.toolbar.node.paste.label",
          title: "reactWorkbench.toolbar.node.paste.title",
          shortcut: sign("Ctrl+V"),
          disabledReason: describe(disabled?.canPaste),
          disabled: !toolbar.canPaste,
          onClick: () => context.runAction("paste")
        },
        {
          key: "duplicate",
          icon: "duplicate",
          label: "reactWorkbench.toolbar.node.duplicate.label",
          title: "reactWorkbench.toolbar.node.duplicate.title",
          shortcut: sign("Ctrl+D"),
          disabledReason: describe(disabled?.canDuplicate),
          disabled: !toolbar.canDuplicate,
          onClick: () => context.runAction("duplicate")
        },
        {
          key: "delete",
          icon: "delete",
          label: "reactWorkbench.toolbar.node.delete.label",
          title: "reactWorkbench.toolbar.node.delete.title",
          shortcut: DELETE_KEYS,
          disabledReason: describe(disabled?.canDelete),
          disabled: !toolbar.canDelete,
          onClick: () => context.runAction("delete")
        },
        {
          key: "group",
          icon: "group",
          label: "reactWorkbench.toolbar.node.group.label",
          title: "reactWorkbench.toolbar.node.group.title",
          shortcut: sign("Ctrl+G"),
          disabledReason: describe(disabled?.canGroup),
          disabled: !toolbar.canGroup,
          onClick: () => context.runAction("group")
        },
        {
          key: "ungroup",
          icon: "ungroup",
          label: "reactWorkbench.toolbar.node.ungroup.label",
          title: "reactWorkbench.toolbar.node.ungroup.title",
          shortcut: sign("Ctrl+Shift+G"),
          disabledReason: describe(disabled?.canUngroup),
          disabled: !toolbar.canUngroup,
          onClick: () => context.runAction("ungroup")
        },
        {
          key: "select-all",
          icon: "select-all",
          label: "reactWorkbench.toolbar.node.selectAll.label",
          title: "reactWorkbench.toolbar.node.selectAll.title",
          shortcut: sign("Ctrl+A"),
          disabledReason: describe(disabled?.canSelectAll),
          disabled: !toolbar.canSelectAll,
          onClick: () => context.runAction("select-all")
        },
        {
          key: "clear-selection",
          icon: "clear-selection",
          label: "reactWorkbench.toolbar.node.clear.label",
          title: "reactWorkbench.toolbar.node.clear.title",
          disabledReason: describe(disabled?.canClearSelection),
          disabled: !toolbar.canClearSelection,
          onClick: () => context.runAction("clear-selection")
        }
      ]
    }
  ];

  const grouped = (key: ViewportToolGroupKey) => groups.find((group) => group.key === key)!;

  return [
    ...(["history", "transform", "snap", "selection"] as const).map((key): ViewportToolEntry => {
      const group = grouped(key);
      return { kind: "group", key, label: group.label, groups: [group] };
    }),
    ...(["helpers", "camera", "node"] as const).map((key): ViewportToolEntry => {
      const group = grouped(key);
      return { kind: "menu", key, label: group.label, group };
    })
  ];
}
