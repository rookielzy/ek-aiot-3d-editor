import { isWorkbenchLocale, normalizeWorkbenchLocale, type WorkbenchLocale } from "./workbench-i18n";

const WORKBENCH_LOCALE_STORAGE_KEY = "ek-aiot.workbench.locale";

export function readWorkbenchLocale(defaultLocale?: WorkbenchLocale): WorkbenchLocale {
  try {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(WORKBENCH_LOCALE_STORAGE_KEY);
      if (isWorkbenchLocale(stored)) {
        return stored;
      }
    }
  } catch {
    // Browser storage can be unavailable; keep the in-memory language usable.
  }
  return normalizeWorkbenchLocale(defaultLocale);
}

export function writeWorkbenchLocale(locale: WorkbenchLocale): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WORKBENCH_LOCALE_STORAGE_KEY, locale);
    }
  } catch {
    // A storage failure must not prevent language changes.
  }
}
