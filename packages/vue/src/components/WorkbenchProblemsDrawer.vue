<template>
  <section
    :id="id"
    class="ek-workbench__problems-drawer"
    :hidden="!open"
    :aria-label="t('reactWorkbench.problems.details')"
    @keydown.capture="onKeyDown"
  >
    <header>
      <h2>{{ t("reactWorkbench.problems.details") }}</h2>
      <button ref="closeButton" type="button" @click="emit('close')">
        {{ t("reactWorkbench.problems.close") }}
      </button>
    </header>
    <p v-if="context.model.problems.totalCount === 0">{{ t("reactWorkbench.problems.empty") }}</p>
    <ul class="ek-workbench__problem-list">
      <li
        v-for="problem in context.model.problems.items"
        :key="`${problem.id}:${problem.assetId ?? ''}:${problem.objectId ?? ''}`"
        :data-severity="problem.severity"
      >
        <strong>{{ problem.titleDescriptor ? t(problem.titleDescriptor) : problem.title }}</strong>
        <small>{{ renderSeverity(context.i18n, problem.severity) }} · {{ renderProblemSource(context.i18n, problem.source) }}</small>
        <span>{{ renderTarget(problem.target) }}</span>
        <span v-if="problem.detail || problem.detailDescriptor">
          {{ problem.detailDescriptor ? t(problem.detailDescriptor) : problem.detail }}
        </span>
        <label v-if="problem.assetId && problem.recoverability === 'user-action'" class="ek-workbench__file-action">
          <span>{{ problem.actionLabelDescriptor ? t(problem.actionLabelDescriptor) : problem.actionLabel ?? t("reactWorkbench.inspector.problems.replaceAsset.label") }}</span>
          <input type="file" :disabled="busy.includes(problem.assetId)" @change="recover(problem.assetId, $event)" />
        </label>
      </li>
    </ul>
    <div role="status">
      <p v-for="(message, assetId) in feedback" :key="assetId">
        {{ assetId }} · <span>{{ t(message) }}</span>
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import type { MessageDescriptor, ProblemTarget } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageInput } from "../i18n/workbench-i18n";
import { renderProblemSource, renderSeverity } from "./inspector-i18n";

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  id: string;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const closeButton = ref<HTMLButtonElement | null>(null);
const pending = new Set<string>();
const busy = ref<string[]>([]);
const feedback = ref<Record<string, MessageDescriptor>>({});
const t = (message: WorkbenchMessageInput) => props.context.i18n.t(message);

watch(() => props.open, async (open) => {
  if (open) {
    await nextTick();
    closeButton.value?.focus();
  }
});

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.stopPropagation();
    emit("close");
  }
}

function renderTarget(target: ProblemTarget): string {
  const kind = t({
    key: `reactWorkbench.problems.target.${target.kind}`,
    fallback: target.kind
  });
  const detail = Object.entries(target)
    .filter(([key]) => key !== "kind")
    .map(([, value]) => value)
    .join(" · ");
  return `${t("reactWorkbench.problems.target")} · ${kind}${detail ? ` · ${detail}` : ""}`;
}

async function recover(assetId: string, event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || pending.has(assetId)) {
    return;
  }

  pending.add(assetId);
  busy.value = [...pending];
  feedback.value = {
    ...feedback.value,
    [assetId]: { key: "reactWorkbench.leftPanel.assets.replace.progress", fallback: "Replacing..." }
  };
  try {
    const result = await props.context.replaceAsset({ assetId, source: file, label: file.name, mimeType: file.type });
    if (result.ok) {
      await props.context.runtime?.project();
    }
    props.context.refreshProblems();
    const problem = result.problems[0];
    feedback.value = {
      ...feedback.value,
      [assetId]: result.ok
        ? {
            key: "reactWorkbench.leftPanel.assets.replace.success",
            fallback: "Replaced with {fileName}",
            values: { fileName: file.name }
          }
        : problem?.display?.titleDescriptor ?? {
            key: "reactWorkbench.problems.recoveryFailed",
            fallback: "Recovery failed: {detail}",
            values: { detail: problem?.display?.title ?? problem?.message ?? "" }
          }
    };
  } catch (error) {
    feedback.value = {
      ...feedback.value,
      [assetId]: {
        key: "reactWorkbench.problems.recoveryFailed",
        fallback: "Recovery failed: {detail}",
        values: { detail: error instanceof Error ? error.message : String(error) }
      }
    };
  } finally {
    pending.delete(assetId);
    busy.value = [...pending];
  }
}
</script>
