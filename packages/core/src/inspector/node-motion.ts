import { createDisplayMessageDescriptor } from "../i18n/display-messages";
import type { NodeMotionPreviewState } from "../runtime/editor-runtime";
import {
  createDefaultNodeMotion,
  isNodeMotionAxis,
  isNodeMotionDistance,
  isNodeMotionDuration,
  isNodeMotionKind,
  isNodeMotionSpeed,
  NODE_MOTION_AXES,
  NODE_MOTION_KINDS,
  supportsNodeMotion,
  type NodeMotion,
  type NodeMotionKind
} from "../snapshot/node-motion";
import type { SceneSnapshot } from "../snapshot/types";
import { numberField, selectField } from "./fields";

export type NodeMotionFieldId =
  | "motion.kind"
  | "motion.axis"
  | "motion.parentAxis"
  | "motion.speed"
  | "motion.distance"
  | "motion.duration";

export const NODE_MOTION_KIND_ACTIONS = [
  { kind: "continuous-spin", titleKey: "inspector.motion.spin", addKey: "inspector.motion.add" },
  { kind: "ping-pong-translation", titleKey: "inspector.motion.pingPong", addKey: "inspector.motion.addPingPong" }
] as const;

export function getNodeMotionTitleKey(kind: NodeMotionKind) {
  return kind === "ping-pong-translation" ? "inspector.motion.pingPong" as const : "inspector.motion.spin" as const;
}

export function getSelectedNodeForMotion(snapshot: SceneSnapshot) {
  if (snapshot.selection.nodeIds.length !== 1 || !snapshot.selection.nodeId) return null;
  const node = snapshot.nodes[snapshot.selection.nodeId];
  return supportsNodeMotion(node) ? node : null;
}

export function buildNodeMotionFields(motion: NodeMotion, state: NodeMotionPreviewState) {
  const locked = state === "playing";
  const axisOptions = NODE_MOTION_AXES.map((axis) => ({ value: axis, label: axis.toUpperCase() }));
  const kindField = {
    ...selectField("motion.kind", "Motion type", motion.kind, NODE_MOTION_KINDS.map(motionKindOption), locked),
    id: "motion.kind" as const
  };
  if (motion.kind === "ping-pong-translation") {
    return [
      kindField,
      { ...selectField("motion.parentAxis", "Parent axis", motion.axis, axisOptions, locked), id: "motion.parentAxis" as const },
      { ...numberField("motion.distance", "Distance (units)", motion.distance, { disabled: locked, step: 0.1 }), id: "motion.distance" as const },
      { ...numberField("motion.duration", "One-way duration (s)", motion.durationSeconds, { disabled: locked, min: 0.1, step: 0.1 }), id: "motion.duration" as const }
    ];
  }
  return [
    kindField,
    { ...selectField("motion.axis", "Local axis", motion.axis, axisOptions, locked), id: "motion.axis" as const },
    { ...numberField("motion.speed", "Speed (°/s)", motion.degreesPerSecond, { disabled: locked, step: 1 }), id: "motion.speed" as const }
  ];
}

export function updateNodeMotionField(motion: NodeMotion, field: NodeMotionFieldId, input: string): NodeMotion | null {
  if (field === "motion.kind") {
    if (!isNodeMotionKind(input)) return null;
    return input === motion.kind ? motion : createDefaultNodeMotion(input);
  }
  if (field === "motion.axis" || field === "motion.parentAxis") {
    return isNodeMotionAxis(input) ? { ...motion, axis: input } : null;
  }
  const value = Number(input);
  if (motion.kind === "continuous-spin") {
    return field === "motion.speed" && isNodeMotionSpeed(value) ? { ...motion, degreesPerSecond: value } : null;
  }
  if (field === "motion.distance") {
    return isNodeMotionDistance(value) ? { ...motion, distance: value } : null;
  }
  if (field === "motion.duration") {
    return isNodeMotionDuration(value) ? { ...motion, durationSeconds: value } : null;
  }
  return null;
}

export function getNodeMotionFieldProblemKey(field: NodeMotionFieldId) {
  if (field === "motion.distance") return "inspector.motion.invalidDistance" as const;
  if (field === "motion.duration") return "inspector.motion.invalidDuration" as const;
  return "inspector.motion.invalidSpeed" as const;
}

