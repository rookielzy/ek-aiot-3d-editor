import { isPlainRecord, type JsonValue } from "../snapshot/json";
import type { DataPath, DataPathSegment } from "./types";

const UNSAFE_PATH_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const BARE_KEY = /^[A-Za-z0-9_-]+$/;
const BARE_KEY_SOURCE = /^[^.[\]\\\s"'*]+/;
const INDEX_SOURCE = /^\[(\d+)\]/;

export function parseDataPath(text: string): DataPath | null {
  const input = text.trim();
  if (input.length === 0) {
    return [];
  }

  const segments: DataPathSegment[] = [];
  let index = 0;
  let expectKey = true;
  while (index < input.length) {
    const rest = input.slice(index);
    const bracketMatch = INDEX_SOURCE.exec(rest);
    if (bracketMatch) {
      const parsed = Number(bracketMatch[1]);
      if (!Number.isSafeInteger(parsed)) {
        return null;
      }
      segments.push({ kind: "index", index: parsed });
      index += bracketMatch[0].length;
      expectKey = false;
      continue;
    }
    if (rest.startsWith("[")) {
      const quoted = parseQuotedKey(rest);
      if (!quoted) {
        return null;
      }
      if (UNSAFE_PATH_KEYS.has(quoted.key) || quoted.key.includes("*")) {
        return null;
      }
      segments.push({ kind: "key", key: quoted.key });
      index += quoted.length;
      expectKey = false;
      continue;
    }
    if (!expectKey) {
      if (!rest.startsWith(".")) {
        return null;
      }
      index += 1;
      if (index >= input.length) {
        return null;
      }
      expectKey = true;
      continue;
    }
    const bareMatch = BARE_KEY_SOURCE.exec(rest);
    if (!bareMatch) {
      return null;
    }
    if (UNSAFE_PATH_KEYS.has(bareMatch[0])) {
      return null;
    }
    segments.push({ kind: "key", key: bareMatch[0] });
    index += bareMatch[0].length;
    expectKey = false;
  }

  if (expectKey || segments.length === 0) {
    return null;
  }
  return segments;
}

export function formatDataPath(path: DataPath): string {
  return path.map((segment, index) => {
    if (segment.kind === "index") {
      return `[${segment.index}]`;
    }
    if (BARE_KEY.test(segment.key)) {
      return index === 0 ? segment.key : `.${segment.key}`;
    }
    return `[${JSON.stringify(segment.key)}]`;
  }).join("");
}

export function resolveDataPath(value: unknown, path: DataPath): JsonValue | undefined {
  let current: unknown = value;
  for (const segment of path) {
    if (segment.kind === "index") {
      if (!Array.isArray(current) || segment.index >= current.length) {
        return undefined;
      }
      current = current[segment.index];
      continue;
    }
    if (!isPlainRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment.key)) {
      return undefined;
    }
    current = current[segment.key];
  }
  return current as JsonValue | undefined;
}

export function isValidDataPath(value: unknown, options: { allowEmpty?: boolean } = {}): value is DataPath {
  if (!Array.isArray(value)) {
    return false;
  }
  if (value.length === 0) {
    return options.allowEmpty ?? false;
  }
  for (const segment of value) {
    if (!isPlainRecord(segment)) {
      return false;
    }
    if (segment.kind === "index") {
      if (!Number.isSafeInteger(segment.index) || (segment.index as number) < 0) {
        return false;
      }
      continue;
    }
    if (segment.kind !== "key" || typeof segment.key !== "string" || segment.key.length === 0) {
      return false;
    }
    if (UNSAFE_PATH_KEYS.has(segment.key) || segment.key.includes("*")) {
      return false;
    }
  }
  return true;
}

function parseQuotedKey(input: string): { key: string; length: number } | null {
  if (input[1] !== "\"") {
    return null;
  }
  // Bracket-quoted keys use JSON string syntax: ["field.name"].
  let end = 2;
  let escaped = false;
  for (; end < input.length; end += 1) {
    const character = input[end];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\"") {
      break;
    }
  }
  if (end >= input.length || input[end] !== "\"" || input[end + 1] !== "]") {
    return null;
  }
  const literal = input.slice(1, end + 1);
  let key: unknown;
  try {
    key = JSON.parse(literal);
  } catch {
    return null;
  }
  if (typeof key !== "string" || key.length === 0) {
    return null;
  }
  return { key, length: end + 2 };
}
