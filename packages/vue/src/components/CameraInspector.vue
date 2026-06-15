<template>
  <section class="ek-inspector-section">
    <header class="ek-inspector-section__header">
      <h2>Camera views</h2>
      <button type="button" class="ek-inspector-compact-action" :disabled="!section.canCapture" @click="captureNewView">
        Capture
      </button>
    </header>
    <div v-if="section.cameraViews.length" class="ek-inspector-camera-list" role="list">
      <button
        v-for="view in section.cameraViews"
        :key="view.id"
        type="button"
        :class="{ 'is-active': view.active }"
        :data-default="view.default ? 'true' : 'false'"
        @click="emit('update:activeCameraViewId', view.id)"
      >
        <span>{{ view.label }}</span>
        <small>{{ view.default ? `Default · ${view.summary}` : view.summary }}</small>
      </button>
    </div>
    <p v-else class="ek-inspector-empty">{{ section.reason }}</p>
    <p v-if="problem" class="ek-inspector-warning">{{ problem }}</p>
    <div v-if="section.activeCameraViewId" class="ek-inspector-grid">
      <div class="ek-inspector-button-row">
        <button type="button" :disabled="!section.canApply" @click="applyActive">Apply</button>
        <button type="button" :disabled="!section.canCapture" @click="updateFromRuntime">Update</button>
        <button v-if="section.defaultCameraViewId === section.activeCameraViewId" type="button" @click="setDefault(null)">Clear default</button>
        <button v-else type="button" @click="setDefault(section.activeCameraViewId)">Set default</button>
      </div>
      <label v-for="field in section.fields" :key="field.id" class="ek-inspector-field">
        <span>{{ field.label }}</span>
        <input
          :value="field.value"
          :type="field.kind === 'number' ? 'number' : 'text'"
          :min="field.min"
          :max="field.max"
          :step="field.step ?? 0.01"
          @blur="commit(field.id as CameraViewFieldId, ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent="blurOnEnter"
        />
      </label>
      <button class="ek-inspector-danger" type="button" @click="removeActive">Delete view</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  buildCreateCameraViewCommand,
  buildCreateCameraViewInput,
  buildDeleteCameraViewCommand,
  buildSetDefaultCameraViewCommand,
  buildUpdateCameraViewCommand,
  getNextActiveCameraViewId,
  type CameraInspectorSection,
  type CameraViewFieldId,
  type Editor,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchCameraContext } from "../composables/use-workbench";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  section: CameraInspectorSection;
  camera?: WorkbenchCameraContext;
}>();

const emit = defineEmits<{
  "update:activeCameraViewId": [value: string | null];
}>();

const problem = ref<string | null>(null);
const activeView = computed(() => props.section.activeCameraViewId ? props.snapshot.presentation.cameraViews[props.section.activeCameraViewId] : null);

function captureNewView(): void {
  const captured = props.camera?.capture({ name: nextCameraViewName(props.snapshot) });
  if (!captured) {
    problem.value = "Camera capture unavailable.";
    return;
  }
  const view = buildCreateCameraViewInput(props.snapshot, captured);
  const result = buildCreateCameraViewCommand(view);
  if (result.ok) {
    const dispatch = props.editor.dispatch(result.command);
    if (dispatch.ok) {
      emit("update:activeCameraViewId", view?.id ?? null);
      problem.value = null;
    } else {
      problem.value = dispatch.error ?? "Camera view create failed.";
    }
  } else {
    problem.value = result.problem.message;
  }
}

function updateFromRuntime(): void {
  if (!props.section.activeCameraViewId) {
    return;
  }
  const captured = props.camera?.capture({ name: activeView.value?.name });
  if (!captured) {
    problem.value = "Camera capture unavailable.";
    return;
  }
  const { id: _id, name: _name, metadata: _metadata, ...patch } = captured;
  const result = props.editor.dispatch({
    type: "update-camera-view",
    viewId: props.section.activeCameraViewId,
    patch
  });
  problem.value = result.ok ? null : result.error ?? "Camera view update failed.";
}

function applyActive(): void {
  if (!activeView.value || !props.camera?.apply(activeView.value)) {
    problem.value = "Camera apply unavailable.";
    return;
  }
  problem.value = null;
}

function setDefault(viewId: string | null): void {
  const result = buildSetDefaultCameraViewCommand(props.snapshot, viewId);
  if (result.ok) {
    props.editor.dispatch(result.command);
    problem.value = null;
  } else {
    problem.value = result.problem.message;
  }
}

function commit(fieldId: CameraViewFieldId, value: string): void {
  if (!props.section.activeCameraViewId) {
    return;
  }
  const result = buildUpdateCameraViewCommand(props.snapshot, props.section.activeCameraViewId, fieldId, value);
  if (result.ok) {
    props.editor.dispatch(result.command);
    problem.value = null;
  } else {
    problem.value = result.problem.message;
  }
}

function removeActive(): void {
  if (!props.section.activeCameraViewId) {
    return;
  }
  const nextActiveViewId = getNextActiveCameraViewId(props.snapshot, props.section.activeCameraViewId);
  const result = buildDeleteCameraViewCommand(props.snapshot, props.section.activeCameraViewId);
  if (result.ok) {
    props.editor.dispatch(result.command);
    emit("update:activeCameraViewId", nextActiveViewId);
    problem.value = null;
  } else {
    problem.value = result.problem.message;
  }
}

function blurOnEnter(event: KeyboardEvent): void {
  (event.currentTarget as HTMLInputElement).blur();
}

function nextCameraViewName(snapshot: SceneSnapshot): string {
  return `Camera view ${Object.keys(snapshot.presentation.cameraViews).length + 1}`;
}
</script>
