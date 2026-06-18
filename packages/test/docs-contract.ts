import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface RequiredContent {
  label: string;
  pattern: string | RegExp;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PARAGRAPH_FRAGMENT = String.raw`[^\n]*(?:\n(?!\n)[^\n]*)*`;

export const DURABLE_I18N_STATE_PATTERN = new RegExp(
  String.raw`(?=${PARAGRAPH_FRAGMENT}SceneSnapshot)` +
    String.raw`(?=${PARAGRAPH_FRAGMENT}\.ek3d)` +
    String.raw`(?=${PARAGRAPH_FRAGMENT}command history)` +
    String.raw`(?=${PARAGRAPH_FRAGMENT}asset records)` +
    String.raw`(?=${PARAGRAPH_FRAGMENT}runtime metadata)` +
    PARAGRAPH_FRAGMENT
);
export const CHINESE_DURABLE_I18N_STATE_PATTERN = /不要写入 `SceneSnapshot`、`.ek3d`、command history、asset records 或 runtime metadata/;

export function privateImportsForPackage(packageName: "@ek-aiot/3d-editor-react" | "@ek-aiot/3d-editor-vue"): string[] {
  return [packageName];
}

export function publicPackageImports(packageName: string): RequiredContent[] {
  return [
    { label: "public package root import", pattern: `from "${packageName}"` },
    { label: "public styles subpath", pattern: `import "${packageName}/styles.css"` },
  ];
}

export function readRepoText(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

export function findMissingContent(source: string, required: readonly RequiredContent[]): string[] {
  return required
    .filter((item) => !matches(source, item.pattern))
    .map((item) => item.label);
}

export function findForbiddenDeepImportLines(source: string, specifiers: readonly string[]): string[] {
  const lines = source.split(/\r?\n/);
  const findings: string[] = [];

  lines.forEach((line, index) => {
    for (const specifier of specifiers) {
      if (!containsForbiddenPackageImport(line, specifier)) {
        continue;
      }
      const context = lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2)).join(" ").toLowerCase();
      const explicitProhibition = /\b(do not|don't|forbidden|blocked|remain private|must not)\b/.test(context) &&
        /\b(deep imports?|private imports?|private subpaths?|subpaths?|import)\b/.test(context);
      if (explicitProhibition) {
        continue;
      }
      findings.push(`${index + 1}: ${line.trim()}`);
    }
  });

  return findings;
}

function matches(source: string, pattern: string | RegExp): boolean {
  return typeof pattern === "string" ? source.includes(pattern) : pattern.test(source);
}

function containsForbiddenPackageImport(line: string, packageName: string): boolean {
  let start = line.indexOf(packageName);
  while (start >= 0) {
    const next = line[start + packageName.length];
    if (next === "/" || next === "\"" || next === "'" || next === "`" || next === undefined) {
      const specifier = readPackageSpecifier(line.slice(start));
      if (specifier !== packageName && specifier !== `${packageName}/styles.css`) {
        return true;
      }
    }
    start = line.indexOf(packageName, start + packageName.length);
  }
  return false;
}

function readPackageSpecifier(value: string): string {
  const match = /^[^\s"'`),;]+/.exec(value);
  return match?.[0] ?? value;
}
