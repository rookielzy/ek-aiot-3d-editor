export type DataConnectionId = string;
export type DataQueryId = string;

export interface DataConnectionAuthNone {
  kind: "none";
}

export interface DataConnectionAuthBearer {
  kind: "bearer";
  credentialRef: string;
}

export type DataConnectionAuth = DataConnectionAuthNone | DataConnectionAuthBearer;

export interface DataConnection {
  id: DataConnectionId;
  name: string;
  baseUrl: string;
  auth: DataConnectionAuth;
  headers: Record<string, string>;
  timeoutMs: number;
}

export type DataConnectionDraft = Omit<DataConnection, "id">;

export interface DataConnectionNameEntry {
  id: DataConnectionId;
  name: string;
}

export interface DataConnectionInput extends DataConnectionDraft {
  id?: DataConnectionId;
}

export type DataParameterType = "string" | "number" | "boolean";
export type DataParameterValue = string | number | boolean;
export type DataQueryParameterOverrides = Readonly<Record<string, DataParameterValue | null | undefined>>;

export interface DataQueryParameterDraft {
  name: string;
  type: DataParameterType;
  /** Omit to require an explicit test/binding value for this parameter. */
  defaultValue?: DataParameterValue;
}

export type DataPathSegment =
  | { kind: "key"; key: string }
  | { kind: "index"; index: number };

export type DataPath = readonly DataPathSegment[];

export type DataMappedValueType = "number" | "string" | "boolean";

export type DataMappingMode = "array" | "single";

export type DataQuality = "good" | "uncertain" | "bad" | "unknown";

export interface DataValueMapEntry {
  from: DataPathPrimitive;
  to: DataParameterValue;
}

export type DataPathPrimitive = string | number | boolean | null;

export type DataPropertyTransform =
  | { kind: "raw" }
  | { kind: "number" }
  | { kind: "scale"; factor: number; offset: number }
  | { kind: "map"; entries: readonly DataValueMapEntry[] };

export interface DataPropertyRange {
  min: number | null;
  max: number | null;
}

export interface DataPropertyMapping {
  key: string;
  label: string;
  type: DataMappedValueType;
  nullable: boolean;
  unit: string | null;
  source: DataPath;
  transform: DataPropertyTransform;
  range: DataPropertyRange | null;
  allowed: readonly DataParameterValue[] | null;
}

export type DataIdentityMapping =
  | { kind: "path"; path: DataPath; valueType: "string" | "number" }
  | { kind: "parameter"; parameterName: string }
  | { kind: "literal"; value: string };

export type DataTimeFormat = "iso" | "unix-seconds" | "unix-milliseconds";

export interface DataObservedAtMapping {
  path: DataPath;
  format: DataTimeFormat;
}

export interface DataQualityMapEntry {
  from: DataPathPrimitive;
  quality: DataQuality;
}

export interface DataQualityMapping {
  path: DataPath;
  entries: readonly DataQualityMapEntry[];
}

export interface DataQueryMapping {
  mode: DataMappingMode;
  root: DataPath;
  identity: DataIdentityMapping;
  displayName: DataPath | null;
  properties: readonly DataPropertyMapping[];
  observedAt: DataObservedAtMapping | null;
  sourceQuality: DataQualityMapping | null;
}

/**
 * Durable GET polling policy. `refreshIntervalMs` is the delay after a
 * completed request; `maxAgeMs` bounds both receive age and source sample age.
 */
export interface DataQueryUpdatePolicy {
  refreshIntervalMs: number;
  maxAgeMs: number;
}

/**
 * Reference portion of a durable query. Query authoring extends this record;
 * the snapshot contract keeps the connection link stable from v9 onward.
 */
export interface DataQuery {
  id: DataQueryId;
  connectionId: DataConnectionId;
  name: string;
  path: string;
  parameters: readonly DataQueryParameterDraft[];
  mapping: DataQueryMapping;
  updatePolicy: DataQueryUpdatePolicy;
}

export type DataQueryDefinition = Omit<DataQuery, "id">;

export interface DataQueryInput extends DataQueryDefinition {
  id?: DataQueryId;
}

export type DataQueryField =
  | "name"
  | "connection"
  | "path"
  | "parameters"
  | "mapping"
  | "updatePolicy"
  | "query";

export type DataQueryDefinitionProblemCode =
  | "binding-parameter-in-use"
  | "binding-property-in-use"
  | "command-failed"
  | "connection-not-found"
  | "mapping-invalid"
  | "mapping-property-required"
  | "name-duplicate"
  | "name-required"
  | "parameter-duplicate"
  | "parameter-invalid"
  | "parameter-missing"
  | "parameter-type"
  | "path-invalid"
  | "query-in-use"
  | "query-not-found"
  | "update-policy-invalid";

