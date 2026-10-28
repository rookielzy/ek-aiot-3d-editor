import type { JsonValue } from "../snapshot/json";
import { createMessageDescriptor } from "../i18n/messages";
import type { Problem, ProblemSeverity, ProblemTarget } from "../problems/types";
import type {
  DataObjectContextState,
  DataObjectDataState,
  DataObjectRuntimeProblem,
  DataObjectRuntimeState
} from "./object-data";

interface DataProblemDraft {
  id: string;
  severity: ProblemSeverity;
  code: string;
  target: ProblemTarget;
  message: string;
  titleKey: string;
  title: string;
  detailKey: string | null;
  detail: string;
  values: Record<string, JsonValue>;
  recoverability: Problem["recoverability"];
  category: string;
}

const MAPPING_ENTITY_CODES = new Set([
  "display-name-invalid",
  "entity-id-duplicate",
  "entity-id-invalid",
  "entity-id-missing",
  "observed-at-future",
  "observed-at-invalid",
  "observed-at-missing",
  "source-quality-invalid"
]);

export function buildDataRuntimeProblems(state: DataObjectDataState): Problem[] {
  const drafts = new Map<string, DataProblemDraft>();
  const add = (draft: DataProblemDraft): void => {
    if (!drafts.has(draft.id)) {
      drafts.set(draft.id, draft);
    }
  };

  for (const object of Object.values(state.objects)) {
    const context = object.contextKey ? state.contexts[object.contextKey] ?? null : null;
    for (const problem of object.problems) {
      add(contextProblemDraft(object, context, problem));
    }
    for (const field of object.fields) {
      for (const problem of field.problems) {
        add(fieldProblemDraft(object, context, problem.code, problem.message, field.key));
      }
    }
    if (object.observedAtProblem) {
      add(fieldProblemDraft(
        object,
        context,
        object.observedAtProblem.code,
        object.observedAtProblem.message,
        null
      ));
    }
    if (object.qualityProblem) {
      add(fieldProblemDraft(
        object,
        context,
        object.qualityProblem.code,
        object.qualityProblem.message,
        null
      ));
    }
    if (
      !object.freshness.fresh &&
      object.receivedAt !== null &&
      (object.status === "ready" || object.status === "partial")
    ) {
      add(staleProblemDraft(object, context));
    }
  }

  return [...drafts.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((draft) => Object.freeze({
      id: draft.id,
      severity: draft.severity,
      code: draft.code,
      source: "data" as const,
      target: draft.target,
      message: draft.message,
      objectId: "nodeId" in draft.target ? draft.target.nodeId : undefined,
      recoverability: draft.recoverability,
      display: Object.freeze({
        title: draft.title,
        titleDescriptor: createMessageDescriptor({
          key: draft.titleKey,
          fallback: draft.title,
          values: draft.values
        }),
        detail: draft.detail,
        detailDescriptor: draft.detailKey
          ? createMessageDescriptor({
              key: draft.detailKey,
              fallback: draft.detail,
              values: draft.values
            })
          : undefined
      }),
      metadata: Object.freeze({
        dataKind: draft.category,
        status: draft.code,
        ...draft.values
      })
    }));
}

function contextProblemDraft(
  object: DataObjectRuntimeState,
  context: DataObjectContextState | null,
  problem: DataObjectRuntimeProblem
): DataProblemDraft {
  const target = contextTarget(object, context, problem);
  const category = problem.kind;
  const titleKey = problem.kind === "freshness"
    ? "dataBinding.card.status.expired"
    : problem.kind === "device"
      ? "dataBinding.card.status.missingDevice"
      : problem.code === "response-auth"
        ? "dataBinding.card.status.authPaused"
        : problem.kind === "mapping"
          ? "dataSources.mappingProblem.title"
          : "dataBinding.card.status.error";
  const title = defaultTitle(problem.kind, problem.code);
  const { detailKey, detail, values } = describeRuntimeProblem(object, problem);
  return {
    id: problemId(target, problem.code, problem.propertyKey ?? problem.parameterName ?? ""),
    severity: problem.kind === "mapping" || problem.kind === "device" ? "warning" : "error",
    code: problem.code,
    target,
    message: problem.message,
    titleKey,
    title,
    detailKey,
    detail,
    values,
    recoverability: problem.code === "response-auth" || problem.kind === "mapping" || problem.kind === "device"
      ? "user-action"
      : "automatic",
    category
  };
}

function fieldProblemDraft(
  object: DataObjectRuntimeState,
  context: DataObjectContextState | null,
  code: string,
  message: string,
  propertyKey: string | null
): DataProblemDraft {
  const target: ProblemTarget = MAPPING_ENTITY_CODES.has(code) || !propertyKey
    ? objectTarget(object)
    : {
        kind: "data-field",
        nodeId: object.objectNodeId,
        queryId: object.queryId,
        propertyKey
      };
  const values: Record<string, JsonValue> = {
    propertyKey: propertyKey ?? "",
    nodeId: object.objectNodeId,
    queryId: object.queryId,
    ...(context ? { connectionId: context.connectionId } : {})
  };
  return {
    id: problemId(target, code, propertyKey ?? ""),
    severity: "warning",
    code,
    target,
    message,
    titleKey: "dataSources.mappingProblem.title",
    title: "Field problem",
    detailKey: `dataSources.mappingProblem.${camelCode(code)}`,
    detail: message,
    values,
    recoverability: "user-action",
    category: "mapping"
  };
}

function staleProblemDraft(
  object: DataObjectRuntimeState,
  context: DataObjectContextState | null
): DataProblemDraft {
  const target = objectTarget(object);
  const seconds = Math.max(0, Math.round(object.freshness.maxAgeMs / 1000));
  return {
    id: problemId(target, "data-stale", ""),
    severity: "warning",
    code: "data-stale",
    target,
    message: `The current value exceeded the ${seconds} s freshness limit.`,
    titleKey: "dataBinding.card.status.expired",
    title: "Data expired",
    detailKey: "dataBinding.card.expiredDetail",
    detail: `The last value was not refreshed within ${seconds} s.`,
    values: {
      maxAgeSeconds: seconds,
      nodeId: object.objectNodeId,
      queryId: object.queryId,
      ...(context ? { connectionId: context.connectionId } : {})
    },
    recoverability: "automatic",
    category: "freshness"
  };
}

function contextTarget(
  object: DataObjectRuntimeState,
  context: DataObjectContextState | null,
  problem: DataObjectRuntimeProblem
): ProblemTarget {
  if (problem.kind === "device" || problem.kind === "freshness") {
    return objectTarget(object);
  }
  if (problem.kind === "mapping") {
    if (problem.propertyKey) {
      return {
        kind: "data-field",
        nodeId: object.objectNodeId,
        queryId: object.queryId,
        propertyKey: problem.propertyKey
      };
    }
    return objectTarget(object);
  }
  if (context) {
    return {
      kind: "data-query",
      connectionId: context.connectionId,
      queryId: context.queryId
    };
  }
  return objectTarget(object);
}

function objectTarget(object: DataObjectRuntimeState): ProblemTarget {
  return {
    kind: "data-object",
    nodeId: object.objectNodeId,
    queryId: object.queryId
  };
}

function problemId(target: ProblemTarget, code: string, location: string): string {
  if (target.kind === "data-query") {
    return `data:query:${target.queryId}:${code}:${location}`;
  }
  if (target.kind === "data-field") {
    return `data:field:${target.nodeId}:${target.propertyKey}:${code}`;
  }
  if (target.kind === "data-object") {
    return `data:object:${target.nodeId}:${code}:${location}`;
  }
  return `data:${target.kind}:${code}:${location}`;
}

function describeRuntimeProblem(
  object: DataObjectRuntimeState,
  problem: DataObjectRuntimeProblem
): { detailKey: string | null; detail: string; values: Record<string, JsonValue> } {
  const values: Record<string, JsonValue> = {
    nodeId: object.objectNodeId,
    queryId: object.queryId,
    deviceId: object.deviceId,
    parameterName: problem.parameterName ?? "",
    propertyKey: problem.propertyKey ?? "",
    status: problem.status ?? "",
    detail: problem.message
  };
  if (problem.kind === "request") {
    if (problem.code === "response-auth") {
      return {
        detailKey: "dataBinding.card.authPausedDetail",
        detail: `The service returned HTTP ${problem.status ?? ""}. Fix credentials, then retry.`,
        values
      };
    }
    return {
      detailKey: `dataSources.request.problem.${camelCode(problem.code)}`,
      detail: problem.message,
      values
    };
  }
  if (problem.kind === "parameters" || problem.kind === "binding") {
    if (problem.code === "query-missing") {
      return {
        detailKey: "dataBinding.card.queryMissing",
        detail: `Query ${object.queryId} does not exist.`,
        values
      };
    }
    return {
      detailKey: "dataBinding.card.runtimeParameters",
      detail: problem.message,
      values
    };
  }
  if (problem.kind === "device") {
    return {
      detailKey: "dataBinding.card.deviceMissing",
      detail: `Device ${object.deviceId} is not in the current result.`,
      values
    };
  }
  if (problem.kind === "mapping") {
    return {
      detailKey: `dataSources.mappingProblem.${camelCode(problem.code)}`,
      detail: problem.message,
      values
    };
  }
  return { detailKey: null, detail: problem.message, values };
}

function defaultTitle(kind: DataObjectRuntimeProblem["kind"], code: string): string {
  if (code === "response-auth") {
    return "Authentication paused";
  }
  switch (kind) {
    case "mapping":
      return "Field problem";
    case "device":
      return "Device not in current result";
    case "freshness":
      return "Data expired";
    default:
      return "Device data request failed";
  }
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
