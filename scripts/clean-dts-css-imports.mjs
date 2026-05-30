import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const cssSideEffectImport = /^import\s+["'][^"']+\.css["'];\s*$/gm;

async function walk(dir) {
  const entries = await readdir(dir);
  const files = [];

  for (const entry of entries) {
    const path = resolve(dir, entry);
    const info = await stat(path);

    if (info.isDirectory()) {
      files.push(...await walk(path));
    } else if (path.endsWith(".d.ts")) {
      files.push(path);
    }
  }

  return files;
}

export async function cleanDtsCssImports(distDir) {
  for (const file of await walk(resolve(distDir))) {
    const source = await readFile(file, "utf8");
    const cleaned = source.replace(cssSideEffectImport, "");

    if (cleaned !== source) {
      await writeFile(file, cleaned);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const distDir = process.argv[2];

  if (!distDir) {
    console.error("Usage: node scripts/clean-dts-css-imports.mjs <dist-dir>");
    process.exit(1);
  }

  cleanDtsCssImports(distDir).catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
