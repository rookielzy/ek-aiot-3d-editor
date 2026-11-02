import {
  DATA_MAPPING_PROBLEM_MESSAGE_KEYS,
  DATA_QUERY_DEFINITION_PROBLEM_MESSAGE_KEYS,
  DATA_QUERY_PROBLEM_MESSAGE_KEYS,
  DATA_QUERY_RUN_STATUS_MESSAGE_KEYS,
  PARAMETER_TYPE_MESSAGE_KEYS,
  dataQueryProblemMessageValues,
  type DataQueryProblem
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchI18n, WorkbenchMessageValues } from "../i18n/workbench-i18n";

export {
  DATA_MAPPING_PROBLEM_MESSAGE_KEYS,
  DATA_QUERY_DEFINITION_PROBLEM_MESSAGE_KEYS,
  DATA_QUERY_PROBLEM_MESSAGE_KEYS,
  DATA_QUERY_RUN_STATUS_MESSAGE_KEYS,
  PARAMETER_TYPE_MESSAGE_KEYS
};

export function formatDataQueryProblem(i18n: WorkbenchI18n, problem: DataQueryProblem): string {
  const values: WorkbenchMessageValues = dataQueryProblemMessageValues(problem);
  return i18n.t(DATA_QUERY_PROBLEM_MESSAGE_KEYS[problem.code], values);
}
