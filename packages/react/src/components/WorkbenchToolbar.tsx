import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import type { MessageDescriptor, Problem } from "@ek-aiot/3d-editor-core";
import type { WorkbenchMessageKey } from "../i18n/workbench-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { WorkbenchIcon } from "./WorkbenchIcon";

export interface WorkbenchToolbarProps {
  context: ResolvedWorkbenchContext;
  onProjectProblems(problems: Problem[]): void;
  showLocaleSwitcher?: boolean;
  localeSwitcherDisabled?: boolean;
}

type ProjectActionStatus = {
  tone: "neutral" | "success" | "warning" | "error";
  message?: MessageDescriptor;
};

const ACCEPT_PROJECT_PACKAGE = ".ek3d,application/octet-stream";

export function WorkbenchToolbar({
  context,
  onProjectProblems,
  showLocaleSwitcher = true,
  localeSwitcherDisabled = false
}: WorkbenchToolbarProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [menuOpen]);
  function closeMenu() {
    setMenuOpen(false);
    triggerRef.current?.focus();
  }
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [projectStatus, setProjectStatus] = useState<ProjectActionStatus>({
    tone: "neutral"
  });
  const t = context.i18n.t;
  const nextLocale = context.i18n.locale === "en" ? "zh-CN" : "en";
  const projectStatusLabel = projectStatus.message
    ? t(projectStatus.message)
    : t(context.model.project.statusLabelDescriptor ?? {
        key: "workbench.project.status.partial.label",
        fallback: context.model.project.statusLabel
      });

  function reportFailure(error: unknown, operation: "open" | "export") {
    const message: MessageDescriptor = {
      key: operation === "open" ? "reactWorkbench.toolbar.status.openFailed.message" : "reactWorkbench.toolbar.status.exportFailed.message",
      fallback: operation === "open" ? "Project open failed" : "Project export failed"
    };
    setProjectStatus({ tone: "error", message });
    onProjectProblems([{
      id: `react:project-${operation}-failed`, code: `project-${operation}-failed`, severity: "error",
      source: "command", target: { kind: "scene", sceneId: context.snapshot.scene.id },
      message: error instanceof Error ? error.message : String(error), recoverability: "user-action",
      display: { title: message.fallback, titleDescriptor: message }
    }]);
  }

  async function onOpenProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setProjectStatus({ tone: "neutral", message: { key: "reactWorkbench.toolbar.status.opening", fallback: "Opening project..." } });
    closeMenu();
    try {
      const packageBytes = new Uint8Array(await file.arrayBuffer());
      const result = context.importProject(packageBytes);
      onProjectProblems(result.problems);
      if (result.ok) {
        setProjectStatus({
          tone: result.manifest?.completeness === "partial" || result.problems.length ? "warning" : "success",
          message: {
            key: result.manifest?.completeness === "partial" ? "reactWorkbench.toolbar.status.openedPartial" : result.problems.length ? "reactWorkbench.toolbar.status.openedWarnings" : "reactWorkbench.toolbar.status.opened.message",
            fallback: "Opened {fileName}",
            values: { fileName: file.name }
          }
        });
        // A restored configuration can need host credentials before preview works.
        if (result.outcome.kind === "reconnect") {
          setProjectStatus({
            tone: "warning",
            message: {
              key: "reactWorkbench.toolbar.status.openedReconnect.message",
              fallback: "Reconnect required to preview data ({credentialCount} credentials missing)",
              values: { credentialCount: result.outcome.missingCredentialCount, fileName: file.name }
            }
          });
        }
      } else if (result.outcome.kind === "config-error") {
        // Durable references are broken: report repairable damage rather than a bad file.
        setProjectStatus({
          tone: "error",
          message: {
            key: "reactWorkbench.toolbar.status.openConfigInvalid.message",
            fallback: "Project data configuration is damaged ({problemCount} broken references)",
            values: { problemCount: result.outcome.problems.length }
          }
        });
      } else {
        setProjectStatus(errorProjectStatus(
          result.problems[0]?.display?.titleDescriptor,
          "reactWorkbench.toolbar.status.openFailed.message",
          "Project open failed"
        ));
      }
    } catch (error) {
      reportFailure(error, "open");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function exportProject(partial: boolean) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setProjectStatus({ tone: "neutral", message: { key: "reactWorkbench.toolbar.status.exporting", fallback: "Exporting project..." } });
    closeMenu();
    try {
      const result = context.exportProject({ partial });
      onProjectProblems(result.problems);
      if (!result.packageBytes) {
        setProjectStatus(errorProjectStatus(result.problems[0]?.display?.titleDescriptor,
          "reactWorkbench.toolbar.status.exportFailed.message", "Project export failed"));
        return;
      }
      const packageBytes = await result.packageBytes;
      downloadPackage(packageBytes, `${context.model.project.sceneName || "scene"}.ek3d`);
      const incomplete = result.manifest?.completeness === "partial";
      setProjectStatus({
        tone: incomplete || result.problems.length ? "warning" : "success",
        message: {
          key: incomplete ? "reactWorkbench.toolbar.status.exportedPartial.message"
            : result.problems.length ? "reactWorkbench.toolbar.status.exportedWarnings" : "reactWorkbench.toolbar.status.exported.message",
          fallback: "Exported project",
          values: { problemCount: result.problems.length }
        }
      });
    } catch (error) {
      reportFailure(error, "export");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="ek-workbench__default-toolbar" onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
    }} onKeyDownCapture={(event) => {
      if (menuOpen && event.key === "Escape") { event.stopPropagation(); closeMenu(); }
    }} aria-label={t("reactWorkbench.toolbar.controls.label")}>
      <button ref={triggerRef} type="button" className="ek-workbench__command-button" aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen(!menuOpen)}>{t("reactWorkbench.toolbar.project.menu")}</button>
      <div ref={menuRef} id={menuId} className="ek-workbench__project-menu" role="region" hidden={!menuOpen} aria-label={t("reactWorkbench.toolbar.project.label")}>
        <div className="ek-workbench__tool-group ek-workbench__tool-group--project">
          <button className="ek-workbench__command-button ek-workbench__command-button--primary" type="button" disabled={busy} onClick={() => fileInputRef.current?.click()} title={t("reactWorkbench.toolbar.project.open.title")}>
            <WorkbenchIcon name="open" />
            <span>{t("reactWorkbench.toolbar.project.open.label")}</span>
          </button>
          <input
            ref={fileInputRef}
            className="ek-workbench__file-input"
            type="file"
            aria-label={t("reactWorkbench.toolbar.project.open.title")}
            disabled={busy}
            accept={ACCEPT_PROJECT_PACKAGE}
            onChange={onOpenProject}
          />
          <button className="ek-workbench__command-button" type="button" disabled={busy} onClick={() => void exportProject(false)} title={t("reactWorkbench.toolbar.project.export.title")}>
            <WorkbenchIcon name="export" />
            <span>{t("reactWorkbench.toolbar.project.export.label")}</span>
          </button>
          <button className="ek-workbench__command-button" type="button" disabled={busy} onClick={() => void exportProject(true)} title={t("reactWorkbench.toolbar.project.exportPartial.title")}>
            <WorkbenchIcon name="export-partial" />
            <span>{t("reactWorkbench.toolbar.project.exportPartial.label")}</span>
          </button>
        </div>
        {showLocaleSwitcher ? (
          <label className="ek-workbench__locale-switcher">
            <span>{t("reactWorkbench.toolbar.locale.switch.label")}</span>
            <select
              aria-label={t("reactWorkbench.toolbar.locale.switch.label")}
              title={t("reactWorkbench.toolbar.locale.switch.title")}
              value={context.i18n.locale}
              disabled={localeSwitcherDisabled}
              onChange={(event) => {
                if (localeSwitcherDisabled) {
                  return;
                }
                context.i18n.setLocale(event.target.value as typeof context.i18n.locale);
              }}
            >
              {context.i18n.supportedLocales.map((locale) => (
                <option key={locale} value={locale}>
                  {context.i18n.localeLabel(locale)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <span role="status" aria-live="polite" className="ek-workbench__toolbar-status" data-tone={projectStatus.tone}>
        <span className="ek-workbench__toolbar-status-label">{t("reactWorkbench.toolbar.status.label")}</span>
        {projectStatusLabel}
      </span>
      {showLocaleSwitcher ? (
        <button
          type="button"
          className="ek-workbench__command-button"
          lang={nextLocale}
          title={t("reactWorkbench.toolbar.locale.switch.title")}
          disabled={localeSwitcherDisabled}
          onClick={() => context.i18n.setLocale(nextLocale)}
        >
          {context.i18n.localeLabel(nextLocale)}
        </button>
      ) : null}
    </div>
  );
}

function downloadPackage(packageBytes: Uint8Array, filename: string): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof Blob === "undefined"
  ) {
    return;
  }

  const payload = new ArrayBuffer(packageBytes.byteLength);
  new Uint8Array(payload).set(packageBytes);
  const blob = new Blob([payload], { type: "application/octet-stream" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = sanitizeFilename(filename);
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  if (typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(objectUrl);
  }
}

function sanitizeFilename(value: string): string {
  const trimmed = value.trim().replace(/[/\\?%*:|"<>]/g, "-");
  return trimmed.endsWith(".ek3d") ? trimmed : `${trimmed || "scene"}.ek3d`;
}

function errorProjectStatus(
  detail: MessageDescriptor | undefined,
  key: WorkbenchMessageKey,
  fallback: string
): ProjectActionStatus {
  if (detail) {
    return {
      tone: "error",
      message: detail
    };
  }
  return {
    tone: "error",
    message: { key, fallback }
  };
}
