import { validateDataObjectBindingInput } from "../data-sources/bindings";
import type { SceneSnapshot } from "../snapshot/types";
import type {
  DeleteDataObjectBindingCommand,
  SetDataObjectBindingCommand
} from "./types";

export function applySetDataObjectBinding(snapshot: SceneSnapshot, command: SetDataObjectBindingCommand): SceneSnapshot {
  const validation = validateDataObjectBindingInput(snapshot, command.binding);
  if (!validation.ok || !validation.value) {
    throw new Error(validation.problems.map((problem) => `${problem.code}: ${problem.message}`).join("\n"));
  }
  const binding = validation.value;
  return {
    ...snapshot,
    dataSources: {
      ...snapshot.dataSources,
      bindings: {
        ...snapshot.dataSources.bindings,
        [binding.objectNodeId]: binding
      }
    }
  };
}

export function applyDeleteDataObjectBinding(
  snapshot: SceneSnapshot,
  command: DeleteDataObjectBindingCommand
): SceneSnapshot {
  if (!snapshot.dataSources.bindings[command.objectNodeId]) {
    throw new Error(`binding-not-found: Object ${command.objectNodeId} does not have a data binding.`);
  }
  const bindings = { ...snapshot.dataSources.bindings };
  delete bindings[command.objectNodeId];
  return {
    ...snapshot,
    dataSources: {
      ...snapshot.dataSources,
      bindings
    }
  };
}
