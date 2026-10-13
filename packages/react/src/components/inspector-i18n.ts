import type { InspectorCommandProblem, InspectorFieldDescriptor, InspectorFieldOption, InspectorSection, ProblemSeverity, ProblemSource } from "@ek-aiot/3d-editor-core";
import { createMessageDescriptor } from "@ek-aiot/3d-editor-core";
import {
  DEFAULT_WORKBENCH_LOCALE,
  WORKBENCH_LOCALES,
  getWorkbenchLocaleLabel,
  resolveWorkbenchMessage,
  type WorkbenchI18n,
  type WorkbenchMessageInput,
  type WorkbenchMessageKey,
  type WorkbenchMessageValues
} from "../i18n/workbench-i18n";

export type InspectorI18n = Pick<WorkbenchI18n, "locale" | "supportedLocales" | "localeLabel" | "setLocale" | "t">;

export function createInspectorDispatchProblem(fieldId: string, i18n: InspectorI18n, detail?: string): InspectorCommandProblem {
  const key = detail ? "reactWorkbench.inspector.form.commitFailedDetail" : "reactWorkbench.inspector.form.commitFailed";
  const values = detail ? { detail } : undefined;
  return {
    code: "inspector-dispatch-failed",
    fieldId,
    message: i18n.t(key, values),
    messageDescriptor: createMessageDescriptor({ key, fallback: detail ? "Could not apply edit: {detail}" : "Could not apply edit.", values }),
    severity: "warning"
  };
}

export const DEFAULT_INSPECTOR_I18N: InspectorI18n = {
  locale: DEFAULT_WORKBENCH_LOCALE,
  supportedLocales: WORKBENCH_LOCALES,
  localeLabel: getWorkbenchLocaleLabel,
  setLocale() {},
  t(message: WorkbenchMessageInput, values?: WorkbenchMessageValues) {
    return resolveWorkbenchMessage(DEFAULT_WORKBENCH_LOCALE, message, values);
  }
};

export function renderSectionTitle(i18n: InspectorI18n, section: Pick<InspectorSection, "title" | "titleDescriptor">): string {
  return section.titleDescriptor ? i18n.t(section.titleDescriptor) : section.title;
}

export function renderSectionReason(i18n: InspectorI18n, section: Pick<InspectorSection, "id" | "reason" | "reasonDescriptor">): string | undefined {
  const knownKey = section.reason ? knownSectionReasonKey(section.id, section.reason) : null;
  if (knownKey) {
    return i18n.t(knownKey);
  }
  if (section.reasonDescriptor) {
    return i18n.t(section.reasonDescriptor);
  }
  return section.reason;
}

export function renderFieldLabel(i18n: InspectorI18n, field: Pick<InspectorFieldDescriptor, "label" | "labelDescriptor">): string {
  return field.labelDescriptor ? i18n.t(field.labelDescriptor) : field.label;
}

export function renderOptionLabel(i18n: InspectorI18n, option: Pick<InspectorFieldOption, "label" | "labelDescriptor">): string {
  return option.labelDescriptor ? i18n.t(option.labelDescriptor) : option.label;
}

export function renderProblemMessage(i18n: InspectorI18n, problem: Pick<InspectorCommandProblem, "message" | "messageDescriptor">): string {
  const knownKey = knownProblemMessageKey(problem.message);
  if (knownKey) {
    return i18n.t(knownKey);
  }
  return problem.messageDescriptor ? i18n.t(problem.messageDescriptor) : problem.message;
}

export function renderSeverity(i18n: InspectorI18n, severity: ProblemSeverity): string {
  return i18n.t(`reactWorkbench.inspector.problems.severity.${severity}`);
}

export function renderProblemSource(i18n: InspectorI18n, source: ProblemSource): string {
  return i18n.t(`reactWorkbench.inspector.problems.source.${source === "asset-resolver" ? "assetResolver" : source}`);
}

function knownSectionReasonKey(sectionId: InspectorSection["id"], reason: string): WorkbenchMessageKey | null {
  if (sectionId === "transform") {
    if (reason === "Select a transformable node to edit transform.") {
      return "inspector.section.transform.reason.selectTransformableNode";
    }
    if (reason === "Selected node cannot be transformed.") {
      return "inspector.section.transform.reason.selectedNodeCannotTransform";
    }
  }
  if (sectionId === "material" && reason === "Select a GLB object to edit material overrides.") {
    return "inspector.section.material.reason.selectGlbObject";
  }
  if (sectionId === "lights") {
    if (reason === "Add a light to edit scene lighting.") {
      return "inspector.section.lights.reason.addLight";
    }
    if (reason === "Select a light node to edit scene lighting.") {
      return "inspector.section.lights.reason.selectLight";
    }
  }
  return null;
}

function knownProblemMessageKey(message: string): WorkbenchMessageInput | null {
  switch (message) {
    case "Add an HDR, texture, or image asset first.":
      return {
        key: "reactWorkbench.inspector.environment.presetUnavailableDetail.message",
        fallback: "Environment preset is unavailable: {detail}",
        values: { detail: message }
      };
    case "Register six texture or image assets named px, nx, py, ny, pz, and nz.":
      return {
        key: "reactWorkbench.inspector.environment.presetUnavailableDetail.message",
        fallback: "Environment preset is unavailable: {detail}",
        values: { detail: message }
      };
    case "Point light shadows render six map faces.":
      return {
        key: "reactWorkbench.inspector.lights.pointShadowCost.message",
        fallback: message
      };
    default:
      return null;
  }
}
