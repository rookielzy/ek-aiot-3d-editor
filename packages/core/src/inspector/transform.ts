import type { SetNodeTransformCommand } from "../commands/types";
import type { SceneSnapshot, Transform } from "../snapshot/types";
import { numberField } from "./fields";
import { getSelectedNodeTarget } from "./node-targets";
import type { InspectorCommandResult, InspectorSection, TransformAxis, TransformFieldId, TransformVectorName } from "./types";
import { parseFiniteNumber } from "./fields";

const AXES = ["x", "y", "z"] as const;
const VECTORS = ["position", "rotation", "scale"] as const;

export function buildTransformSection(snapshot: SceneSnapshot): InspectorSection {
  const target = getSelectedNodeTarget(snapshot);
  const disabled = !target.transformAvailable || !target.transform;

  return {
    id: "transform",
    title: "Transform",
    enabled: !disabled,
    empty: disabled,
    reason: disabled ? target.transformUnavailableReason : undefined,
    fields: VECTORS.flatMap((vector) =>
      AXES.map((axis, axisIndex) =>
        numberField(`${vector}.${axis}`, `${formatVector(vector)} ${axis.toUpperCase()}`, target.transform?.[vector][axisIndex] ?? defaultTransformValue(vector), {
          disabled,
          step: vector === "scale" ? 0.1 : 0.01
        })
      )
    )
  };
}

export function buildSetTransformCommand(snapshot: SceneSnapshot, fieldId: TransformFieldId, value: unknown): InspectorCommandResult {
  const target = getSelectedNodeTarget(snapshot);
  if (!target.node || !target.transform) {
    return problem(fieldId, target.transformUnavailableReason ?? "No selected transformable node to edit.");
  }

  const [vector, axis] = fieldId.split(".") as [TransformVectorName, TransformAxis];
  const parsed = parseFiniteNumber(value, fieldId);
  if (!parsed.ok) {
    return problem(fieldId, parsed.message);
  }

  const axisIndex = AXES.indexOf(axis);
  const nextVector = [...target.transform[vector]] as [number, number, number];
  nextVector[axisIndex] = parsed.value;

  const command: SetNodeTransformCommand = {
    type: "set-node-transform",
    nodeId: target.node.id,
    transform: {
      [vector]: nextVector
    } as Partial<Transform>
  };
  return { ok: true, command };
}

function defaultTransformValue(vector: TransformVectorName): number {
  return vector === "scale" ? 1 : 0;
}

function formatVector(vector: TransformVectorName): string {
  return vector.charAt(0).toUpperCase() + vector.slice(1);
}

function problem(fieldId: string, message: string): InspectorCommandResult {
  return { ok: false, problem: { code: "inspector-transform-invalid", fieldId, message, severity: "warning" } };
}
