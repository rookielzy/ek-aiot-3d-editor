import { isPlainRecord, type JsonValue } from "../snapshot/json";
import { parseDataIsoDateTime } from "./response";
import type { DataDeviceEndpointKind } from "./types";

export function validateDeviceEndpointResponse(kind: DataDeviceEndpointKind, json: JsonValue | undefined):
  { ok: true; count: number } | { ok: false; path: string } {
  if (!Array.isArray(json)) return { ok: false, path: "$" };

  const deviceIds = new Set<string>();
  for (const [index, device] of json.entries()) {
    const path = `$[${index}]`;
    if (!isPlainRecord(device)) return { ok: false, path };
    if (!nonEmptyText(device.deviceId) || deviceIds.has(device.deviceId)) {
      return { ok: false, path: `${path}.deviceId` };
    }
    deviceIds.add(device.deviceId);
    if (kind === "deviceList") {
      if (!nonEmptyText(device.deviceName)) return { ok: false, path: `${path}.deviceName` };
      if (device.ext !== undefined && !isPlainRecord(device.ext)) return { ok: false, path: `${path}.ext` };
      continue;
    }
    const invalidPath = invalidRealtimePath(device);
    if (invalidPath) return { ok: false, path: `${path}.${invalidPath}` };
  }
  return { ok: true, count: json.length };
}

function invalidRealtimePath(device: Record<string, unknown>): string | null {
  if (!Number.isInteger(device.runningStatus)) return "runningStatus";
  const statusValues = enumValues(device.runningStatusEnum, Number.isInteger);
  if (!statusValues?.has(device.runningStatus)) return "runningStatusEnum";
  if (device.observedAt !== undefined && parseDataIsoDateTime(device.observedAt) === null) return "observedAt";
  if (!Array.isArray(device.data)) return "data";

  const keys = new Set<string>();
  for (const [index, property] of device.data.entries()) {
    const path = `data[${index}]`;
    if (!isPlainRecord(property)) return path;
    if (!nonEmptyText(property.key) || keys.has(property.key)) return `${path}.key`;
    keys.add(property.key);
    if (property.valueType !== "number" && property.valueType !== "boolean" && property.valueType !== "string") {
      return `${path}.valueType`;
    }
    const matchesType = (value: unknown) =>
      typeof value === property.valueType && (property.valueType !== "number" || Number.isFinite(value));
    if (property.value !== null && !matchesType(property.value)) return `${path}.value`;
    if (!nonEmptyText(property.desc)) return `${path}.desc`;
    if (property.unit !== undefined && (typeof property.unit !== "string" || property.valueType !== "number")) {
      return `${path}.unit`;
    }
    if (property.valueEnum !== undefined && !enumValues(property.valueEnum, matchesType)) return `${path}.valueEnum`;
    if (property.ext !== undefined && !isPlainRecord(property.ext)) return `${path}.ext`;
  }
  return null;
}

function enumValues(input: unknown, validateValue: (value: unknown) => boolean) {
  if (!Array.isArray(input)) return null;
  const values = new Set<unknown>();
  for (const entry of input) {
    if (!isPlainRecord(entry) || !nonEmptyText(entry.desc) || !validateValue(entry.value) || values.has(entry.value)) {
      return null;
    }
    values.add(entry.value);
  }
  return values;
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
