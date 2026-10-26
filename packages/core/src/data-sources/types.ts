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

/**
 * Reference portion of a durable query. Query authoring extends this record;
 * the snapshot contract keeps the connection link stable from v9 onward.
 */
export interface DataQuery {
  id: DataQueryId;
  connectionId: DataConnectionId;
  name: string;
}

/**
 * Reference portion of an object binding. Binding authoring extends this
 * record; bindings are keyed by object NodeId.
 */
export interface DataObjectBinding {
  objectNodeId: string;
  queryId: DataQueryId;
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
