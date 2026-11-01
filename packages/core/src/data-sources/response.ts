import type { JsonValue } from "../snapshot/json";
import { resolveDataPath } from "./path";
import type { DataSuccessCondition } from "./types";

export interface DataResponseDescriptor {
  status: number;
  body: string;
  contentType?: string | null;
  headers?: Readonly<Record<string, string>>;
}

export type DataResponseBodyKind = "json" | "text" | "empty";

export interface DataQueryResponse {
  status: number;
  ok: boolean;
  contentType: string | null;
  headers: Readonly<Record<string, string>>;
  bodyText: string;
  bodyKind: DataResponseBodyKind;
  json?: JsonValue;
  receivedAt: number;
}

export type DataResponseFailureCode =
  | "response-invalid"
  | "response-http"
  | "response-auth"
  | "response-too-large"
  | "response-not-json"
  | "response-json-invalid"
  | "response-business";

export interface DataResponseFailure {
  code: DataResponseFailureCode;
  message: string;
  status: number | null;
  retryable: boolean;
  receivedAt: number | null;
  response: DataQueryResponse | null;
}

export type DataResponseEvaluation =
  | { kind: "success"; response: DataQueryResponse; json: JsonValue }
  | { kind: "empty"; response: DataQueryResponse }
  | { kind: "failure"; failure: DataResponseFailure };

export interface EvaluateDataResponseOptions {
  receivedAt: number;
  maxResponseBytes: number;
  successCondition: DataSuccessCondition | null;
}

export function evaluateDataResponse(
  value: unknown,
  options: EvaluateDataResponseOptions
): DataResponseEvaluation {
  const descriptor = normalizeDescriptor(value);
  if (!descriptor) {
    return { kind: "failure", failure: invalidFailure("The host returned an invalid response descriptor.") };
  }

  const byteLength = utf8ByteLength(descriptor.body);
  if (descriptor.status < 200 || descriptor.status >= 300) {
    // Status classification takes precedence over the size limit so auth pauses
    // and GET backoff survive oversized error bodies.
    const response = buildResponse(descriptor, options.receivedAt, byteLength <= options.maxResponseBytes);
    const auth = response.status === 401 || response.status === 403;
    return {
      kind: "failure",
      failure: {
        code: auth ? "response-auth" : "response-http",
        message: auth
          ? `The service returned HTTP ${response.status}. Fix credentials, then retry.`
          : `The service returned HTTP ${response.status}.`,
        status: response.status,
        retryable: isRetryableStatus(response.status),
        receivedAt: options.receivedAt,
        response
      }
    };
  }

  if (byteLength > options.maxResponseBytes) {
    return {
      kind: "failure",
      failure: {
        code: "response-too-large",
        message: `The response exceeded the ${options.maxResponseBytes} byte limit.`,
        status: descriptor.status,
        retryable: false,
        receivedAt: options.receivedAt,
        response: null
      }
    };
  }

  const response = buildResponse(descriptor, options.receivedAt);
  if (response.status === 204 || response.bodyKind === "empty") {
    return { kind: "empty", response };
  }
  if (isExplicitNonJson(response.contentType)) {
    return {
      kind: "failure",
      failure: {
        code: "response-not-json",
        message: "The response content type is not JSON.",
        status: response.status,
        retryable: false,
        receivedAt: options.receivedAt,
        response
      }
    };
  }
  if (response.bodyKind !== "json" || response.json === undefined) {
    return {
      kind: "failure",
      failure: {
        code: "response-json-invalid",
        message: "The response body is not valid JSON.",
        status: response.status,
        retryable: false,
        receivedAt: options.receivedAt,
        response
      }
    };
  }

  const condition = options.successCondition;
  if (condition) {
    const actual = resolveDataPath(response.json, condition.path);
    if (actual === undefined || !strictScalarEqual(actual, condition.equals)) {
      return {
        kind: "failure",
        failure: {
          code: "response-business",
          message: "The response did not satisfy the business success condition.",
          status: response.status,
          retryable: false,
          receivedAt: options.receivedAt,
          response
        }
      };
    }
  }

  return { kind: "success", response, json: response.json };
}

function invalidFailure(message: string): DataResponseFailure {
  return {
    code: "response-invalid",
    message,
    status: null,
    retryable: false,
    receivedAt: null,
    response: null
  };
}

function normalizeDescriptor(value: unknown): DataResponseDescriptor | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const descriptor = value as Partial<DataResponseDescriptor>;
  if (
    typeof descriptor.status !== "number" ||
    !Number.isInteger(descriptor.status) ||
    descriptor.status < 100 ||
    descriptor.status > 599
  ) {
    return null;
  }
  if (typeof descriptor.body !== "string") {
    return null;
  }
  if (
    descriptor.contentType !== undefined &&
    descriptor.contentType !== null &&
    typeof descriptor.contentType !== "string"
  ) {
    return null;
  }
  if (descriptor.headers !== undefined) {
    if (!descriptor.headers || typeof descriptor.headers !== "object" || Array.isArray(descriptor.headers)) {
      return null;
    }
    for (const headerValue of Object.values(descriptor.headers)) {
      if (typeof headerValue !== "string") {
        return null;
      }
    }
  }
  return {
    status: descriptor.status,
    body: descriptor.body,
    contentType: descriptor.contentType ?? null,
    headers: descriptor.headers ?? {}
  };
}

function buildResponse(
  descriptor: DataResponseDescriptor,
  receivedAt: number,
  parseJson = true
): DataQueryResponse {
  const headers: Record<string, string> = { ...descriptor.headers };
  const trimmed = descriptor.body.trim();
  let bodyKind: DataResponseBodyKind = "empty";
  let json: JsonValue | undefined;
  if (trimmed.length > 0) {
    if (!parseJson) {
      bodyKind = "text";
    }
    if (parseJson) {
      try {
        json = JSON.parse(trimmed) as JsonValue;
        bodyKind = "json";
      } catch {
        bodyKind = "text";
      }
    }
  }
  return Object.freeze({
    status: descriptor.status,
    ok: descriptor.status >= 200 && descriptor.status < 300,
    contentType: descriptor.contentType ?? null,
    headers: Object.freeze(headers),
    bodyText: descriptor.body,
    bodyKind,
    ...(bodyKind === "json" ? { json } : {}),
    receivedAt
  });
}

function isExplicitNonJson(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return mediaType.length > 0 && mediaType !== "application/json" && !mediaType.endsWith("+json");
}

function strictScalarEqual(actual: JsonValue, expected: unknown): boolean {
  if (actual === null || expected === null) {
    return actual === expected;
  }
  if (typeof actual === "object") {
    return false;
  }
  return typeof actual === typeof expected && actual === expected;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
