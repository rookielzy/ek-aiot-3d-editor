import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsOutCardinal,
  BoundingBox,
  Camera,
  Copy,
  CornersOut,
  Crosshair,
  Cube,
  Cursor,
  DownloadSimple,
  Eye,
  FileArrowUp,
  FrameCorners,
  GridFour,
  Hand,
  IconContext,
  MagnetStraight,
  SelectionAll,
  StackPlus,
  Target,
  Trash,
  TreeStructure,
  UploadSimple
} from "@phosphor-icons/react";
import type { IconProps } from "@phosphor-icons/react";

export type WorkbenchIconName =
  | "apply-view"
  | "axes"
  | "bounds"
  | "capture-view"
  | "clear-selection"
  | "copy"
  | "delete"
  | "duplicate"
  | "export"
  | "export-partial"
  | "floor"
  | "frame-all"
  | "frame-selected"
  | "grid"
  | "group"
  | "hover"
  | "lights"
  | "marquee"
  | "move"
  | "open"
  | "paste"
  | "redo"
  | "reset-camera"
  | "rotate"
  | "scale"
  | "select-all"
  | "shadow-camera"
  | "snap"
  | "targets"
  | "undo"
  | "ungroup";

const ICONS = {
  "apply-view": Eye,
  axes: Crosshair,
  bounds: BoundingBox,
  "capture-view": Camera,
  "clear-selection": SelectionAll,
  copy: Copy,
  delete: Trash,
  duplicate: StackPlus,
  export: DownloadSimple,
  "export-partial": DownloadSimple,
  floor: Cube,
  "frame-all": CornersOut,
  "frame-selected": FrameCorners,
  grid: GridFour,
  group: TreeStructure,
  hover: Cursor,
  lights: Hand,
  marquee: SelectionAll,
  move: ArrowsOutCardinal,
  open: FileArrowUp,
  paste: UploadSimple,
  redo: ArrowClockwise,
  "reset-camera": Camera,
  rotate: ArrowClockwise,
  scale: CornersOut,
  "select-all": SelectionAll,
  "shadow-camera": Camera,
  snap: MagnetStraight,
  targets: Target,
  undo: ArrowCounterClockwise,
  ungroup: TreeStructure
} satisfies Record<WorkbenchIconName, React.ComponentType<IconProps>>;

export interface WorkbenchIconProps {
  name: WorkbenchIconName;
}

export function WorkbenchIcon({ name }: WorkbenchIconProps) {
  const Icon = ICONS[name];

  return (
    <IconContext.Provider value={{ size: 15, weight: "regular", mirrored: false }}>
      <Icon aria-hidden="true" focusable="false" />
    </IconContext.Provider>
  );
}
