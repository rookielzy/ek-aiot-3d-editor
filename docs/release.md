# npm Release Workflow

This repository publishes only three public npm packages:

- `@ek-aiot/3d-editor-core`
- `@ek-aiot/3d-editor-react`
- `@ek-aiot/3d-editor-vue`

The root workspace and all examples remain private. Published packages are experimental `0.x`; a release does not promise stable non-`0.x` APIs, Le5le-style low-code features, cloud asset libraries, marketplace behavior, data binding, or hosted runtime publishing.

## External Prerequisites

- npm account or organization controls the `@ek-aiot` scope.
- The three package names are available under that scope. Planning checks on 2026-05-30 returned 404 for all three names, but maintainers must repeat the check before first publish.
- GitHub repository permissions allow Actions to create release PRs, tags, and releases.
- npm trusted publishing is configured for each package with provider `GitHub Actions`, repository `rookielzy/ek-aiot-3d-editor`, workflow `.github/workflows/release.yml`, and branch `main`.
- If trusted publishing is unavailable, a minimum-scope npm publish token is stored only as the GitHub secret `NPM_TOKEN`.

## Contributor Flow

1. Make the package-facing change.
2. Run `pnpm changeset` when the change affects package runtime output, public types, package metadata, package READMEs, or npm-facing behavior.
3. Choose only the affected public packages. Do not list the private root workspace or examples.
4. Run `pnpm release:verify` before requesting review when release metadata, package output, or imports changed.

Docs-only changes do not need a changeset unless the package README or package changelog should include them.

## Release PR Flow

The release workflow runs on `main` through `.github/workflows/release.yml`.

When pending changesets exist, Changesets opens or updates a release PR that applies package versions, changelogs, and internal dependency range updates. Review this PR like normal code: confirm versions are still `0.x`, changelog language is scoped, and only the three publishable packages are touched.

When the release PR is merged and no changesets remain, the same workflow runs `pnpm release:publish`. That script runs `pnpm release:verify` before `changeset publish`, so a failed build, test, browser test, tarball inspection, or npm-style consumer import stops publishing.

## Verification

`pnpm release:verify` runs:

- package builds
- TypeScript type checks
- normal Vitest tests
- browser-specific Vitest tests
- npm tarball packing for the three public packages
- tarball file-list checks for required dist, README, license, and changelog content
- exclusion checks for sources, tests, fixtures, `.tsbuildinfo`, examples, and JavaScript source maps
- temporary consumer install/import checks from the packed tarballs
- private subpath import checks through package `exports`

The packed shell manifests must contain registry-consumable semver ranges for `@ek-aiot/3d-editor-core`; workspace protocol ranges must not leak into tarballs.

## Trusted Publishing

Trusted publishing is the preferred path. The release workflow grants `id-token: write`, and npm exchanges the workflow identity for short-lived publish credentials when npm-side trusted publisher settings match the repository and workflow exactly.

For public packages from a public GitHub repository, npm trusted publishing also generates provenance automatically. Keep package `repository.url` values aligned with the GitHub repository because npm validates them during trusted publishing. If the repository stays private, trusted publishing may still remove long-lived token handling, but npm provenance badges are not expected.

## Token Fallback

If trusted publishing cannot be used for the first release, add `NPM_TOKEN` as a GitHub secret and leave it out of the repository. The release workflow passes the secret only to the Changesets action, which writes temporary npm authentication for the publish step when the secret exists. Remove or rotate the token after trusted publishing is working.

Do not commit `.npmrc` files with tokens. Do not publish from pull request workflows.

## First Public Release Checklist

1. Confirm npm org/scope ownership for `@ek-aiot`.
2. Re-run `npm view @ek-aiot/3d-editor-core`, `npm view @ek-aiot/3d-editor-react`, and `npm view @ek-aiot/3d-editor-vue`; each should still be unavailable or controlled by the maintainer.
3. Make the GitHub repository public before expecting npm provenance attestations, or accept that a private repository will publish without provenance badges.
4. Configure trusted publishing for each package against `.github/workflows/release.yml` on `main`, or set the `NPM_TOKEN` fallback secret.
5. Run `pnpm install --frozen-lockfile`.
6. Run `pnpm release:verify`.
7. Merge package-facing changes with a changeset.
8. Review and merge the Changesets release PR.
9. Watch the release workflow publish only the three public packages.
10. Verify the npm package pages show expected versions, README content, dependency ranges, and provenance when trusted publishing is active.

## Recovery Notes

If publish fails before any package is published, fix the workflow or package metadata and rerun from the same release PR state.

If a package is partially published and another package fails, do not unpublish reflexively. Fix the failure, add a changeset if package contents must change, and publish the missing package/version through the release workflow when possible. Use npm deprecation only for a published version that should remain installable but clearly marked as superseded.
