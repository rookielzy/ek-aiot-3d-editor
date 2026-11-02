import type {
  DataParameterLocationInput,
  DataParameterType,
  DataParameterValue,
  DataQueryParameterDraft,
  DataQueryParameterOverrides
} from "./types";

/**
 * Adapter-agnostic draft row for a query parameter definition.
 *
 * Editors keep one row per parameter while it is being authored. The row holds
 * raw text so partially typed values stay representable; conversion to durable
 * drafts happens only through the helpers below.
 */
export interface QueryParameterForm {
  id: string;
  name: string;
  type: DataParameterType;
  location: DataParameterLocationInput;
  useDefault: boolean;
  defaultText: string;
  override: boolean;
  overrideText: string;
}

export interface QueryHeaderForm {
  id: string;
  name: string;
  value: string;
}

let nextParameterId = 0;
let nextHeaderId = 0;

export function createQueryParameterForm(): QueryParameterForm {
  nextParameterId += 1;
  return {
    id: `data-parameter-${nextParameterId}`,
    name: "",
    type: "string",
    location: "auto",
    useDefault: true,
    defaultText: "",
    override: false,
    overrideText: ""
  };
}

export function createQueryHeaderForm(name = "", value = ""): QueryHeaderForm {
  nextHeaderId += 1;
  return { id: `data-query-header-${nextHeaderId}`, name, value };
}

export function toQueryParameterDrafts(
  parameters: readonly QueryParameterForm[]
): DataQueryParameterDraft[] {
  return parameters.map((parameter) => ({
    name: parameter.name.trim(),
    type: parameter.type,
    location: parameter.location,
    ...(parameter.useDefault
      ? { defaultValue: parseParameterText(parameter.type, parameter.defaultText) }
      : {})
  }));
}

export function collectQueryOverrides(
  parameters: readonly QueryParameterForm[]
): DataQueryParameterOverrides {
  const overrides: Record<string, DataParameterValue | undefined> = {};
  for (const parameter of parameters) {
    if (!parameter.override) {
      continue;
    }
    overrides[parameter.name.trim()] = parseParameterText(parameter.type, parameter.overrideText);
  }
  return overrides;
}

export function hasQueryOverrides(parameters: readonly QueryParameterForm[]): boolean {
  return parameters.some((parameter) => parameter.override);
}

export function parseParameterText(type: DataParameterType, text: string): DataParameterValue {
  if (type === "string") {
    return text;
  }
  if (type === "boolean") {
    return text === "true";
  }
  return text.trim() === "" ? Number.NaN : Number(text);
}
