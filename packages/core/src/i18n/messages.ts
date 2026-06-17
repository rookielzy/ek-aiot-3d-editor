import { isJsonCompatible, isPlainRecord, type JsonValue } from "../snapshot/json";

export const BUILTIN_LOCALES = ["en", "zh-CN"] as const;

export type SupportedLocale = (typeof BUILTIN_LOCALES)[number];
export type MessageKey = string;
export type MessageFallback = string;
export type MessageDescriptorValues = Record<string, JsonValue>;

export interface MessageDescriptor {
  key: MessageKey;
  fallback: MessageFallback;
  values?: MessageDescriptorValues;
}

export function createMessageDescriptor(options: MessageDescriptor): MessageDescriptor {
  if (options.values !== undefined && !isMessageDescriptorValues(options.values)) {
    throw new Error("Message descriptor values must be JSON-compatible.");
  }

  if (options.values === undefined) {
    return {
      key: options.key,
      fallback: options.fallback
    };
  }

  return {
    key: options.key,
    fallback: options.fallback,
    values: options.values
  };
}

export function isMessageDescriptorValues(value: unknown): value is MessageDescriptorValues {
  return isPlainRecord(value) && isJsonCompatible(value);
}

export function resolveMessageFallback(descriptor: MessageDescriptor): string {
  return descriptor.fallback;
}
