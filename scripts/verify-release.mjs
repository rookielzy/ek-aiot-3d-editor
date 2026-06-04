import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packDir = resolve(rootDir, ".release-packages");

export const releasePackages = [
  {
    id: "core",
    name: "@ek-aiot/3d-editor-core",
    dir: "packages/core",
    requiredFiles: ["package.json", "README.md", "CHANGELOG.md", "dist/index.js", "dist/index.d.ts", "dist/public-api.d.ts"],
    forbiddenImport: "@ek-aiot/3d-editor-core/runtime/editor-runtime"
  },
  {
    id: "react",
    name: "@ek-aiot/3d-editor-react",
    dir: "packages/react",
    frameworkPeers: ["react", "react-dom"],
    requiredFiles: ["package.json", "README.md", "CHANGELOG.md", "dist/index.js", "dist/index.css", "dist/index.d.ts"],
    cssImport: "@ek-aiot/3d-editor-react/styles.css",
    forbiddenImport: "@ek-aiot/3d-editor-react/components/EditorWorkbench"
  },
  {
    id: "vue",
    name: "@ek-aiot/3d-editor-vue",
    dir: "packages/vue",
    frameworkPeers: ["vue"],
    requiredFiles: ["package.json", "README.md", "CHANGELOG.md", "dist/index.js", "dist/index.css", "dist/index.d.ts"],
    cssImport: "@ek-aiot/3d-editor-vue/styles.css",
    forbiddenImport: "@ek-aiot/3d-editor-vue/components/EditorWorkbench.vue"
  }
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseZeroMajorVersion(version) {
  const match = /^0\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);

  assert(match, `Expected an experimental 0.x semver version, received ${version}`);

  return {
    minor: Number(match[1]),
    patch: Number(match[2])
  };
}

