import type { NodeMotionPreviewState } from "../runtime/editor-runtime";
import { isNodeMotionAxis, isNodeMotionSpeed, NODE_MOTION_AXES, supportsNodeMotion, type NodeMotion } from "../snapshot/node-motion";
import type { SceneSnapshot } from "../snapshot/types";
import { numberField, selectField } from "./fields";

export type NodeMotionFieldId = "motion.axis" | "motion.speed";

export function getSelectedNodeForMotion(snapshot: SceneSnapshot) {
  if (snapshot.selection.nodeIds.length !== 1 || !snapshot.selection.nodeId) return null;
  const node = snapshot.nodes[snapshot.selection.nodeId];
  return supportsNodeMotion(node) ? node : null;
}

export function buildNodeMotionFields(motion: NodeMotion, state: NodeMotionPreviewState) {
  const locked = state === "playing";
  return [
    { ...selectField("motion.axis", "Local axis", motion.axis, NODE_MOTION_AXES.map((axis) => ({
      value: axis, label: axis.toUpperCase()
    })), locked), id: "motion.axis" as const },
    { ...numberField("motion.speed", "Speed (°/s)", motion.degreesPerSecond, { disabled: locked, step: 1 }), id: "motion.speed" as const }
  ];
}

export function updateNodeMotionField(motion: NodeMotion, field: NodeMotionFieldId, input: string): NodeMotion | null {
  if (field === "motion.axis") return isNodeMotionAxis(input) ? { ...motion, axis: input } : null;
  const speed = Number(input);
  return isNodeMotionSpeed(speed) ? { ...motion, degreesPerSecond: speed } : null;
}

export const NODE_MOTION_INSPECTOR_MESSAGES = {
  en: {
    "inspector.motion.tab": "Motion",
    "inspector.motion.add": "Add continuous spin",
    "inspector.motion.spin": "Continuous spin",
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
    "inspector.motion.editFailed": "Could not apply the motion edit.",
    "inspector.field.motion.axis.label": "Local axis",
    "inspector.field.motion.speed.label": "Speed (°/s)"
  },
  "zh-CN": {
    "inspector.motion.tab": "动效",
    "inspector.motion.add": "添加持续自转",
    "inspector.motion.spin": "持续自转",
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
    "inspector.motion.editFailed": "无法应用动效修改。",
    "inspector.field.motion.axis.label": "局部轴",
    "inspector.field.motion.speed.label": "转速 (°/秒)"
  }
} as const;
