import type {
  DataParameterType,
  DataParameterValue,
  DataQueryParameterDraft,
  DataQueryParameterOverrides
} from "@ek-aiot/3d-editor-core";

export interface QueryParameterForm {
  id: string;
  name: string;
  type: DataParameterType;
  useDefault: boolean;
  defaultText: string;
  override: boolean;
  overrideText: string;
}

let nextParameterId = 0;

export function createQueryParameterForm(): QueryParameterForm {
  nextParameterId += 1;
  return {
    id: `data-parameter-${nextParameterId}`,
    name: "",
    type: "string",
    useDefault: true,
    defaultText: "",
    override: false,
    overrideText: ""
  };
}

export function toQueryParameterDrafts(
  parameters: readonly QueryParameterForm[]
): DataQueryParameterDraft[] {
  return parameters.map((parameter) => ({
    name: parameter.name.trim(),
    type: parameter.type,
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
