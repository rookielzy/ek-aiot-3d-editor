import { isJsonCompatible, isPlainRecord, type JsonValue } from "../snapshot/json";

export const BUILTIN_LOCALES = Object.freeze(["en", "zh-CN"] as const);

export type SupportedLocale = (typeof BUILTIN_LOCALES)[number];
export type MessageKey = `${string}.${string}`;
export type MessageFallback = string;
export type MessageDescriptorValues = Record<string, JsonValue>;

export interface MessageDescriptor {
  readonly key: MessageKey;
  readonly fallback: MessageFallback;
  readonly values?: MessageDescriptorValues;
}

export interface CreateMessageDescriptorInput {
  key?: unknown;
  fallback?: unknown;
  values?: unknown;
}

const MESSAGE_KEY_PATTERN = /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+$/;
const OBJECT_URL_PREFIX = "blob:";

export function createMessageDescriptor(input: CreateMessageDescriptorInput): MessageDescriptor {
  if (!isMessageKey(input.key)) {
    throw new Error("Message descriptor key must be a non-empty namespaced key.");
  }
  if (typeof input.fallback !== "string" || input.fallback.trim().length === 0) {
    throw new Error("Message descriptor fallback must be a non-empty string.");
  }
  if (input.values !== undefined && !isMessageDescriptorValues(input.values)) {
    throw new Error("Message descriptor values must be JSON-compatible and must not include runtime-only values.");
  }

  if (input.values === undefined) {
    return Object.freeze({
      key: input.key,
      fallback: input.fallback
    });
  }

  return Object.freeze({
    key: input.key,
    fallback: input.fallback,
    values: freezeJsonValue(cloneJsonValue(input.values)) as MessageDescriptorValues
  });
}

export function isMessageKey(value: unknown): value is MessageKey {
  return typeof value === "string" && MESSAGE_KEY_PATTERN.test(value);
}

export function isMessageDescriptorValues(value: unknown): value is MessageDescriptorValues {
  return isPlainRecord(value) && isJsonCompatible(value) && !containsRuntimeOnlyDescriptorValue(value);
}

function containsRuntimeOnlyDescriptorValue(value: JsonValue): boolean {
  if (typeof value === "string") {
    return value.startsWith(OBJECT_URL_PREFIX);
  }
  if (Array.isArray(value)) {
    return value.some(containsRuntimeOnlyDescriptorValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(containsRuntimeOnlyDescriptorValue);
  }
  return false;
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry)]));
  }
  return value;
}

function freezeJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    value.forEach(freezeJsonValue);
    return Object.freeze(value) as JsonValue;
  }
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freezeJsonValue);
    return Object.freeze(value) as JsonValue;
  }
  return value;
}
