import { createDisplayMessageDescriptor } from "../i18n/display-messages";

export function inspectorSectionTitleDescriptor(id: string, title: string) {
  return createDisplayMessageDescriptor({
    namespace: "inspector",
    path: `section.${id}`,
    field: "title",
    fallback: title,
    values: { sectionId: id }
  });
}

export function inspectorSectionReasonDescriptor(id: string, reason: string) {
  return createDisplayMessageDescriptor({
    namespace: "inspector",
    path: `section.${id}`,
    field: "reason",
    fallback: reason,
    values: { sectionId: id }
  });
}

export function inspectorActionLabelDescriptor(id: string, label: string) {
  return createDisplayMessageDescriptor({
    namespace: "inspector",
    path: `action.${id}`,
    field: "label",
    fallback: label,
    values: { actionId: id }
  });
}

export function inspectorCommandMessageDescriptor(path: string, fieldId: string, message: string) {
  return createDisplayMessageDescriptor({
    namespace: "inspector",
    path,
    field: "message",
    fallback: message,
    values: { fieldId }
  });
}
