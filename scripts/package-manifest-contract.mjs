export const FORBIDDEN_I18N_RUNTIME_PACKAGES = Object.freeze([
  "i18next",
  "react-i18next",
  "react-intl",
  "vue-i18n",
  "@intlify/vue-i18n",
  "intl-messageformat",
  "@formatjs/intl"
]);

export const FORBIDDEN_I18N_RUNTIME_PACKAGE_PREFIXES = Object.freeze([
  "@formatjs/",
  "@intlify/"
]);

export function collectDependencyNames(manifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {})
  ]);
}

export function findForbiddenI18nRuntimeDependencies(manifest) {
  const dependencyNames = collectDependencyNames(manifest);
  return Array.from(dependencyNames)
    .filter((packageName) =>
      FORBIDDEN_I18N_RUNTIME_PACKAGES.includes(packageName) ||
      FORBIDDEN_I18N_RUNTIME_PACKAGE_PREFIXES.some((prefix) => packageName.startsWith(prefix))
    )
    .sort();
}
