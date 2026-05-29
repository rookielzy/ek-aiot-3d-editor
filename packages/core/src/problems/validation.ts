import { isJsonCompatible, isPlainRecord } from "../snapshot/json";
import type { AuthoredProblemState } from "./types";

export function validateAuthoredProblemState(value: unknown, errors: string[]): asserts value is AuthoredProblemState {
  if (!isPlainRecord(value)) {
    errors.push("Snapshot problems must be a plain object.");
    return;
  }

  if (!isPlainRecord(value.acknowledged)) {
    errors.push("Snapshot acknowledged problems must be a plain object map.");
    return;
  }

  for (const [id, acknowledgement] of Object.entries(value.acknowledged)) {
    if (!isPlainRecord(acknowledgement)) {
      errors.push(`Problem acknowledgement ${id} must be a plain object.`);
      continue;
    }
    if (typeof acknowledgement.problemId !== "string") {
      errors.push(`Problem acknowledgement ${id} must include a problemId.`);
    }
    if ("acknowledgedAt" in acknowledgement && typeof acknowledgement.acknowledgedAt !== "string") {
      errors.push(`Problem acknowledgement ${id} acknowledgedAt must be a string.`);
    }
    if ("metadata" in acknowledgement && !isJsonCompatible(acknowledgement.metadata)) {
      errors.push(`Problem acknowledgement ${id} metadata must be JSON-compatible.`);
    }
  }
}
