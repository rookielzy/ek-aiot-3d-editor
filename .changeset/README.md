# Changesets

Add a changeset for every package-facing change that should appear in npm versioning or package changelogs.

Use `pnpm changeset` and list only the packages whose public behavior, runtime output, types, package metadata, or README changed. The root workspace and examples are private and are not release targets.

The first public release stays experimental `0.x`. Do not describe `1.0` stability, Le5le-style low-code behavior, cloud asset libraries, marketplace behavior, data binding, or hosted runtime publishing in package changelogs.

Docs-only changes do not need a changeset unless the docs are package READMEs or release notes that should ship with the npm package.
