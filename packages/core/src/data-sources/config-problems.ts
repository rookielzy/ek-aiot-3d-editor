import { createDisplayMessageDescriptor } from "../i18n/display-messages";
import type { JsonValue } from "../snapshot/json";
import type { Problem, ProblemTarget } from "../problems/types";
import type { SceneSnapshot } from "../snapshot/types";
import type { DataCredentialDescriptor } from "./types";

/**
 * Durable references that cannot resolve are configuration damage, not a
 * transient runtime failure. They survive a project round-trip broken, so an
 * importer must report them instead of silently treating the scene as healthy.
 */
const CONFIG_PROBLEM_CODES = {
  "query-missing": {
    title: "Data binding points to a missing query",
    detail: "The binding references query {queryId}, which is not part of the saved data configuration.",
    severity: "error"
  },
  "target-not-object": {
    title: "Data binding target is not an object",
    detail: "The binding targets node {nodeId}, which must be an object node.",
    severity: "error"
  },
  "connection-missing": {
    title: "Data query points to a missing connection",
    detail: "Query {queryId} references connection {connectionId}, which is not part of the saved data configuration.",
    severity: "error"
  }
} as const;

type DataConfigProblemCode = keyof typeof CONFIG_PROBLEM_CODES;

export type DataRestoreOutcomeKind = "none" | "reconnect" | "config-error";

export interface DataRestoreOutcome {
  kind: DataRestoreOutcomeKind;
  /** Durable references that cannot resolve; these are not repairable by reconnect. */
  configProblems: readonly Problem[];
  /** Connections whose credential the host does not currently provide. */
  missingCredentialCount: number;
}
/**
 * Derive problems for durable data configuration that cannot resolve on its
 * own. Runtime gaps such as a missing executor, credential, network, or an
 * unloaded model are recoverable and deliberately absent here.
 */
export function buildDataConfigProblems(
  snapshot: Pick<SceneSnapshot, "nodes" | "dataSources">
): Problem[] {
  const problems: Problem[] = [];
  const queries = snapshot.dataSources.queries;

  for (const query of Object.values(queries)) {
    if (!snapshot.dataSources.connections[query.connectionId]) {
      problems.push(createConfigProblem("connection-missing", {
        kind: "data-query",
        connectionId: query.connectionId,
        queryId: query.id
      }, { queryId: query.id, connectionId: query.connectionId }));
    }
  }

  for (const binding of Object.values(snapshot.dataSources.bindings)) {
    const target: ProblemTarget = {
      kind: "data-object",
      nodeId: binding.objectNodeId,
      queryId: binding.queryId
    };
    if (!queries[binding.queryId]) {
      problems.push(createConfigProblem("query-missing", target, {
        nodeId: binding.objectNodeId,
        queryId: binding.queryId
      }));
    }
    if (snapshot.nodes[binding.objectNodeId]?.kind !== "object") {
      problems.push(createConfigProblem("target-not-object", target, {
        nodeId: binding.objectNodeId,
        queryId: binding.queryId
      }));
    }
  }

  return problems.sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Decide how a restored configuration stands against the current host. A
 * configuration error is damage the user must edit; a missing credential is
 * only a reconnect that keeps the configuration editable.
 */
export function classifyDataConfigProblems(
  snapshot: Pick<SceneSnapshot, "nodes" | "dataSources">,
  credentials: readonly DataCredentialDescriptor[]
): DataRestoreOutcome {
  const configProblems = buildDataConfigProblems(snapshot);
  const available = new Set(credentials.filter((credential) => credential.available).map((credential) => credential.ref));
  const missingCredentialCount = Object.values(snapshot.dataSources.connections)
    .filter((connection) => connection.auth.kind !== "none" && !available.has(connection.auth.credentialRef))
    .length;

  return {
    kind: configProblems.length > 0
      ? "config-error"
      : missingCredentialCount > 0 ? "reconnect" : "none",
    configProblems,
    missingCredentialCount
  };
}

function createConfigProblem(
  code: DataConfigProblemCode,
  target: ProblemTarget,
  values: Record<string, JsonValue>
): Problem {
  const definition = CONFIG_PROBLEM_CODES[code];
  const message = formatDetail(definition.detail, values);
  return Object.freeze({
    id: configProblemId(target, code),
    severity: definition.severity,
    code,
    source: "data" as const,
    target,
    message,
    objectId: target.kind === "data-object" ? target.nodeId : undefined,
    recoverability: "user-action" as const,
    display: Object.freeze({
      title: definition.title,
      titleDescriptor: createDisplayMessageDescriptor({
        namespace: "problem",
        path: "dataConfigProblem.title",
        field: "title",
        fallback: definition.title,
        values
      }),
      detail: message,
      detailDescriptor: createDisplayMessageDescriptor({
        namespace: "problem",
        path: `dataConfigProblem.${camelCode(code)}`,
        field: "detail",
        fallback: message,
        values
      })
    }),
    metadata: Object.freeze({ dataKind: "config", status: code, ...values })
  });
}

function configProblemId(target: ProblemTarget, code: DataConfigProblemCode): string {
  if (target.kind === "data-query") {
    return `data:config:query:${target.queryId}:${code}`;
  }
  if (target.kind === "data-object") {
    return `data:config:object:${target.nodeId}:${code}`;
  }
  return `data:config:scene:${code}`;
}

function formatDetail(template: string, values: Record<string, JsonValue>): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match
  );
}

function camelCode(code: string): string {
  return code
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((segment, index) => index === 0
      ? segment.charAt(0).toLowerCase() + segment.slice(1)
      : segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}
