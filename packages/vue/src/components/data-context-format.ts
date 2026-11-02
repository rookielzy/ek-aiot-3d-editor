import type { DataParameterValue } from "@ek-aiot/3d-editor-core";

export function formatDataParameters(
  parameters: Readonly<Record<string, DataParameterValue>> | undefined,
  emptyLabel: string
): string {
  const entries = Object.entries(parameters ?? {});
  return entries.length === 0
    ? emptyLabel
    : entries.map(([key, value]) => `${key}=${String(value)}`).join(" · ");
}
