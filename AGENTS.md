# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm workspace for an experimental 3D editor contract. Core editor state, commands, validation, and Three.js runtime projection live in `packages/core/src`. Framework adapters live in `packages/react/src` and `packages/vue/src`; their focused tests are under each package's `test` directory, with public API tests next to package entrypoints. Demo proof loops live in `examples/react-proof-loop`, `examples/vue-proof-loop`, and `examples/vanilla-proof-loop`. Planning and design notes are stored under `docs`.

## Build, Test, and Development Commands

- `pnpm install`: install workspace dependencies using the pinned pnpm version.
- `pnpm build`: build all packages in `packages/*`.
- `pnpm typecheck`: build core first, then type-check all packages.
- `pnpm test`: run Vitest jsdom tests, excluding browser-specific specs.
- `pnpm test:browser`: run specs named `*.browser.test.ts` or `*.browser.test.tsx`.
- `pnpm --filter @ek-aiot/react-proof-loop dev`: run the React example locally. Replace the filter with `@ek-aiot/vue-proof-loop` or `@ek-aiot/vanilla-proof-loop` for other demos.

## Coding Style & Naming Conventions

Use TypeScript with strict compiler settings from `tsconfig.base.json`. Keep code ESM-only and prefer explicit named exports from package entrypoints. Follow existing formatting: two-space indentation, double quotes, semicolons, and trailing commas only where already used by surrounding code. React components use `PascalCase.tsx`, Vue components use `PascalCase.vue`, hooks use `use-*.ts`, and tests use `*.test.ts`, `*.test.tsx`, or `*.integration.test.tsx`.

## Testing Guidelines

Vitest is the test runner. Place core tests near the source they verify, and adapter behavior tests in `packages/react/test` or `packages/vue/test`. Add integration coverage when a change affects the proof loop: import asset, select object, transform, undo/redo, serialize, and restore. Use `pnpm test` for normal changes and add `pnpm test:browser` when browser-specific viewport/runtime behavior is touched.

## Commit & Pull Request Guidelines

Git history uses Conventional Commit-style messages such as `feat(core): extend scene schema contract`, `fix(react): externalize jsx runtime in package build`, and `chore: initialize repository`. Keep commits scoped by package when possible. Pull requests should describe the behavior change, list test commands run, link relevant issues or docs, and include screenshots or short recordings for visible React/Vue inspector or viewport changes.

## Agent-Specific Instructions

Do not serialize runtime-only values such as Three.js objects, `File`, `Blob`, object URLs, loaded textures, PMREM outputs, or resolver results into durable snapshots. Keep durable editor state in the versioned scene snapshot and expose transient runtime failures as problems instead.