function motionKindOption(kind: NodeMotionKind) {
  const label = kind === "ping-pong-translation" ? "Ping-pong translation" : "Continuous spin";
  return {
    value: kind,
    label,
    labelDescriptor: createDisplayMessageDescriptor({
      namespace: "inspector",
      path: `option.motion.kind.${kind}`,
      field: "label",
      fallback: label,
      values: { kind }
    })
  };
}

export const NODE_MOTION_INSPECTOR_MESSAGES = {
  en: {
    "inspector.motion.tab": "Motion",
    "inspector.motion.add": "Add continuous spin",
    "inspector.motion.addPingPong": "Add ping-pong translation",
    "inspector.motion.spin": "Continuous spin",
    "inspector.motion.pingPong": "Ping-pong translation",
    "inspector.motion.remove": "Remove",
    "inspector.motion.preview": "Preview",
    "inspector.motion.stop": "Stop",
    "inspector.motion.playing": "Preview playing. Motion and transform editing are locked.",
    "inspector.motion.unavailable": "Open a viewport to preview motion.",
    "inspector.motion.loading": "Waiting for the viewport to finish loading the scene.",
    "inspector.motion.asset-unavailable": "The model is unavailable for preview.",
    "inspector.motion.target-unresolved": "The GLB target could not be resolved for preview.",
    "inspector.motion.target-not-transformable": "The GLB target cannot be transformed independently.",
    "inspector.motion.invalidSpeed": "Enter a finite, nonzero speed. Use a negative value to reverse direction.",
    "inspector.motion.invalidDistance": "Enter a finite, nonzero distance. Use a negative value to move in the opposite direction.",
    "inspector.motion.invalidDuration": "Enter a finite duration greater than zero.",
    "inspector.motion.editFailed": "Could not apply the motion edit.",
    "inspector.field.motion.kind.label": "Motion type",
    "inspector.field.motion.axis.label": "Local axis",
    "inspector.field.motion.parentAxis.label": "Parent axis",
    "inspector.field.motion.speed.label": "Speed (°/s)",
    "inspector.field.motion.distance.label": "Distance (units)",
    "inspector.field.motion.duration.label": "One-way duration (s)",
    "inspector.option.motion.kind.continuous-spin.label": "Continuous spin",
    "inspector.option.motion.kind.ping-pong-translation.label": "Ping-pong translation"
  },
  "zh-CN": {
    "inspector.motion.tab": "动效",
    "inspector.motion.add": "添加持续自转",
    "inspector.motion.addPingPong": "添加往返移动",
    "inspector.motion.spin": "持续自转",
    "inspector.motion.pingPong": "往返移动",
    "inspector.motion.remove": "移除",
    "inspector.motion.preview": "预览",
    "inspector.motion.stop": "停止",
    "inspector.motion.playing": "正在预览。动效参数和变换编辑已锁定。",
    "inspector.motion.unavailable": "打开视口后即可预览动效。",
    "inspector.motion.loading": "正在等待视口加载场景。",
    "inspector.motion.asset-unavailable": "模型暂不可用，无法预览。",
    "inspector.motion.target-unresolved": "无法解析 GLB 子节点，暂时无法预览。",
    "inspector.motion.target-not-transformable": "此 GLB 子节点无法独立变换。",
    "inspector.motion.invalidSpeed": "请输入有限的非零转速。负值表示反向旋转。",
    "inspector.motion.invalidDistance": "请输入有限的非零位移。负值表示沿该轴反方向移动。",
    "inspector.motion.invalidDuration": "请输入有限且大于零的单程时长。",
    "inspector.motion.editFailed": "无法应用动效修改。",
    "inspector.field.motion.kind.label": "动效类型",
    "inspector.field.motion.axis.label": "局部轴",
    "inspector.field.motion.parentAxis.label": "父级轴",
    "inspector.field.motion.speed.label": "转速 (°/秒)",
    "inspector.field.motion.distance.label": "位移 (场景单位)",
    "inspector.field.motion.duration.label": "单程时长 (秒)",
    "inspector.option.motion.kind.continuous-spin.label": "持续自转",
    "inspector.option.motion.kind.ping-pong-translation.label": "往返移动"
  }
} as const;
