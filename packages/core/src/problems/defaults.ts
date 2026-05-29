import type { AuthoredProblemState } from "./types";

export function createEmptyAuthoredProblemState(): AuthoredProblemState {
  return {
    acknowledged: {}
  };
}
