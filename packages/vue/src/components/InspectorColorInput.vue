<script setup lang="ts">
import { computed, ref, useAttrs, useId, watch, type CSSProperties } from "vue";
import { PopoverRoot, PopoverTrigger } from "reka-ui";
import Button from "./ui/Button.vue";
import Input from "./ui/Input.vue";
import PopoverContent from "./ui/PopoverContent.vue";
import { getPortalTheme } from "./ui/utils";
import type { InspectorI18n } from "./inspector-i18n";
defineOptions({ inheritAttrs: false });
const props = defineProps<{ value: string; disabled?: boolean; i18n: InspectorI18n; onCommit(value: string): boolean }>();
const emit = defineEmits<{ cancel: [] }>();
const attrs = useAttrs();
const id = useId();
const trigger = ref<{ $el: HTMLElement } | null>(null);
const theme = ref<CSSProperties>({});
const open = ref(false);
const draft = ref(props.value);
const error = ref(false);
const validDraft = computed(() => /^#[0-9a-f]{6}$/i.test(draft.value));
watch(() => props.value, () => changeOpen(false));
function changeOpen(next: boolean) {
  draft.value = props.value;
  error.value = false;
  if (next) theme.value = getPortalTheme(trigger.value?.$el ?? null);
  else emit("cancel");
  open.value = next;
}
function edit(event: Event) {
  draft.value = (event.target as HTMLInputElement).value;
  error.value = false;
}
function apply() {
  const next = draft.value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(next)) { error.value = true; return; }
  if (next === props.value.toLowerCase() || props.onCommit(next)) changeOpen(false);
}
</script>

<template>
  <PopoverRoot :open="open" @update:open="changeOpen">
    <PopoverTrigger as-child>
      <Button ref="trigger" v-bind="attrs" :disabled="disabled" class="ek-ui-color-trigger">
        <span aria-hidden="true" class="ek-ui-color-swatch" :style="{ backgroundColor: value }" /><span>{{ value }}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent :theme="theme" :aria-label="attrs['aria-label']">
      <div class="ek-ui-color-editor">
        <input type="color" :aria-label="i18n.t('reactWorkbench.inspector.form.colorPicker')" :value="validDraft ? draft : value" @input="edit" />
        <Input type="text" :aria-label="i18n.t('reactWorkbench.inspector.form.hex')" :value="draft" :aria-invalid="error || undefined" :aria-describedby="error ? id : undefined" @input="edit" />
        <span aria-hidden="true" class="ek-ui-color-swatch" :style="{ backgroundColor: validDraft ? draft : value }" />
        <p v-if="error" :id="id" class="ek-ui-color-error" role="alert">{{ i18n.t('reactWorkbench.inspector.form.invalidColor') }}</p>
        <div class="ek-ui-color-actions">
          <Button @click="changeOpen(false)">{{ i18n.t('reactWorkbench.inspector.form.cancel') }}</Button>
          <Button @click="apply">{{ i18n.t('reactWorkbench.inspector.form.apply') }}</Button>
        </div>
      </div>
    </PopoverContent>
  </PopoverRoot>
</template>
