import { createMessageDescriptor, type MessageDescriptor, type MessageDescriptorValues } from "./messages";

export type DisplayMessageNamespace =
  | "inspector"
  | "workbench"
  | "assetWorkspace"
  | "workbenchImport"
  | "problem";

export type DisplayMessageField =
  | "label"
  | "title"
  | "detail"
  | "summary"
  | "reason"
  | "message"
  | "actionLabel";

export interface DisplayMessageDescriptorInput {
  namespace: DisplayMessageNamespace;
  path: string;
  field: DisplayMessageField;
  fallback: string;
  values?: MessageDescriptorValues;
}

export function createDisplayMessageDescriptor(input: DisplayMessageDescriptorInput): MessageDescriptor {
  return createMessageDescriptor({
    key: `${input.namespace}.${normalizeDisplayMessagePath(input.path)}.${input.field}`,
    fallback: input.fallback,
    ...(input.values ? { values: input.values } : {})
  });
}

export function createFallbackDisplayMessageDescriptor(
  namespace: DisplayMessageNamespace,
  code: string,
  field: DisplayMessageField,
  fallback: string,
  values?: MessageDescriptorValues
): MessageDescriptor {
  return createDisplayMessageDescriptor({
    namespace,
    path: `fallback.${normalizeCodePath(code)}`,
    field,
    fallback,
    ...(values ? { values } : {})
  });
}

export function descriptorValues(values: MessageDescriptorValues): MessageDescriptorValues {
  return values;
}

function normalizeDisplayMessagePath(path: string): string {
  return path
    .split(".")
    .flatMap((segment) => segment.split(/[^A-Za-z0-9]+/))
    .filter(Boolean)
    .map(normalizeSegment)
    .join(".");
}

function normalizeCodePath(code: string): string {
  return code
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(normalizeSegment)
    .join(".");
}

function normalizeSegment(segment: string): string {
  const normalized = segment.charAt(0).toLowerCase() + segment.slice(1);
  return /^[a-z]/.test(normalized) ? normalized : `x${normalized}`;
}
