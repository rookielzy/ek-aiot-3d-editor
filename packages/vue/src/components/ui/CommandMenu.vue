<script setup lang="ts">
import { DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from "reka-ui";
import { ref, type CSSProperties } from "vue";
import WorkbenchIcon, { type WorkbenchIconName } from "../WorkbenchIcon.vue";
import { getPortalTheme } from "./utils";

export interface MenuCommand {
  key: string;
  label: string;
  title: string;
  icon: WorkbenchIconName;
  onClick(): void;
  pressed?: boolean;
  disabled?: boolean;
  reason?: string;
  shortcut?: string;
}

defineProps<{
  label: string;
  triggerLabel: string;
  icon: WorkbenchIconName;
  commands: MenuCommand[];
  compact?: boolean;
}>();

const open = ref(false);
const trigger = ref<HTMLButtonElement | null>(null);
const theme = ref<CSSProperties>({});
const boundary = ref<Element | null>(null);
let leavingByTab = false;

function changeOpen(value: boolean): void {
  if (value) {
    leavingByTab = false;
    boundary.value = trigger.value?.closest(".ek-workbench__viewport-shell") ?? null;
    theme.value = getPortalTheme(trigger.value);
    if (boundary.value && trigger.value) {
      const bounds = boundary.value.getBoundingClientRect();
      theme.value = {
        ...theme.value,
        "--ek-menu-width": `${bounds.width - 16}px`,
        "--ek-menu-height": `${bounds.bottom - trigger.value.getBoundingClientRect().bottom - 12}px`
      };
    }
  }
  open.value = value;
}

function select(command: MenuCommand, event: Event): void {
  if (command.pressed !== undefined) event.preventDefault();
  command.onClick();
}

function onMenuKeyDown(event: KeyboardEvent): void {
  if (event.isComposing || event.keyCode === 229) {
    event.stopPropagation();
    return;
  }
  if (!open.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    changeOpen(false);
    return;
  }
  if (event.key === "Tab") {
    // Resume native Tab order at the trigger because the menu lives in a portal.
    event.stopPropagation();
    leavingByTab = true;
    changeOpen(false);
    trigger.value?.focus();
  }
}
</script>

<template>
  <DropdownMenuRoot :open="open" :modal="false" @update:open="changeOpen">
    <DropdownMenuTrigger as-child>
      <button ref="trigger" type="button" class="ek-workbench__command-button"
        :class="{ 'ek-workbench__command-button--icon': compact }" :aria-label="triggerLabel" :title="label"
        @keydown.capture="onMenuKeyDown">
        <WorkbenchIcon :name="icon" />
        <span>{{ triggerLabel }}</span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="ek-vue-workbench-menu" :aria-label="label" :aria-labelledby="undefined"
        :side-offset="4" :collision-padding="8" :collision-boundary="boundary"
        :align="boundary ? 'end' : 'start'" :side-flip="!boundary"
        sticky="always" :loop="true" :style="theme"
        @keydown.capture="onMenuKeyDown" @close-auto-focus="leavingByTab && $event.preventDefault()">
        <DropdownMenuLabel class="ek-vue-workbench-menu__label">{{ label }}</DropdownMenuLabel>
        <component :is="command.pressed === undefined ? DropdownMenuItem : DropdownMenuCheckboxItem"
          v-for="command in commands" :key="command.key" :disabled="command.disabled"
          :model-value="command.pressed" :aria-label="command.label" :aria-keyshortcuts="command.shortcut"
          :aria-description="command.disabled ? command.reason : undefined" :text-value="command.label"
          :title="[command.title, command.disabled ? command.reason : undefined].filter(Boolean).join(' — ')"
          class="ek-vue-workbench-menu__item" @select="select(command, $event)">
          <WorkbenchIcon :name="command.icon" />
          <span>{{ command.label }}</span>
          <span v-if="command.shortcut" class="ek-vue-workbench-menu__shortcut" aria-hidden="true">{{ command.shortcut.split(' ')[0] }}</span>
          <span v-if="command.pressed !== undefined" class="ek-vue-workbench-menu__check" aria-hidden="true" />
          <span v-if="command.disabled && command.reason" class="ek-vue-workbench-menu__reason" aria-hidden="true">{{ command.reason }}</span>
        </component>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
