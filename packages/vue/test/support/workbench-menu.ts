import { DOMWrapper, type VueWrapper } from "@vue/test-utils";

export function menuTrigger(workbench: VueWrapper, label: string) {
  return workbench.get<HTMLButtonElement>(`button[aria-haspopup="menu"][aria-label="${label}"]`);
}

export function menuItem(label: string, role = "menuitem") {
  return new DOMWrapper(document.body).get<HTMLElement>(`[role="${role}"][aria-label="${label}"]`);
}

export async function runMenuCommand(workbench: VueWrapper, trigger: string, command: string) {
  await menuTrigger(workbench, trigger).trigger("click");
  await menuItem(command).trigger("click");
}
