import type { CreateDataConnectionCommand, DuplicateDataConnectionCommand, DeleteDataConnectionCommand, UpdateDataConnectionCommand } from "../commands/types";
import type { SceneSnapshot } from "../snapshot/types";
import { createUniqueDataConnectionName, isDataConnectionNameTaken } from "./defaults";
import type {
  DataConnectionDraft,
  DataConnectionInput,
  DataConnectionProblem
} from "./types";
import { validateDataConnectionDraft } from "./validation";
import { countDataConnectionReferences } from "./workspace";

export type DataConnectionCommand =
  | CreateDataConnectionCommand
  | UpdateDataConnectionCommand
  | DuplicateDataConnectionCommand
  | DeleteDataConnectionCommand;

export type DataConnectionCommandBuildResult =
  | { ok: true; command: DataConnectionCommand }
  | { ok: false; problems: DataConnectionProblem[] };

export interface SaveDataConnectionOptions {
  connectionId?: string | null;
}

export function buildSaveDataConnectionCommand(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  draft: DataConnectionInput | DataConnectionDraft,
  options: SaveDataConnectionOptions = {}
): DataConnectionCommandBuildResult {
  const connectionId = options.connectionId ?? null;
  if (connectionId && !snapshot.dataSources.connections[connectionId]) {
    return { ok: false, problems: [connectionNotFoundProblem(connectionId)] };
  }

  const validation = validateDataConnectionDraft(snapshot, draft, { connectionId });
  if (!validation.ok || !validation.value) {
    return { ok: false, problems: validation.problems };
  }

  if (connectionId) {
    return {
      ok: true,
      command: {
        type: "update-data-connection",
        connectionId,
        connection: validation.value
      }
    };
  }

  const requestedId = "id" in draft && typeof draft.id === "string" ? draft.id.trim() : "";
  if (requestedId && snapshot.dataSources.connections[requestedId]) {
    return {
      ok: false,
      problems: [{
        field: "connection",
        code: "command-failed",
        message: `Connection ${requestedId} already exists.`
      }]
    };
  }

  return {
    ok: true,
    command: {
      type: "create-data-connection",
      connection: {
        ...validation.value,
        ...(requestedId ? { id: requestedId } : {})
      }
    }
  };
}

export function buildDuplicateDataConnectionCommand(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  connectionId: string,
  options: { id?: string; name?: string } = {}
): DataConnectionCommandBuildResult {
  const source = snapshot.dataSources.connections[connectionId];
  if (!source) {
    return { ok: false, problems: [connectionNotFoundProblem(connectionId)] };
  }

  const requestedName = options.name?.trim();
  if (requestedName && isDataConnectionNameTaken(
    Object.values(snapshot.dataSources.connections),
    requestedName,
    { connectionId }
  )) {
    return {
      ok: false,
      problems: [{
        field: "name",
        code: "name-duplicate",
        message: `Connection name "${requestedName}" is already in use.`
      }]
    };
  }

  const name = requestedName || createUniqueDataConnectionName(
    Object.values(snapshot.dataSources.connections).map((connection) => connection.name),
    `${source.name} copy`
  );
  const id = options.id?.trim();
  if (id && snapshot.dataSources.connections[id]) {
    return {
      ok: false,
      problems: [{
        field: "connection",
        code: "command-failed",
        message: `Connection ${id} already exists.`
      }]
    };
  }

  return {
    ok: true,
    command: {
      type: "duplicate-data-connection",
      connectionId,
      ...(id ? { id } : {}),
      name
    }
  };
}

export function buildDeleteDataConnectionCommand(
  snapshot: Pick<SceneSnapshot, "dataSources">,
  connectionId: string
): DataConnectionCommandBuildResult {
  if (!snapshot.dataSources.connections[connectionId]) {
    return { ok: false, problems: [connectionNotFoundProblem(connectionId)] };
  }

  const counts = countDataConnectionReferences(snapshot.dataSources, connectionId);
  if (counts.queryCount > 0 || counts.bindingCount > 0) {
    return {
      ok: false,
      problems: [{
        field: "connection",
        code: "connection-in-use",
        message: `Connection ${connectionId} is used by ${counts.queryCount} queries.`
      }]
    };
  }

  return {
    ok: true,
    command: {
      type: "delete-data-connection",
      connectionId
    }
  };
}

function connectionNotFoundProblem(connectionId: string): DataConnectionProblem {
  return {
    field: "connection",
    code: "connection-not-found",
    message: `Connection ${connectionId} does not exist.`
  };
}
