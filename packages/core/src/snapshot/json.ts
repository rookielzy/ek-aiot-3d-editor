export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export function isJsonCompatible(value: unknown, seen = new WeakSet<object>()): value is JsonValue {
  if (value === null) {
    return true;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "object") {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  let compatible: boolean;
  if (Array.isArray(value)) {
    compatible = value.every((entry) => isJsonCompatible(entry, seen));
  } else if (!isPlainRecord(value)) {
    compatible = false;
  } else {
    compatible = Object.entries(value).every(([key, entry]) => typeof key === "string" && isJsonCompatible(entry, seen));
  }

  seen.delete(value);
  return compatible;
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
