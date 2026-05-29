import type { SetTransformCommand } from "../commands/types";
import type { SceneSnapshot, Transform } from "../snapshot/types";
import { numberField } from "./fields";
import type { InspectorCommandResult, InspectorSection, TransformAxis, TransformFieldId, TransformVectorName } from "./types";
import { parseFiniteNumber } from "./fields";

const AXES = ["x", "y", "z"] as const;
const VECTORS = ["position", "rotation", "scale"] as const;

export function buildTransformSection(snapshot: SceneSnapshot): InspectorSection {
  const object = getSelectedObject(snapshot);
  const disabled = !object;

  return {
    id: "transform",
    title: "Transform",
    enabled: !disabled,
    empty: disabled,
    reason: disabled ? "Select a GLB object to edit transform." : undefined,
    fields: VECTORS.flatMap((vector) =>
      AXES.map((axis, axisIndex) =>
        numberField(`${vector}.${axis}`, `${formatVector(vector)} ${axis.toUpperCase()}`, object?.transform[vector][axisIndex] ?? defaultTransformValue(vector), {
          disabled,
          step: vector === "scale" ? 0.1 : 0.01
        })
      )
    )
  };
}

export function buildSetTransformCommand(snapshot: SceneSnapshot, fieldId: TransformFieldId, value: unknown): InspectorCommandResult {
  const object = getSelectedObject(snapshot);
  if (!object) {
    return problem(fieldId, "No selected object to edit.");
  }

  const [vector, axis] = fieldId.split(".") as [TransformVectorName, TransformAxis];
  const parsed = parseFiniteNumber(value, fieldId);
  if (!parsed.ok) {
    return problem(fieldId, parsed.message);
  }

  const axisIndex = AXES.indexOf(axis);
  const nextVector = [...object.transform[vector]] as [number, number, number];
  nextVector[axisIndex] = parsed.value;

  const command: SetTransformCommand = {
    type: "set-transform",
    objectId: object.id,
    transform: {
      [vector]: nextVector
    } as Partial<Transform>
  };
  return { ok: true, command };
}

function getSelectedObject(snapshot: SceneSnapshot) {
  const objectId = snapshot.selection.objectId;
  return objectId ? snapshot.objects[objectId] ?? null : null;
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
