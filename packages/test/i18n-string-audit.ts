import { readFileSync } from "node:fs";

export interface StringAuditFinding {
  path: string;
  value: string;
}

const USER_FACING_ATTRIBUTES = [
  "aria-label",
  "placeholder",
  "title",
  "alt",
] as const;

const TECHNICAL_LITERAL_PATTERNS = [
  /^[a-z][a-z0-9-]*$/,
  /^ek-[A-Za-z0-9_-]+$/,
  /^data-[A-Za-z0-9_-]+$/,
  /^#[0-9a-fA-F]{3,8}$/,
  /^-?\d+(?:\.\d+)?$/,
  /^[A-Z0-9_]+$/,
  /^[a-z]+\/[a-z0-9.+-]+$/,
  /^[A-Za-z]+$/,
];

export function auditReactComponentStrings(paths: readonly string[]): StringAuditFinding[] {
  return paths.flatMap((path) => auditSource(path, readFileSync(path, "utf8"), "react"));
}

export function auditVueComponentStrings(paths: readonly string[]): StringAuditFinding[] {
  return paths.flatMap((path) => auditSource(path, readFileSync(path, "utf8"), "vue"));
}

function auditSource(path: string, source: string, framework: "react" | "vue"): StringAuditFinding[] {
  const template = framework === "vue" ? source.split(/<script\b/i)[0] ?? source : source;
  const findings: StringAuditFinding[] = [];
  const textPattern = />\s*([A-Za-z][^<>{}\n]*[A-Za-z])\s*</g;
  const expressionTextPattern = />\s*\{["']([^"']*[A-Za-z][^"']*)["']\}\s*</g;
  const attributePattern = new RegExp(`(?<![:\\w-])(?:${USER_FACING_ATTRIBUTES.join("|")})=["']([^"'{}]+[A-Za-z][^"'{}]*)["']`, "g");
  const expressionAttributePattern = new RegExp(`(?<![\\w-])(?::)?(?:${USER_FACING_ATTRIBUTES.join("|")})=\\{?["']([^"'{}]+[A-Za-z][^"'{}]*)["']\\}?`, "g");
  const vueBoundStaticAttributePattern = new RegExp(`(?<![\\w-]):(?:${USER_FACING_ATTRIBUTES.join("|")})=["']["']([^"'{}]+[A-Za-z][^"'{}]*)["']["']`, "g");

  for (const match of template.matchAll(textPattern)) {
    const value = normalizeText(match[1] ?? "");
    if (isUserFacingHardcodedEnglish(value)) {
      findings.push({ path, value });
    }
  }

  for (const match of template.matchAll(expressionTextPattern)) {
    const value = normalizeText(match[1] ?? "");
    if (isUserFacingHardcodedEnglish(value)) {
      findings.push({ path, value });
    }
  }

  for (const match of template.matchAll(attributePattern)) {
    const value = normalizeText(match[1] ?? "");
    if (isUserFacingHardcodedEnglish(value)) {
      findings.push({ path, value });
    }
  }

  for (const match of template.matchAll(expressionAttributePattern)) {
    const value = normalizeText(match[1] ?? "");
    if (isUserFacingHardcodedEnglish(value)) {
      findings.push({ path, value });
    }
  }

  if (framework === "vue") {
    for (const match of template.matchAll(vueBoundStaticAttributePattern)) {
      const value = normalizeText(match[1] ?? "");
      if (isUserFacingHardcodedEnglish(value)) {
        findings.push({ path, value });
      }
    }
  }

  return findings;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isUserFacingHardcodedEnglish(value: string): boolean {
  if (!/[A-Za-z]/.test(value)) {
    return false;
  }
  if (value.includes("reactWorkbench.") || value.includes("workbench.") || value.includes("inspector.") || value.includes("problem.")) {
    return false;
  }
  if (/[()?:]/.test(value)) {
    return false;
  }
  if (TECHNICAL_LITERAL_PATTERNS.some((pattern) => pattern.test(value))) {
    return false;
  }
  return /\s/.test(value) || /[.!?:]/.test(value);
}
