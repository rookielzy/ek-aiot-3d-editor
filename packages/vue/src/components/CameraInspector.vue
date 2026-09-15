<template>
  <section class="ek-inspector-section">
    <header class="ek-inspector-section__header">
      <h2>{{ renderSectionTitle(resolvedI18n, section) }}</h2>
      <button type="button" class="ek-inspector-compact-action" :disabled="!section.canCapture" @click="captureNewView">
        {{ resolvedI18n.t("reactWorkbench.inspector.camera.capture.label") }}
      </button>
    </header>
    <div v-if="section.cameraViews.length" class="ek-inspector-camera-list" role="list">
      <button
        v-for="view in section.cameraViews"
        :key="view.id"
        type="button"
        :class="{ 'is-active': view.active }"
        :aria-pressed="view.active"
        :data-default="view.default ? 'true' : 'false'"
        @click="selectCameraView(view.id)"
      >
        <span>{{ view.label }}</span>
        <small>{{ view.default ? `${resolvedI18n.t("reactWorkbench.inspector.camera.default.label")} · ${view.summary}` : view.summary }}</small>
      </button>
    </div>
    <p v-else class="ek-inspector-empty">{{ renderSectionReason(resolvedI18n, section) }}</p>
    <p v-if="problem" class="ek-inspector-warning" role="alert">{{ problem }}</p>
    <div v-if="section.activeCameraViewId" class="ek-inspector-grid">
      <div class="ek-inspector-button-row">
        <button type="button" :disabled="!section.canApply" @click="applyActive">{{ resolvedI18n.t("reactWorkbench.inspector.camera.apply.label") }}</button>
        <button type="button" :disabled="!section.canCapture" @click="updateFromRuntime">{{ resolvedI18n.t("reactWorkbench.inspector.camera.update.label") }}</button>
        <button v-if="section.defaultCameraViewId === section.activeCameraViewId" type="button" @click="setDefault(null)">{{ resolvedI18n.t("reactWorkbench.inspector.camera.clearDefault.label") }}</button>
        <button v-else type="button" @click="setDefault(section.activeCameraViewId)">{{ resolvedI18n.t("reactWorkbench.inspector.camera.setDefault.label") }}</button>
      </div>
      <SceneInspectorFields :fields="section.fields" :target-key="section.activeCameraViewId" :problem="fieldProblem" :i18n="resolvedI18n"
        :on-commit="(fieldId, value) => commit(fieldId as CameraViewFieldId, value)" />
      <button class="ek-inspector-danger" type="button" @click="removeActive">{{ resolvedI18n.t("reactWorkbench.inspector.camera.delete.label") }}</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
  type InspectorCommandProblem,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import type { WorkbenchCameraContext } from "../composables/use-workbench";
import {
  DEFAULT_INSPECTOR_I18N,
  renderProblemMessage,
  renderSectionReason,
  renderSectionTitle,
  type InspectorI18n
} from "./inspector-i18n";

import SceneInspectorFields from "./SceneInspectorFields.vue";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  section: CameraInspectorSection;
  camera?: WorkbenchCameraContext;
  i18n?: InspectorI18n;
}>();

const emit = defineEmits<{
  "update:activeCameraViewId": [value: string | null];
}>();

const fieldProblem = ref<InspectorCommandProblem | null>(null);
const problem = ref<string | null>(null);
const activeView = computed(() => props.section.activeCameraViewId ? props.snapshot.cameras[props.section.activeCameraViewId] : null);
const resolvedI18n = computed(() => props.i18n ?? DEFAULT_INSPECTOR_I18N);

watch(() => props.section.activeCameraViewId, () => { problem.value = null; fieldProblem.value = null; });

function selectCameraView(viewId: string | null): void {
  emit("update:activeCameraViewId", viewId);
  const target = Object.values(props.editor.getSnapshot().nodes).find((node) => node.kind === "camera" && node.cameraId === viewId);
  if (target) props.editor.dispatch({ type: "select-node", nodeId: target.id });
}

