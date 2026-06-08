<template>
  <div class="ek-workbench__default-status">
    <span>Selection {{ status.selectionLabel }}</span>
    <span>Undo {{ status.undoCount }}</span>
    <span>Redo {{ status.redoCount }}</span>
    <span>Runtime {{ status.runtimeReady ? "ready" : "missing" }}</span>
    <span>Project {{ project.statusLabel }}</span>
    <span v-if="workspace">
      Assets {{ workspace.totalCount }} · missing {{ workspace.missingPayloadCount + workspace.missingReferenceCount }} · blocked {{ workspace.readiness.blockingAssetIds.length }}
    </span>
    <span>{{ status.dirty ? "Dirty" : "Saved" }}</span>
    <span>Problems {{ status.problemCount }}</span>
    <span v-if="status.problemCount > 0">
      Authored {{ status.authoredProblemCount }} · Runtime {{ status.runtimeProblemCount }} · Project {{ status.projectProblemCount }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { WorkbenchContext } from "../composables/use-workbench";

const props = defineProps<{
  context: WorkbenchContext;
}>();

const status = computed(() => props.context.model.status);
const project = computed(() => props.context.model.project);
const workspace = computed(() => props.context.model.assets.workspace);
</script>
