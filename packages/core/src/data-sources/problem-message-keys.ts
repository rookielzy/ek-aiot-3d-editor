import type { DataMappingProblem } from "./mapping";
import type { DataQueryProblem, DataQueryProblemCode } from "./query";
import type { DataQueryRunStatus } from "./service";
import type {
  DataParameterType,
  DataQueryDefinitionProblemCode
} from "./types";

/**
 * Workbench message keys for data problems.
 *
 * Core owns the copy descriptors so every adapter resolves the same key for the
 * same core problem code; the dictionaries stay adapter-owned.
 */
export const DATA_QUERY_DEFINITION_PROBLEM_MESSAGE_KEYS = {
  "binding-parameter-in-use": "dataSources.queryProblem.bindingParameterInUse",
  "binding-property-in-use": "dataSources.queryProblem.bindingPropertyInUse",
  "command-failed": "dataSources.queryProblem.commandFailed",
  "connection-not-found": "dataSources.queryProblem.connectionNotFound",
  "header-invalid": "dataSources.queryProblem.headerInvalid",
  "header-reserved": "dataSources.queryProblem.headerReserved",
  "mapping-invalid": "dataSources.queryProblem.mappingInvalid",
  "method-invalid": "dataSources.queryProblem.methodInvalid",
  "mapping-property-required": "dataSources.queryProblem.mappingPropertyRequired",
  "name-duplicate": "dataSources.queryProblem.nameDuplicate",
  "name-required": "dataSources.queryProblem.nameRequired",
  "parameter-duplicate": "dataSources.queryProblem.parameterDuplicate",
  "parameter-invalid": "dataSources.queryProblem.parameterInvalid",
  "parameter-missing": "dataSources.queryProblem.parameterMissing",
  "parameter-type": "dataSources.queryProblem.parameterType",
  "path-invalid": "dataSources.queryProblem.pathInvalid",
  "post-read-only-required": "dataSources.queryProblem.postReadOnlyRequired",
  "query-in-use": "dataSources.queryProblem.queryInUse",
  "query-not-found": "dataSources.queryProblem.queryNotFound",
  "success-condition-invalid": "dataSources.queryProblem.successConditionInvalid",
  "update-policy-invalid": "dataSources.queryProblem.updatePolicyInvalid"
} as const satisfies Record<DataQueryDefinitionProblemCode, string>;

export const DATA_MAPPING_PROBLEM_MESSAGE_KEYS = {
  "display-name-invalid": "dataSources.mappingProblem.displayNameInvalid",
  "entity-id-duplicate": "dataSources.mappingProblem.entityIdDuplicate",
  "entity-id-invalid": "dataSources.mappingProblem.entityIdInvalid",
  "entity-id-missing": "dataSources.mappingProblem.entityIdMissing",
  "observed-at-future": "dataSources.mappingProblem.observedAtFuture",
  "observed-at-invalid": "dataSources.mappingProblem.observedAtInvalid",
  "observed-at-missing": "dataSources.mappingProblem.observedAtMissing",
  "property-allowed": "dataSources.mappingProblem.propertyAllowed",
  "property-conversion": "dataSources.mappingProblem.propertyConversion",
  "property-missing": "dataSources.mappingProblem.propertyMissing",
  "property-null": "dataSources.mappingProblem.propertyNull",
  "property-range": "dataSources.mappingProblem.propertyRange",
  "property-type": "dataSources.mappingProblem.propertyType",
  "root-missing": "dataSources.mappingProblem.rootMissing",
  "root-type": "dataSources.mappingProblem.rootType",
  "source-quality-invalid": "dataSources.mappingProblem.sourceQualityInvalid"
} as const satisfies Record<DataMappingProblem["code"], string>;

export const DATA_QUERY_PROBLEM_MESSAGE_KEYS = {
  "connection-not-found": "dataSources.request.problem.connectionNotFound",
  "credential-unavailable": "dataSources.request.problem.credentialUnavailable",
  "executor-unavailable": "dataSources.request.problem.executorUnavailable",
  "header-invalid": "dataSources.request.problem.headerInvalid",
  "header-reserved": "dataSources.request.problem.headerReserved",
  "method-invalid": "dataSources.request.problem.methodInvalid",
  "parameter-definition-invalid": "dataSources.request.problem.parameterDefinitionInvalid",
  "parameter-duplicate": "dataSources.request.problem.parameterDuplicate",
  "parameter-location-invalid": "dataSources.request.problem.parameterLocationInvalid",
  "parameter-missing": "dataSources.request.problem.parameterMissing",
  "parameter-type": "dataSources.request.problem.parameterType",
  "path-absolute": "dataSources.request.problem.pathAbsolute",
  "path-invalid": "dataSources.request.problem.pathInvalid",
  "path-parameter-missing": "dataSources.request.problem.pathParameterMissing",
  "path-protocol-relative": "dataSources.request.problem.pathProtocolRelative",
  "path-required": "dataSources.request.problem.pathRequired",
  "path-traversal": "dataSources.request.problem.pathTraversal",
  "post-read-only-required": "dataSources.request.problem.postReadOnlyRequired",
  "request-aborted": "dataSources.request.problem.requestAborted",
  "request-failed": "dataSources.request.problem.requestFailed",
  "request-timeout": "dataSources.request.problem.requestTimeout",
  "response-auth": "dataSources.request.problem.responseAuth",
  "response-business": "dataSources.request.problem.responseBusiness",
  "response-http": "dataSources.request.problem.responseHttp",
  "response-invalid": "dataSources.request.problem.responseInvalid",
  "response-json-invalid": "dataSources.request.problem.responseJsonInvalid",
  "response-not-json": "dataSources.request.problem.responseNotJson",
  "response-too-large": "dataSources.request.problem.responseTooLarge",
  "service-disposed": "dataSources.request.problem.serviceDisposed",
  "success-condition-invalid": "dataSources.request.problem.successConditionInvalid"
} as const satisfies Record<DataQueryProblemCode, string>;

export const DATA_QUERY_RUN_STATUS_MESSAGE_KEYS = {
  running: "dataSources.request.status.running",
  success: "dataSources.request.status.success",
  error: "dataSources.request.status.error",
  cancelled: "dataSources.request.status.cancelled"
} as const satisfies Record<Exclude<DataQueryRunStatus, "stale">, string>;

export const PARAMETER_TYPE_MESSAGE_KEYS = {
  string: "dataSources.request.type.string",
  number: "dataSources.request.type.number",
  boolean: "dataSources.request.type.boolean"
} as const satisfies Record<DataParameterType, string>;

/**
 * Interpolation values every data query problem message understands.
 */
export function dataQueryProblemMessageValues(problem: DataQueryProblem): Record<string, string> {
  return {
    parameterName: problem.parameterName ?? "",
    status: problem.status === undefined ? "" : String(problem.status),
    credentialRef: problem.credentialRef ?? "",
    detail: problem.message
  };
}
