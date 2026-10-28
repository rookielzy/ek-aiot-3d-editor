import type {
  DataBindingColor,
  DataColorOperator,
  DataColorRule,
  DataMappedValueType,
  DataParameterValue
} from "./types";

export interface DataColorMatch {
  color: string;
  ruleIndex: number;
}

export function evaluateDataColorRules(
  color: Pick<DataBindingColor, "rules">,
  value: DataParameterValue | null | undefined
): DataColorMatch | null {
  if (value === null || value === undefined) {
    return null;
  }
  for (const [ruleIndex, rule] of color.rules.entries()) {
    if (matchesDataColorRule(rule, value)) {
      return { color: rule.color, ruleIndex };
    }
  }
  return null;
}

export function matchesDataColorRule(rule: DataColorRule, value: DataParameterValue): boolean {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return false;
  }
  switch (rule.operator) {
    case "eq":
      return typeof value === typeof rule.value && value === rule.value;
    case "ne":
      return typeof value === typeof rule.value && value !== rule.value;
    case "between":
      return typeof value === "number" &&
        typeof rule.value === "number" &&
        typeof rule.max === "number" &&
        value >= rule.value &&
        value <= rule.max;
    default: {
      if (typeof value !== "number" || typeof rule.value !== "number") {
        return false;
      }
      switch (rule.operator) {
        case "gt":
          return value > rule.value;
        case "gte":
          return value >= rule.value;
        case "lt":
          return value < rule.value;
        case "lte":
          return value <= rule.value;
        default:
          return false;
      }
    }
  }
}

export function dataColorOperatorsForType(type: DataMappedValueType): readonly DataColorOperator[] {
  return type === "number"
    ? ["gte", "gt", "lte", "lt", "between"]
    : ["eq", "ne"];
}

export function isDataColorOperatorAllowed(operator: DataColorOperator, type: DataMappedValueType): boolean {
  return dataColorOperatorsForType(type).includes(operator);
}

const COLOR_HEX = /^#[0-9a-fA-F]{6}$/;

export function normalizeDataColorHex(value: unknown): string | null {
  return typeof value === "string" && COLOR_HEX.test(value) ? value.toLowerCase() : null;
}