export interface DataQueryDefinitionProblem {
  field: DataQueryField;
  code: DataQueryDefinitionProblemCode;
  message: string;
  parameterName?: string;
  propertyKey?: string;
}

export interface DataQueryValidationResult {
  ok: boolean;
  problems: DataQueryDefinitionProblem[];
  value?: DataQueryDefinition;
}

/**
 * Ordered detail entry for an object binding. Null label and precision fall
 * back to the mapped property definition and the display default.
 */
export interface DataBindingDetailField {
  key: string;
  label: string | null;
  precision: number | null;
}

export type DataColorOperator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "between";

/**
 * One ordered color rule. `max` is only meaningful for `between`, where both
 * bounds are inclusive.
 */
export interface DataColorRule {
  operator: DataColorOperator;
  value: DataParameterValue;
  max: number | null;
  /** Normalized `#rrggbb` color. */
  color: string;
}

/**
 * One mapped property drives the binding's status color. The first matching
 * rule wins; no match restores the authored material color.
 */
export interface DataBindingColor {
  propertyKey: string;
  rules: readonly DataColorRule[];
}

/**
 * Reference and authoring portion of an object binding. Bindings are keyed by
 * object NodeId; one object owns at most one query context.
 */
export interface DataObjectBinding {
  objectNodeId: string;
  queryId: DataQueryId;
  parameterOverrides: Readonly<Record<string, DataParameterValue>>;
  deviceId: string;
  enabled: boolean;
  details: readonly DataBindingDetailField[];
  color: DataBindingColor | null;
}

export interface DataBindingColorInput {
  propertyKey: string;
  rules?: readonly DataColorRuleInput[] | null;
}

export interface DataColorRuleInput {
  operator: DataColorOperator;
  value: DataParameterValue;
  max?: number | null;
  color: string;
}

export interface DataObjectBindingInput {
  objectNodeId: string;
  queryId: DataQueryId;
  parameterOverrides?: DataQueryParameterOverrides | null;
  deviceId: string;
  enabled?: boolean;
  details?: readonly DataBindingDetailFieldInput[] | null;
  color?: DataBindingColorInput | null;
}

export interface DataBindingDetailFieldInput {
  key: string;
  label?: string | null;
  precision?: number | null;
}

export type DataBindingProblemField =
  | "object"
  | "query"
  | "parameters"
  | "device"
  | "details"
  | "colors"
  | "binding";

export type DataBindingProblemCode =
  | "binding-invalid"
  | "binding-not-found"
  | "color-invalid"
  | "color-operator"
  | "color-property-unknown"
  | "color-rules-required"
  | "color-value"
  | "command-failed"
  | "device-required"
  | "detail-duplicate"
  | "detail-precision"
  | "detail-required"
  | "detail-unknown"
  | "parameter-missing"
  | "parameter-type"
  | "parameter-unknown"
  | "query-not-found"
  | "target-imported"
  | "target-not-found"
  | "target-unsupported";

export interface DataBindingProblem {
  field: DataBindingProblemField;
  code: DataBindingProblemCode;
  message: string;
  parameterName?: string;
  propertyKey?: string;
  ownerObjectId?: string;
  targetKind?: string;
}

export interface DataObjectBindingValidationResult {
  ok: boolean;
  problems: DataBindingProblem[];
  value?: DataObjectBinding;
}

export interface SceneDataSources {
  connections: Record<DataConnectionId, DataConnection>;
  queries: Record<DataQueryId, DataQuery>;
  bindings: Record<string, DataObjectBinding>;
}

export interface DataCredentialDescriptor {
  ref: string;
  label: string;
  available: boolean;
}

export type DataConnectionField = "name" | "baseUrl" | "auth" | "headers" | "timeoutMs" | "connection";

export type DataConnectionProblemCode =
  | "auth-invalid"
  | "base-url-credentials"
  | "base-url-invalid"
  | "base-url-query"
  | "base-url-required"
  | "command-failed"
  | "connection-in-use"
  | "connection-not-found"
  | "credential-required"
  | "header-reserved"
  | "headers-invalid"
  | "name-duplicate"
  | "name-required"
  | "timeout-invalid";

export interface DataConnectionProblem {
  field: DataConnectionField;
  code: DataConnectionProblemCode;
  message: string;
}

export interface DataConnectionValidationResult {
  ok: boolean;
  problems: DataConnectionProblem[];
  value?: DataConnectionDraft;
}

export interface DataConnectionReferenceCounts {
  queryCount: number;
  bindingCount: number;
}

export interface DataQueryReferenceCounts {
  bindingCount: number;
}
