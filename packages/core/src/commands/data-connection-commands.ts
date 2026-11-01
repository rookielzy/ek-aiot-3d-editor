import { createDataConnectionId, createUniqueDataConnectionName } from "../data-sources/defaults";
import { countDataConnectionReferences } from "../data-sources/workspace";
import type { DataConnection, DataConnectionDraft, DataConnectionProblem } from "../data-sources/types";
import { validateDataConnectionDraft } from "../data-sources/validation";
import type { SceneSnapshot } from "../snapshot/types";
import type {
  CreateDataConnectionCommand,
  DeleteDataConnectionCommand,
  DuplicateDataConnectionCommand,
  UpdateDataConnectionCommand
} from "./types";

export function applyCreateDataConnection(snapshot: SceneSnapshot, command: CreateDataConnectionCommand): SceneSnapshot {
  const validation = validateDataConnectionDraft(snapshot, command.connection);
  if (!validation.ok || !validation.value) {
    throw new Error(formatProblems(validation.problems));
  }

  const requestedId = command.connection.id?.trim();
  const id = requestedId || createDataConnectionId(snapshot.dataSources.connections);
  if (snapshot.dataSources.connections[id]) {
    throw new Error(`command-failed: Connection ${id} already exists.`);
  }

  return withConnection(snapshot, {
    id,
    ...validation.value
  });
}

export function applyUpdateDataConnection(snapshot: SceneSnapshot, command: UpdateDataConnectionCommand): SceneSnapshot {
  const existing = snapshot.dataSources.connections[command.connectionId];
  if (!existing) {
    throw new Error(`connection-not-found: Connection ${command.connectionId} does not exist.`);
  }

  const validation = validateDataConnectionDraft(snapshot, command.connection, { connectionId: command.connectionId });
  if (!validation.ok || !validation.value) {
    throw new Error(formatProblems(validation.problems));
  }

  return withConnection(snapshot, {
    id: command.connectionId,
    ...validation.value
  });
}

export function applyDuplicateDataConnection(snapshot: SceneSnapshot, command: DuplicateDataConnectionCommand): SceneSnapshot {
  const source = snapshot.dataSources.connections[command.connectionId];
  if (!source) {
    throw new Error(`connection-not-found: Connection ${command.connectionId} does not exist.`);
  }

  const requestedId = command.id?.trim();
  const id = requestedId || createDataConnectionId(snapshot.dataSources.connections);
  if (snapshot.dataSources.connections[id]) {
    throw new Error(`command-failed: Connection ${id} already exists.`);
  }

  const requestedName = command.name?.trim();
  const name = requestedName || createUniqueDataConnectionName(
    Object.values(snapshot.dataSources.connections).map((connection) => connection.name),
    `${source.name} copy`
  );
  const draft: DataConnectionDraft = {
    name,
    baseUrl: source.baseUrl,
    auth: copyAuth(source.auth),
    headers: { ...source.headers },
    timeoutMs: source.timeoutMs
  };
  const validation = validateDataConnectionDraft(snapshot, draft);
  if (!validation.ok || !validation.value) {
    throw new Error(formatProblems(validation.problems));
  }

  return withConnection(snapshot, {
    id,
    ...validation.value
  });
}

export function applyDeleteDataConnection(snapshot: SceneSnapshot, command: DeleteDataConnectionCommand): SceneSnapshot {
  if (!snapshot.dataSources.connections[command.connectionId]) {
    throw new Error(`connection-not-found: Connection ${command.connectionId} does not exist.`);
  }

  const counts = countDataConnectionReferences(snapshot.dataSources, command.connectionId);
  if (counts.queryCount > 0 || counts.bindingCount > 0) {
    throw new Error(`connection-in-use: Connection ${command.connectionId} is in use by ${counts.queryCount} queries.`);
  }

  const connections = { ...snapshot.dataSources.connections };
  delete connections[command.connectionId];
  return {
    ...snapshot,
    dataSources: {
      ...snapshot.dataSources,
      connections
    }
  };
}

function withConnection(snapshot: SceneSnapshot, connection: DataConnection): SceneSnapshot {
  return {
    ...snapshot,
    dataSources: {
      ...snapshot.dataSources,
      connections: {
        ...snapshot.dataSources.connections,
        [connection.id]: connection
      }
    }
  };
}

function copyAuth(auth: DataConnection["auth"]): DataConnection["auth"] {
  switch (auth.kind) {
    case "bearer":
      return { kind: "bearer", credentialRef: auth.credentialRef };
    case "api-key":
      return {
        kind: "api-key",
        credentialRef: auth.credentialRef,
        headerName: auth.headerName
      };
    default:
      return { kind: "none" };
  }
}

function formatProblems(problems: readonly DataConnectionProblem[]): string {
  return problems.map((problem) => `${problem.code}: ${problem.message}`).join("\n");
}
