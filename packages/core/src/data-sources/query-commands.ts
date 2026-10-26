import type { SceneSnapshot } from "../snapshot/types";
import type {
  CreateDataQueryCommand,
  DeleteDataQueryCommand,
  DuplicateDataQueryCommand,
  UpdateDataQueryCommand
} from "../commands/types";
import {
  createDataQueryId,
  createUniqueDataQueryName
} from "./defaults";
import type {
  DataQueryDefinition,
  DataQueryDefinitionProblem,
  DataQueryInput
} from "./types";
import { validateDataQueryDefinition } from "./query-validation";
import { countDataQueryReferences } from "./workspace";

export type DataQueryCommand =
  | CreateDataQueryCommand
  | UpdateDataQueryCommand
  | DuplicateDataQueryCommand
  | DeleteDataQueryCommand;

export type DataQueryCommandBuildResult =
  | { ok: true; command: DataQueryCommand }
  | { ok: false; problems: DataQueryDefinitionProblem[] };

export interface SaveDataQueryOptions {
  queryId?: string | null;
}

export function buildSaveDataQueryCommand(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  input: DataQueryInput | DataQueryDefinition,
  options: SaveDataQueryOptions = {}
): DataQueryCommandBuildResult {
  const queryId = options.queryId ?? null;
  if (queryId) {
    const existing = snapshot.dataSources.queries[queryId];
    if (!existing) {
      return { ok: false, problems: [queryNotFoundProblem(queryId)] };
    }
    if (input.connectionId.trim() !== existing.connectionId) {
      return {
        ok: false,
        problems: [{
          field: "connection",
          code: "command-failed",
          message: "A saved query cannot move to another connection."
        }]
      };
    }
  }

  const connectionId = typeof input.connectionId === "string" ? input.connectionId.trim() : "";
  const connection = snapshot.dataSources.connections[connectionId] ?? null;
  const validation = validateDataQueryDefinition(input, {
    queryId,
    connection,
    existingQueries: Object.values(snapshot.dataSources.queries)
  });
  if (!validation.ok || !validation.value) {
    return { ok: false, problems: validation.problems };
  }

  if (queryId) {
    return {
      ok: true,
      command: {
        type: "update-data-query",
        queryId,
        query: validation.value
      }
    };
  }

  const requestedId = "id" in input && typeof input.id === "string" ? input.id.trim() : "";
  if (requestedId && snapshot.dataSources.queries[requestedId]) {
    return {
      ok: false,
      problems: [{
        field: "query",
        code: "command-failed",
        message: `Query ${requestedId} already exists.`
      }]
    };
  }

  return {
    ok: true,
    command: {
      type: "create-data-query",
      query: {
        ...validation.value,
        ...(requestedId ? { id: requestedId } : {})
      }
    }
  };
}

export function buildDuplicateDataQueryCommand(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  queryId: string,
  options: { id?: string; name?: string } = {}
): DataQueryCommandBuildResult {
  const source = snapshot.dataSources.queries[queryId];
  if (!source) {
    return { ok: false, problems: [queryNotFoundProblem(queryId)] };
  }

  const requestedName = options.name?.trim();
  if (requestedName && Object.values(snapshot.dataSources.queries).some((query) =>
    query.connectionId === source.connectionId &&
    query.name.trim().toLowerCase() === requestedName.toLowerCase()
  )) {
    return {
      ok: false,
      problems: [{
        field: "name",
        code: "name-duplicate",
        message: `Query name "${requestedName}" is already used by another query on this connection.`
      }]
    };
  }

  const name = requestedName || createUniqueDataQueryName(
    Object.values(snapshot.dataSources.queries),
    source.connectionId,
    `${source.name} copy`
  );
  const id = options.id?.trim();
  if (id && snapshot.dataSources.queries[id]) {
    return {
      ok: false,
      problems: [{
        field: "query",
        code: "command-failed",
        message: `Query ${id} already exists.`
      }]
    };
  }

  return {
    ok: true,
    command: {
      type: "duplicate-data-query",
      queryId,
      ...(id ? { id } : {}),
      name
    }
  };
}

export function buildDeleteDataQueryCommand(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  queryId: string
): DataQueryCommandBuildResult {
  if (!snapshot.dataSources.queries[queryId]) {
    return { ok: false, problems: [queryNotFoundProblem(queryId)] };
  }

  const counts = countDataQueryReferences(snapshot.dataSources, queryId);
  if (counts.bindingCount > 0) {
    return {
      ok: false,
      problems: [{
        field: "query",
        code: "query-in-use",
        message: `Query ${queryId} is used by ${counts.bindingCount} object bindings.`
      }]
    };
  }

  return {
    ok: true,
    command: {
      type: "delete-data-query",
      queryId
    }
  };
}

function queryNotFoundProblem(queryId: string): DataQueryDefinitionProblem {
  return {
    field: "query",
    code: "query-not-found",
    message: `Query ${queryId} does not exist.`
  };
}
