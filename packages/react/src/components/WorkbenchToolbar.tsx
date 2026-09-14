import { useRef, useState, type ChangeEvent } from "react";
import type { WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import { WorkbenchIcon } from "./WorkbenchIcon";

export interface WorkbenchToolbarProps {
  context: ResolvedWorkbenchContext;
  showLocaleSwitcher?: boolean;
  localeSwitcherDisabled?: boolean;
}

type ProjectActionStatus = {
  tone: "neutral" | "success" | "warning" | "error";
  message?: {
    key: WorkbenchMessageKey;
    fallback: string;
    values?: WorkbenchMessageValues;
  };
  fallback?: string;
};

const ACCEPT_PROJECT_PACKAGE = ".ek3d,application/octet-stream";

export function WorkbenchToolbar({
  context,
  showLocaleSwitcher = true,
  localeSwitcherDisabled = false
}: WorkbenchToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [projectStatus, setProjectStatus] = useState<ProjectActionStatus>({
    tone: "neutral"
  });
  const t = context.i18n.t;
  const projectStatusLabel = projectStatus.message
    ? t(projectStatus.message)
    : projectStatus.fallback ?? t(context.model.project.statusLabelDescriptor ?? {
        key: "workbench.project.status.partial.label",
        fallback: context.model.project.statusLabel
      });

  async function onOpenProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    try {
      const packageBytes = new Uint8Array(await file.arrayBuffer());
      const result = context.importProject(packageBytes);
      if (result.ok) {
        setProjectStatus({
          tone: "success",
          message: {
            key: "reactWorkbench.toolbar.status.opened.message",
            fallback: "Opened {fileName}",
            values: { fileName: file.name }
          }
        });
      } else {
        setProjectStatus(errorProjectStatus(
          result.problems[0]?.message,
          "reactWorkbench.toolbar.status.openFailed.message",
          "Project open failed"
        ));
      }
    } catch (error) {
      setProjectStatus(errorProjectStatus(
        error instanceof Error ? error.message : undefined,
        "reactWorkbench.toolbar.status.openFailed.message",
        "Project open failed"
      ));
    }
  }

  async function exportProject(partial: boolean) {
    const result = context.exportProject({ partial });
    if (!result.packageBytes) {
      setProjectStatus(errorProjectStatus(
        result.problems[0]?.message,
        "reactWorkbench.toolbar.status.exportFailed.message",
        "Project export failed"
      ));
      return;
    }

    try {
      const packageBytes = await result.packageBytes;
      downloadPackage(packageBytes, `${context.model.project.sceneName || "scene"}.ek3d`);
      setProjectStatus({
        tone: result.ok ? "success" : "warning",
        message: result.ok
          ? {
              key: "reactWorkbench.toolbar.status.exported.message",
              fallback: "Exported project"
            }
          : {
              key: "reactWorkbench.toolbar.status.exportedPartial.message",
              fallback: "Exported partial project ({problemCount} problems)",
              values: { problemCount: result.problems.length }
            }
      });
    } catch (error) {
      setProjectStatus(errorProjectStatus(
        error instanceof Error ? error.message : undefined,
        "reactWorkbench.toolbar.status.exportFailed.message",
        "Project export failed"
      ));
    }
  }

  return (
    <div className="ek-workbench__default-toolbar" aria-label={t("reactWorkbench.toolbar.controls.label")}>
      <div className="ek-workbench__tool-group ek-workbench__tool-group--project" aria-label={t("reactWorkbench.toolbar.project.label")}>
        <button className="ek-workbench__command-button ek-workbench__command-button--primary" type="button" onClick={() => fileInputRef.current?.click()} title={t("reactWorkbench.toolbar.project.open.title")}>
          <WorkbenchIcon name="open" />
          <span>{t("reactWorkbench.toolbar.project.open.label")}</span>
        </button>
        <input
          ref={fileInputRef}
          className="ek-workbench__file-input"
          type="file"
          accept={ACCEPT_PROJECT_PACKAGE}
          onChange={onOpenProject}
        />
        <button className="ek-workbench__command-button" type="button" onClick={() => void exportProject(false)} title={t("reactWorkbench.toolbar.project.export.title")}>
          <WorkbenchIcon name="export" />
          <span>{t("reactWorkbench.toolbar.project.export.label")}</span>
        </button>
        <button className="ek-workbench__command-button" type="button" onClick={() => void exportProject(true)} title={t("reactWorkbench.toolbar.project.exportPartial.title")}>
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
      <span className="ek-workbench__toolbar-status" data-tone={projectStatus.tone}>
        <span className="ek-workbench__toolbar-status-label">{t("reactWorkbench.toolbar.status.label")}</span>
        {projectStatusLabel}
      </span>
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
  detail: string | undefined,
  key: WorkbenchMessageKey,
  fallback: string
): ProjectActionStatus {
  if (detail) {
    return {
      tone: "error",
      fallback: detail
    };
  }
  return {
    tone: "error",
    message: { key, fallback }
  };
}