function caretZeroRangeSatisfies(range, version) {
  const rangeMatch = /^\^0\.(\d+)\.(\d+)$/.exec(range);

  if (!rangeMatch) {
    return false;
  }

  const rangeMinor = Number(rangeMatch[1]);
  const rangePatch = Number(rangeMatch[2]);
  const versionParts = parseZeroMajorVersion(version);

  if (rangeMinor === 0) {
    return versionParts.minor === 0 && versionParts.patch === rangePatch;
  }

  return versionParts.minor === rangeMinor && versionParts.patch >= rangePatch;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, ...options.env }
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed${output ? `\n${output}` : ""}`);
  }

  return result.stdout ?? "";
}

function runExpectFailure(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...options.env }
  });

  if (result.status === 0) {
    throw new Error(`${command} ${args.join(" ")} unexpectedly succeeded`);
  }

  return [result.stdout, result.stderr].filter(Boolean).join("\n");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function readPackageManifest(spec) {
  return readJson(resolve(rootDir, spec.dir, "package.json"));
}

export async function readRootManifest() {
  return readJson(resolve(rootDir, "package.json"));
}

export function assertPackageManifest(spec, manifest, options = {}) {
  const packed = options.packed === true;
  const sourceCoreRange = options.coreVersion ? `workspace:^${options.coreVersion}` : /^workspace:\^0\.\d+\.\d+$/;

  assert(manifest.name === spec.name, `${spec.name} has an unexpected package name`);
  assert(manifest.version && /^0\./.test(manifest.version), `${spec.name} must stay in experimental 0.x`);
  assert(manifest.description?.length > 20, `${spec.name} needs a useful description`);
  assert(manifest.type === "module", `${spec.name} must publish ESM`);
  assert(manifest.main === "./dist/index.js", `${spec.name} main must point at dist/index.js`);
  assert(manifest.module === "./dist/index.js", `${spec.name} module must point at dist/index.js`);
  assert(manifest.types === "./dist/index.d.ts", `${spec.name} types must point at dist/index.d.ts`);
  const expectedExports = spec.cssImport ? [".", "./styles.css"] : ["."];
  assert(Object.keys(manifest.exports ?? {}).join(",") === expectedExports.join(","), `${spec.name} must only export ${expectedExports.join(" and ")}`);
  assert(manifest.exports["."].import === "./dist/index.js", `${spec.name} root import export is incorrect`);
  assert(manifest.exports["."].types === "./dist/index.d.ts", `${spec.name} root types export is incorrect`);
  if (spec.cssImport) {
    assert(manifest.style === "./dist/index.css", `${spec.name} style must point at dist/index.css`);
    assert(manifest.exports["./styles.css"] === "./dist/index.css", `${spec.name} CSS export must point at dist/index.css`);
    assert(Array.isArray(manifest.sideEffects) && manifest.sideEffects.includes("./dist/index.css"), `${spec.name} must mark emitted CSS as a side effect`);
    assert(!manifest.exports["./components/EditorWorkbench"], `${spec.name} must not expose private React component paths`);
    assert(!manifest.exports["./components/EditorWorkbench.vue"], `${spec.name} must not expose private Vue component paths`);
  }
  assert(Array.isArray(manifest.files), `${spec.name} must use a files allowlist`);
  for (const entry of ["dist", "README.md", "CHANGELOG.md"]) {
    assert(manifest.files.includes(entry), `${spec.name} files must include ${entry}`);
  }
  assert(manifest.license === "MIT", `${spec.name} must declare MIT license metadata`);
  assert(manifest.repository?.url === "git+https://github.com/rookielzy/ek-aiot-3d-editor.git", `${spec.name} repository URL must match GitHub remote`);
  assert(manifest.repository?.directory === spec.dir, `${spec.name} repository directory must match workspace path`);
  assert(manifest.bugs?.url === "https://github.com/rookielzy/ek-aiot-3d-editor/issues", `${spec.name} bugs URL must point at repo issues`);
  assert(manifest.publishConfig?.access === "public", `${spec.name} must publish as a public scoped package`);

  const dependencies = manifest.dependencies ?? {};
  const peerDependencies = manifest.peerDependencies ?? {};

  if (spec.id === "core") {
    assert(dependencies.fflate, "core must keep fflate as a runtime dependency");
    assert(dependencies.three, "core must keep three as a runtime dependency");
    assert(dependencies["@types/three"], "core must publish @types/three for public declaration files");
    for (const framework of ["react", "react-dom", "vue"]) {
      assert(!dependencies[framework], `core must not depend on ${framework}`);
      assert(!peerDependencies[framework], `core must not peer-depend on ${framework}`);
    }
    return;
  }

  const coreRange = dependencies["@ek-aiot/3d-editor-core"];
  assert(coreRange, `${spec.name} must depend on core`);
  if (packed) {
    assert(!coreRange.startsWith("workspace:"), `${spec.name} packed core dependency must not use workspace protocol`);
    assert(typeof options.coreVersion === "string", `${spec.name} packed manifest check requires the packed core version`);
    assert(caretZeroRangeSatisfies(coreRange, options.coreVersion), `${spec.name} packed core dependency ${coreRange} must satisfy core ${options.coreVersion}`);
  } else if (typeof sourceCoreRange === "string") {
    assert(coreRange === sourceCoreRange, `${spec.name} source core dependency must align with ${sourceCoreRange}`);
  } else {
    assert(sourceCoreRange.test(coreRange), `${spec.name} source core dependency must use a workspace semver range`);
  }

  for (const peer of spec.frameworkPeers ?? []) {
    assert(peerDependencies[peer], `${spec.name} must keep ${peer} as a peer dependency`);
    assert(!dependencies[peer], `${spec.name} must not bundle ${peer} as a runtime dependency`);
  }
}

export async function assertRootManifest() {
  const rootManifest = await readRootManifest();

  assert(rootManifest.private === true, "root workspace must remain private");
  assert(rootManifest.scripts["release:verify"], "root must expose release:verify");
  assert(rootManifest.scripts["release:version"] === "changeset version", "root must expose release:version");
  assert(rootManifest.scripts["release:publish"]?.includes("changeset publish"), "root must publish through Changesets");
  assert(rootManifest.devDependencies["@changesets/cli"], "root must depend on @changesets/cli");
}

export async function assertChangesetsConfig() {
  const config = await readJson(resolve(rootDir, ".changeset/config.json"));

  assert(config.access === "public", "Changesets must publish scoped packages publicly");
  assert(config.baseBranch === "main", "Changesets baseBranch must match the default branch");
  assert(Array.isArray(config.fixed) && config.fixed.length === 0, "Changesets fixed groups must stay empty");
  assert(Array.isArray(config.linked) && config.linked.length === 0, "Changesets linked groups must stay empty");
  assert(config.updateInternalDependencies === "patch", "Changesets must update internal dependencies on patch releases");
  assert(config.privatePackages?.version === false, "Changesets must not version the private root workspace");
  assert(config.privatePackages?.tag === false, "Changesets must not tag the private root workspace");
}

export async function assertWorkflowConfig() {
  const ci = await readFile(resolve(rootDir, ".github/workflows/ci.yml"), "utf8");
  const release = await readFile(resolve(rootDir, ".github/workflows/release.yml"), "utf8");

  assert(ci.includes("pnpm release:verify"), "CI must run release verification without publishing");
  assert(!ci.includes("changeset publish"), "CI must not publish packages");
  assert(release.includes("id-token: write"), "release workflow must allow OIDC trusted publishing");
  assert(release.includes("changesets/action@v1"), "release workflow must use the Changesets GitHub Action");
  assert(release.includes("publish: pnpm release:publish"), "release workflow must publish through the root release script");
  assert(release.includes("NPM_TOKEN"), "release workflow must document the token fallback path");
}

function parsePackJson(stdout) {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf("{");
  assert(start >= 0, "pnpm pack did not return JSON");
  return JSON.parse(trimmed.slice(start));
}

function packedPath(path) {
  return path.replace(/^package\//, "");
}

function assertTarballFiles(spec, files) {
  const fileSet = new Set(files.map(packedPath));

  for (const requiredFile of spec.requiredFiles) {
    assert(fileSet.has(requiredFile), `${spec.name} tarball is missing ${requiredFile}`);
  }

  for (const file of fileSet) {
    assert(!file.startsWith("src/"), `${spec.name} tarball must not include source file ${file}`);
    assert(!file.includes("/test/") && !file.includes(".test."), `${spec.name} tarball must not include test file ${file}`);
    assert(!file.includes("fixtures/"), `${spec.name} tarball must not include fixture file ${file}`);
    assert(!file.endsWith(".tsbuildinfo"), `${spec.name} tarball must not include ${file}`);
    assert(!file.endsWith(".js.map"), `${spec.name} tarball must not include JavaScript source map ${file}`);
  }
}

async function packAndInspect(spec) {
  const stdout = run("pnpm", ["--dir", spec.dir, "pack", "--pack-destination", packDir, "--json"], { capture: true });
  const packResult = parsePackJson(stdout);
  const tarball = packResult.filename;
  const files = packResult.files.map((entry) => entry.path);

  assertTarballFiles(spec, files);

  const extractDir = await mkdtemp(join(tmpdir(), `ek-aiot-${spec.id}-`));
  let packedManifest;
  try {
    run("tar", ["-xzf", tarball, "-C", extractDir]);
    packedManifest = await readJson(join(extractDir, "package/package.json"));
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }

  return { manifest: packedManifest, tarball };
}

async function verifyPackageManifests() {
  await assertRootManifest();
  await assertChangesetsConfig();
  await assertWorkflowConfig();

  const coreManifest = await readPackageManifest(releasePackages.find((spec) => spec.id === "core"));
  for (const spec of releasePackages) {
    const manifest = await readPackageManifest(spec);
    assertPackageManifest(spec, manifest, { coreVersion: coreManifest.version });
  }
}

async function verifyConsumerInstall(tarballsByPackage) {
  const tempDir = await mkdtemp(join(tmpdir(), "ek-aiot-release-consumer-"));
  const rootManifest = await readRootManifest();
  const reactManifest = await readPackageManifest(releasePackages.find((spec) => spec.id === "react"));
  const vueManifest = await readPackageManifest(releasePackages.find((spec) => spec.id === "vue"));
  const coreManifest = await readPackageManifest(releasePackages.find((spec) => spec.id === "core"));

  try {
    const consumerManifest = {
      private: true,
      type: "module",
      packageManager: rootManifest.packageManager,
      dependencies: {
        "@ek-aiot/3d-editor-core": `file:${tarballsByPackage.get("@ek-aiot/3d-editor-core")}`,
        "@ek-aiot/3d-editor-react": `file:${tarballsByPackage.get("@ek-aiot/3d-editor-react")}`,
        "@ek-aiot/3d-editor-vue": `file:${tarballsByPackage.get("@ek-aiot/3d-editor-vue")}`,
        fflate: coreManifest.dependencies.fflate,
        react: reactManifest.devDependencies.react,
        "react-dom": reactManifest.devDependencies["react-dom"],
        three: coreManifest.dependencies.three,
        vue: vueManifest.devDependencies.vue
      },
      devDependencies: {
        "@vitejs/plugin-react": rootManifest.devDependencies["@vitejs/plugin-react"],
        "@vitejs/plugin-vue": rootManifest.devDependencies["@vitejs/plugin-vue"],
        "@types/react": rootManifest.devDependencies["@types/react"],
        "@types/react-dom": rootManifest.devDependencies["@types/react-dom"],
        typescript: rootManifest.devDependencies.typescript,
        vite: rootManifest.devDependencies.vite
      },
      pnpm: {
        overrides: {
          "@ek-aiot/3d-editor-core": `file:${tarballsByPackage.get("@ek-aiot/3d-editor-core")}`
        }
      }
    };

    await writeFile(join(tempDir, "package.json"), `${JSON.stringify(consumerManifest, null, 2)}\n`);
    await writeFile(join(tempDir, "runtime-check.mjs"), runtimeCheckSource());
    await writeFile(join(tempDir, "type-check.ts"), typeCheckSource());
    await writeFile(join(tempDir, "private-subpath-check.ts"), privateSubpathCheckSource());
    await writeFile(join(tempDir, "tsconfig.json"), `${JSON.stringify(consumerTsconfig(), null, 2)}\n`);
    await writeFile(join(tempDir, "tsconfig.private.json"), `${JSON.stringify(privateConsumerTsconfig(), null, 2)}\n`);
    await writeViteConsumerFixtures(tempDir);

    run("pnpm", ["install", "--no-frozen-lockfile"], { cwd: tempDir });
    run("node", ["runtime-check.mjs"], { cwd: tempDir });
    run("pnpm", ["exec", "tsc", "-p", "tsconfig.json", "--noEmit"], { cwd: tempDir });
    const privateImportOutput = runExpectFailure("pnpm", ["exec", "tsc", "-p", "tsconfig.private.json", "--noEmit"], { cwd: tempDir });
    for (const specifier of releasePackages.map((spec) => spec.forbiddenImport).filter(Boolean)) {
      assert(privateImportOutput.includes(specifier), `private subpath type check did not mention ${specifier}`);
    }
    const viteBin = join(tempDir, "node_modules/vite/bin/vite.js");
    run("node", [viteBin, "build", "--config", "vite.config.ts"], { cwd: join(tempDir, "react-vite") });
    run("node", [viteBin, "build", "--config", "vite.config.ts"], { cwd: join(tempDir, "vue-vite") });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function runtimeCheckSource() {
  return `const core = await import("@ek-aiot/3d-editor-core");
