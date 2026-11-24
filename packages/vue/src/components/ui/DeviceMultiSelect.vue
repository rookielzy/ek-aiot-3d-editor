<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import {
  ComboboxAnchor, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxItemIndicator,
  ComboboxPortal, ComboboxRoot, ComboboxViewport, ComboboxVirtualizer
} from "reka-ui";
import type { DataDeviceListItem } from "@ek-aiot/3d-editor-core";
import Input from "./Input.vue";
import { getPortalTheme } from "./utils";

const props = defineProps<{
  items: readonly DataDeviceListItem[];
  label: string;
  empty: string;
}>();
const selected = defineModel<DataDeviceListItem[]>({ required: true });
const search = ref("");
const anchor = ref<{ $el: HTMLElement } | null>(null);
const theme = ref<CSSProperties>();
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return props.items.filter((item) => !query ||
    item.deviceName.toLocaleLowerCase().includes(query) || item.deviceId.toLocaleLowerCase().includes(query));
});

function updateOpen(open: boolean): void {
  if (open) theme.value = getPortalTheme(anchor.value?.$el ?? null);
}
</script>

<template>
  <ComboboxRoot v-model="selected" by="deviceId" multiple open-on-click ignore-filter @update:open="updateOpen">
    <ComboboxAnchor ref="anchor">
      <ComboboxInput v-model="search" :aria-label="label" :placeholder="label" as-child>
        <Input />
      </ComboboxInput>
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent position="popper" align="start" :side-offset="4" :collision-padding="8"
        class="ek-ui-scope ek-ui-popup ek-device-select-popup" :style="theme">
        <ComboboxEmpty v-if="filtered.length === 0" class="ek-device-select-empty">{{ empty }}</ComboboxEmpty>
        <ComboboxViewport class="ek-device-select-scroll">
          <ComboboxVirtualizer v-slot="{ option }" :options="filtered" :estimate-size="34" :overscan="6"
            :text-content="(item) => item.deviceName">
            <ComboboxItem :value="option" class="ek-device-select-option">
              <span aria-hidden="true"><ComboboxItemIndicator>✓</ComboboxItemIndicator></span>
              <span class="ek-device-select-name">{{ option.deviceName }}</span>
              <small class="ek-device-select-id">{{ option.deviceId }}</small>
            </ComboboxItem>
          </ComboboxVirtualizer>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