function captureNewView(): void {
  const captured = props.camera?.capture({ name: nextCameraViewName(props.snapshot) });
  if (!captured) {
    problem.value = resolvedI18n.value.t("reactWorkbench.inspector.camera.captureUnavailable.message");
    return;
  }
  const view = buildCreateCameraViewInput(props.snapshot, captured);
  const result = buildCreateCameraViewCommand(view);
  if (result.ok) {
    const dispatch = props.editor.dispatch(result.command);
    if (dispatch.ok) {
      selectCameraView(view?.id ?? null);
      problem.value = null;
    } else {
      problem.value = dispatch.error ?? resolvedI18n.value.t("reactWorkbench.inspector.camera.createFailed.message");
    }
  } else {
    problem.value = renderProblemMessage(resolvedI18n.value, result.problem);
  }
}

function updateFromRuntime(): void {
  if (!props.section.activeCameraViewId) {
    return;
  }
  const captured = props.camera?.capture({ name: activeView.value?.name });
  if (!captured) {
    problem.value = resolvedI18n.value.t("reactWorkbench.inspector.camera.captureUnavailable.message");
    return;
  }
  const { id: _id, name: _name, metadata: _metadata, ...patch } = captured;
  const result = props.editor.dispatch({
    type: "update-camera-view",
    viewId: props.section.activeCameraViewId,
    patch
  });
  problem.value = result.ok ? null : result.error ?? resolvedI18n.value.t("reactWorkbench.inspector.camera.updateFailed.message");
}

function applyActive(): void {
  if (!activeView.value || !props.camera?.apply(activeView.value)) {
    problem.value = resolvedI18n.value.t("reactWorkbench.inspector.camera.applyUnavailable.message");
    return;
  }
  problem.value = null;
}

function setDefault(viewId: string | null): void {
  const result = buildSetDefaultCameraViewCommand(props.snapshot, viewId);
  if (result.ok) {
    const dispatch = props.editor.dispatch(result.command);
    problem.value = dispatch.ok ? null : dispatch.error ?? resolvedI18n.value.t("reactWorkbench.inspector.camera.updateFailed.message");
  } else {
    problem.value = renderProblemMessage(resolvedI18n.value, result.problem);
  }
}

function commit(fieldId: CameraViewFieldId, value: string): boolean {
  if (!props.section.activeCameraViewId) return false;
  const result = buildUpdateCameraViewCommand(props.editor.getSnapshot(), props.section.activeCameraViewId, fieldId, value);
  if (!result.ok) {
    fieldProblem.value = result.problem;
    return false;
  }
  const dispatch = props.editor.dispatch(result.command);
  fieldProblem.value = dispatch.ok ? null : { code: "inspector-camera-dispatch-failed", fieldId, message: dispatch.error ?? resolvedI18n.value.t("reactWorkbench.inspector.camera.updateFailed.message"), severity: "warning" };
  problem.value = null;
  return dispatch.ok;
}

function removeActive(): void {
  if (!props.section.activeCameraViewId) {
    return;
  }
  const nextActiveViewId = getNextActiveCameraViewId(props.snapshot, props.section.activeCameraViewId);
  const result = buildDeleteCameraViewCommand(props.snapshot, props.section.activeCameraViewId);
  if (result.ok) {
    const dispatch = props.editor.dispatch(result.command);
    if (dispatch.ok) {
      selectCameraView(nextActiveViewId);
      problem.value = null;
    } else {
      problem.value = dispatch.error ?? resolvedI18n.value.t("reactWorkbench.inspector.camera.updateFailed.message");
    }
  } else {
    problem.value = renderProblemMessage(resolvedI18n.value, result.problem);
  }
}

function nextCameraViewName(snapshot: SceneSnapshot): string {
  return `Camera view ${Object.keys(snapshot.cameras).length + 1}`;
}
</script>