const react = await import("@ek-aiot/3d-editor-react");
const vue = await import("@ek-aiot/3d-editor-vue");

if (typeof core.createEditor !== "function") throw new Error("core root import failed");
if (typeof react.EditorWorkbench !== "function") throw new Error("react root import failed");
if (!vue.EditorWorkbench) throw new Error("vue root import failed");

const editor = core.createEditor();
if (!core.validateSceneSnapshot(editor.getSnapshot()).ok) throw new Error("core runtime smoke check failed");
editor.dispose();

for (const specifier of ${JSON.stringify(releasePackages.map((spec) => spec.forbiddenImport), null, 2)}) {
  let failed = false;
  try {
    await import(specifier);
  } catch {
    failed = true;
  }
  if (!failed) throw new Error(\`private import unexpectedly resolved: \${specifier}\`);
}
`;
}

function typeCheckSource() {
  return `import { createEditor, type SceneSnapshot } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench as ReactEditorWorkbench, type EditorWorkbenchProps } from "@ek-aiot/3d-editor-react";
import { EditorWorkbench as VueEditorWorkbench } from "@ek-aiot/3d-editor-vue";

const editor = createEditor();
const snapshot: SceneSnapshot = editor.getSnapshot();
const reactWorkbench: typeof ReactEditorWorkbench = ReactEditorWorkbench;
const vueWorkbench: typeof VueEditorWorkbench = VueEditorWorkbench;
const props: EditorWorkbenchProps = { editor };

void snapshot;
void reactWorkbench;
void vueWorkbench;
void props;

editor.dispose();
`;
}

function privateSubpathCheckSource() {
  return `import "@ek-aiot/3d-editor-core/runtime/editor-runtime";
import "@ek-aiot/3d-editor-react/components/EditorWorkbench";
import "@ek-aiot/3d-editor-vue/components/EditorWorkbench.vue";
`;
}

function consumerTsconfig() {
  return {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      strict: true,
      skipLibCheck: false,
      noEmit: true
    },
    include: ["type-check.ts"]
  };
}

