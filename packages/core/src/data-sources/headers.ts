import { isPlainRecord } from "../snapshot/json";
import type { DataConnectionAuth } from "./types";

export const RESERVED_DATA_HEADER_NAMES = Object.freeze([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie"
]);

const UNSAFE_HEADER_NAMES = new Set(["__proto__", "constructor", "prototype"]);
const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export interface DataHeaderProblem {
  name: string;
  code: "invalid" | "reserved";
  message: string;
}

export interface DataHeaderValidationResult {
  headers: Record<string, string> | null;
  problems: DataHeaderProblem[];
}

export function isValidDataHeaderName(name: string): boolean {
  return HTTP_TOKEN.test(name);
}

/** Header names that carry secrets and are therefore owned by authentication. */
export function reservedDataHeaderNames(auth?: DataConnectionAuth | null): Set<string> {
  const names = new Set(RESERVED_DATA_HEADER_NAMES);
  if (auth?.kind === "api-key") {
    names.add(auth.headerName.trim().toLowerCase());
  }
  return names;
}

export function validateDataHeaders(
  value: unknown,
  options: { reserved?: ReadonlySet<string> } = {}
): DataHeaderValidationResult {
  if (value === undefined) {
    return { headers: {}, problems: [] };
  }
  if (!isPlainRecord(value)) {
    return {
      headers: null,
      problems: [{
        name: "",
        code: "invalid",
        message: "Headers must be a plain object."
      }]
    };
  }

  const reserved = options.reserved ?? reservedDataHeaderNames();
  const headers: Record<string, string> = {};
  const problems: DataHeaderProblem[] = [];
  const seen = new Set<string>();
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = rawName.trim();
    const key = name.toLowerCase();
    if (!name || name !== rawName || !isValidDataHeaderName(name) || UNSAFE_HEADER_NAMES.has(key)) {
      problems.push({
        name: rawName,
        code: "invalid",
        message: `Header name "${rawName}" is invalid.`
      });
      continue;
    }
    if (seen.has(key)) {
      problems.push({
        name: rawName,
        code: "invalid",
        message: `Header "${rawName}" is defined more than once.`
      });
      continue;
    }
    seen.add(key);
    if (reserved.has(key)) {
      problems.push({
        name: rawName,
        code: "reserved",
        message: `Header "${rawName}" is reserved for authentication.`
      });
      continue;
    }
    if (typeof rawValue !== "string" || /[\r\n\u0000-\u001f\u007f]/.test(rawValue)) {
      problems.push({
        name: rawName,
        code: "invalid",
        message: `Header "${rawName}" must have a safe string value.`
      });
      continue;
    }
    headers[name] = rawValue;
  }

  return { headers: problems.length === 0 ? headers : null, problems };
}

/** Later headers replace earlier ones regardless of letter case. */
export function mergeDataHeaders(
  base: Readonly<Record<string, string>>,
  override: Readonly<Record<string, string>>
): Record<string, string> {
  const merged = new Map<string, { name: string; value: string }>();
  for (const [name, value] of [...Object.entries(base), ...Object.entries(override)]) {
    merged.set(name.toLowerCase(), { name, value });
  }
  return Object.fromEntries([...merged.values()].map(({ name, value }) => [name, value]));
}

export function findDataHeaderName(
  headers: Readonly<Record<string, string>>,
  name: string
): string | null {
  const target = name.toLowerCase();
  return Object.keys(headers).find((candidate) => candidate.toLowerCase() === target) ?? null;
}
