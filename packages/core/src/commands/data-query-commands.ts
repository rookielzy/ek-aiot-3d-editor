import { createDataQueryId, createUniqueDataQueryName } from "../data-sources/defaults";
import { validateDataQueryDefinition } from "../data-sources/query-validation";
import type {
  DataQuery,
  DataQueryDefinition,
  DataQueryDefinitionProblem
} from "../data-sources/types";
import { countDataQueryReferences } from "../data-sources/workspace";
import type { SceneSnapshot } from "../snapshot/types";
import type {
  CreateDataQueryCommand,
  DeleteDataQueryCommand,
  DuplicateDataQueryCommand,
  UpdateDataQueryCommand
} from "./types";

export function applyCreateDataQuery(snapshot: SceneSnapshot, command: CreateDataQueryCommand): SceneSnapshot {
  const connectionId = typeof command.query.connectionId === "string" ? command.query.connectionId.trim() : "";
  const validation = validateDataQueryDefinition(command.query, {
    connection: snapshot.dataSources.connections[connectionId] ?? null,
    existingQueries: Object.values(snapshot.dataSources.queries)
  });
  if (!validation.ok || !validation.value) {
    throw new Error(formatProblems(validation.problems));
  }

  const requestedId = command.query.id?.trim();
  const id = requestedId || createDataQueryId(snapshot.dataSources.queries);
  if (snapshot.dataSources.queries[id]) {
    throw new Error(`command-failed: Query ${id} already exists.`);
  }

  return withQuery(snapshot, { id, ...validation.value });
}

export function applyUpdateDataQuery(snapshot: SceneSnapshot, command: UpdateDataQueryCommand): SceneSnapshot {
  const existing = snapshot.dataSources.queries[command.queryId];
  if (!existing) {
    throw new Error(`query-not-found: Query ${command.queryId} does not exist.`);
  }
  if (command.query.connectionId.trim() !== existing.connectionId) {
    throw new Error(`command-failed: Query ${command.queryId} cannot move to another connection.`);
  }

  const validation = validateDataQueryDefinition(command.query, {
    queryId: command.queryId,
    connection: snapshot.dataSources.connections[existing.connectionId] ?? null,
    existingQueries: Object.values(snapshot.dataSources.queries)
  });
  if (!validation.ok || !validation.value) {
    throw new Error(formatProblems(validation.problems));
  }

  return withQuery(snapshot, { id: command.queryId, ...validation.value });
}

export function applyDuplicateDataQuery(snapshot: SceneSnapshot, command: DuplicateDataQueryCommand): SceneSnapshot {
  const source = snapshot.dataSources.queries[command.queryId];
  if (!source) {
    throw new Error(`query-not-found: Query ${command.queryId} does not exist.`);
  }

  const requestedId = command.id?.trim();
  const id = requestedId || createDataQueryId(snapshot.dataSources.queries);
  if (snapshot.dataSources.queries[id]) {
    throw new Error(`command-failed: Query ${id} already exists.`);
  }

  const name = command.name?.trim() || createUniqueDataQueryName(
    Object.values(snapshot.dataSources.queries),
    source.connectionId,
    `${source.name} copy`
  );
  const definition = cloneQueryDefinition(source);
  const validation = validateDataQueryDefinition({ ...definition, name }, {
    connection: snapshot.dataSources.connections[source.connectionId] ?? null,
    existingQueries: Object.values(snapshot.dataSources.queries)
  });
  if (!validation.ok || !validation.value) {
    throw new Error(formatProblems(validation.problems));
  }

  return withQuery(snapshot, { id, ...validation.value });
}

export function applyDeleteDataQuery(snapshot: SceneSnapshot, command: DeleteDataQueryCommand): SceneSnapshot {
  if (!snapshot.dataSources.queries[command.queryId]) {
    throw new Error(`query-not-found: Query ${command.queryId} does not exist.`);
  }
  const counts = countDataQueryReferences(snapshot.dataSources, command.queryId);
  if (counts.bindingCount > 0) {
    throw new Error(`query-in-use: Query ${command.queryId} is used by ${counts.bindingCount} object bindings.`);
  }

  const queries = { ...snapshot.dataSources.queries };
  delete queries[command.queryId];
  return {
    ...snapshot,
    dataSources: {
      ...snapshot.dataSources,
      queries
    }
  };
}

function withQuery(snapshot: SceneSnapshot, query: DataQuery): SceneSnapshot {
  return {
    ...snapshot,
    dataSources: {
      ...snapshot.dataSources,
      queries: {
        ...snapshot.dataSources.queries,
        [query.id]: query
      }
    }
  };
}

function cloneQueryDefinition(query: DataQuery): DataQueryDefinition {
  return JSON.parse(JSON.stringify({
    connectionId: query.connectionId,
    name: query.name,
    path: query.path,
    parameters: query.parameters,
    mapping: query.mapping
  })) as DataQueryDefinition;
}

function formatProblems(problems: readonly DataQueryDefinitionProblem[]): string {
  return problems.map((problem) => `${problem.code}: ${problem.message}`).join("\n");
}
