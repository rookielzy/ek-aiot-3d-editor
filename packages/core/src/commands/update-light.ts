import { createTransform } from "../snapshot/defaults";
import type { LightDefinition } from "../lights/types";
import { findLightNodeId } from "../snapshot/nodes";
import type { SceneSnapshot } from "../snapshot/types";
import type { UpdateLightCommand } from "./types";

export function applyUpdateLight(snapshot: SceneSnapshot, command: UpdateLightCommand): SceneSnapshot {
  const light = snapshot.lights[command.lightId];
  if (!light) {
    throw new Error(`Light ${command.lightId} does not exist.`);
  }
  if (command.patch.kind && command.patch.kind !== light.kind) {
    throw new Error("Light kind cannot be changed by update-light.");
  }

  const next = normalizeUpdatedLight({ ...light, ...command.patch } as LightDefinition);

  const nodeId = findLightNodeId(snapshot, command.lightId);
  const node = nodeId ? snapshot.nodes[nodeId] : undefined;
  const nodes = nodeId && node?.kind === "light"
    ? {
        ...snapshot.nodes,
        [nodeId]: next.transform
          ? { ...node, name: next.name, transform: next.transform }
          : {
              id: node.id,
              kind: "light" as const,
              name: next.name,
              lightId: node.lightId,
              parentId: node.parentId,
              children: [...node.children],
              ...(node.metadata ? { metadata: { ...node.metadata } } : {})
            }
      }
    : snapshot.nodes;

  return {
    ...snapshot,
    nodes,
    lights: {
      ...snapshot.lights,
      [command.lightId]: next
    }
  };
}

function normalizeUpdatedLight(light: LightDefinition): LightDefinition {
  switch (light.kind) {
    case "ambient": {
      const { transform: _transform, ...ambient } = light;
      return ambient;
    }
    case "hemisphere": {
      const { transform: _transform, ...hemisphere } = light;
      return hemisphere;
    }
    case "directional":
    case "point":
    case "spot":
      return {
        ...light,
        transform: createTransform(light.transform)
      };
    default:
      return assertNever(light);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported light: ${JSON.stringify(value)}`);
}