function privateConsumerTsconfig() {
  return {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      strict: true,
      skipLibCheck: false,
      noEmit: true
    },
    include: ["private-subpath-check.ts"]
  };
}

async function writeViteConsumerFixtures(tempDir) {
  const reactDir = join(tempDir, "react-vite");
  const vueDir = join(tempDir, "vue-vite");

  await mkdir(join(reactDir, "src"), { recursive: true });
  await mkdir(join(vueDir, "src"), { recursive: true });

  await writeFile(join(reactDir, "index.html"), `<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n`);
  await writeFile(join(reactDir, "src/main.tsx"), `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EditorWorkbench } from "@ek-aiot/3d-editor-react";
import "@ek-aiot/3d-editor-react/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing root");

createRoot(root).render(
  <StrictMode>
    <EditorWorkbench />
  </StrictMode>
);
`);
  await writeFile(join(reactDir, "vite.config.ts"), `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
`);

  await writeFile(join(vueDir, "index.html"), `<div id="app"></div><script type="module" src="/src/main.ts"></script>\n`);
  await writeFile(join(vueDir, "src/main.ts"), `import { createApp, h } from "vue";
import { EditorWorkbench } from "@ek-aiot/3d-editor-vue";
import "@ek-aiot/3d-editor-vue/styles.css";

createApp({
  render: () => h(EditorWorkbench)
}).mount("#app");
`);
  await writeFile(join(vueDir, "vite.config.ts"), `import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
`);
}

export async function verifyRelease() {
  await verifyPackageManifests();
  await rm(packDir, { recursive: true, force: true });
  await mkdir(packDir, { recursive: true });

  const tarballsByPackage = new Map();
  let packedCoreVersion;
  try {
    for (const spec of releasePackages) {
      const { manifest, tarball } = await packAndInspect(spec);
      if (spec.id === "core") {
        packedCoreVersion = manifest.version;
      }
      assertPackageManifest(spec, manifest, { packed: true, coreVersion: packedCoreVersion });
      tarballsByPackage.set(spec.name, tarball);
    }

    await verifyConsumerInstall(tarballsByPackage);
  } finally {
    await rm(packDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyRelease()
    .then(() => {
      console.log(`Verified ${releasePackages.length} release packages.`);
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
}
