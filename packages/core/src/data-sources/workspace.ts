import type { SceneSnapshot } from "../snapshot/types";
import type {
  DataConnectionAuth,
  DataConnectionReferenceCounts,
  DataCredentialDescriptor,
  SceneDataSources
} from "./types";

export interface DataConnectionListItem {
  id: string;
  name: string;
  baseUrl: string;
  authKind: DataConnectionAuth["kind"];
  credentialRef: string | null;
  credentialLabel: string | null;
  credentialAvailable: boolean | null;
  timeoutMs: number;
  headerCount: number;
  queryCount: number;
  bindingCount: number;
  referenced: boolean;
  missingCredential: boolean;
}

export interface DataSourcesWorkspaceModel {
  connections: DataConnectionListItem[];
  totalCount: number;
  empty: boolean;
  referencedCount: number;
  missingCredentialCount: number;
}

export interface BuildDataSourcesWorkspaceOptions {
  credentials?: readonly DataCredentialDescriptor[];
}

export interface FilterDataConnectionsOptions {
  query?: string;
}

export function buildDataSourcesWorkspaceModel(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  options: BuildDataSourcesWorkspaceOptions = {}
): DataSourcesWorkspaceModel {
  const credentialsByRef = new Map((options.credentials ?? []).map((credential) => [credential.ref, credential]));
  const connections = Object.values(snapshot.dataSources.connections)
    .map((connection): DataConnectionListItem => {
      const counts = countDataConnectionReferences(snapshot.dataSources, connection.id);
      const credentialRef = connection.auth.kind === "bearer" ? connection.auth.credentialRef : null;
      const credential = credentialRef ? credentialsByRef.get(credentialRef) : undefined;
      const credentialAvailable = credentialRef ? Boolean(credential?.available) : null;

      return {
        id: connection.id,
        name: connection.name,
        baseUrl: connection.baseUrl,
        authKind: connection.auth.kind,
        credentialRef,
        credentialLabel: credential?.label ?? null,
        credentialAvailable,
        timeoutMs: connection.timeoutMs,
        headerCount: Object.keys(connection.headers).length,
        queryCount: counts.queryCount,
        bindingCount: counts.bindingCount,
        referenced: counts.queryCount > 0,
        missingCredential: credentialRef !== null && !credentialAvailable
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    connections,
    totalCount: connections.length,
    empty: connections.length === 0,
    referencedCount: connections.filter((connection) => connection.referenced).length,
    missingCredentialCount: connections.filter((connection) => connection.missingCredential).length
  };
}

export function countDataConnectionReferences(
  dataSources: Pick<SceneDataSources, "queries" | "bindings">,
  connectionId: string
): DataConnectionReferenceCounts {
  const queryIds = new Set(
    Object.values(dataSources.queries)
      .filter((query) => query.connectionId === connectionId)
      .map((query) => query.id)
  );
  return {
    queryCount: queryIds.size,
    bindingCount: Object.values(dataSources.bindings).filter((binding) => queryIds.has(binding.queryId)).length
  };
}

export function filterDataConnectionItems(
  connections: readonly DataConnectionListItem[],
  options: FilterDataConnectionsOptions = {}
): DataConnectionListItem[] {
  const query = options.query?.trim().toLowerCase() ?? "";
  if (!query) {
    return [...connections];
  }
  return connections.filter((connection) => [
    connection.name,
    connection.baseUrl,
    connection.credentialRef ?? "",
    connection.credentialLabel ?? "",
    connection.authKind
  ].some((value) => value.toLowerCase().includes(query)));
}
