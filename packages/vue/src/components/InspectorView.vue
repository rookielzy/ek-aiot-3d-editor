<template>
  <aside class="ek-inspector" :aria-label="resolvedI18n.t('reactWorkbench.inspector.scene.label')">
    <InspectorTabs v-model="activeGroup" :tabs="groups" :label="resolvedI18n.t('reactWorkbench.inspector.groups.label')">
      <template #object>
        <header class="ek-inspector-summary" :data-problem-tone="problemTone">
          <div class="ek-inspector-summary__copy">
            <span>{{ resolvedI18n.t("reactWorkbench.inspector.summary.selection.label") }}</span>
            <strong>
              {{
                selectedLabel
                  ? resolvedI18n.t("reactWorkbench.inspector.summary.selection.named", { label: selectedLabel })
                  : resolvedI18n.t("reactWorkbench.inspector.summary.selection.empty")
              }}
            </strong>
          </div>
          <dl class="ek-inspector-summary__meta">
            <div>
              <dt>{{ resolvedI18n.t("reactWorkbench.inspector.summary.nodes.label") }}</dt>
              <dd>{{ inspector.selection.count }}</dd>
            </div>
            <div>
              <dt>{{ resolvedI18n.t("reactWorkbench.inspector.summary.kind.label") }}</dt>
              <dd>{{ inspector.selection.nodeKind ?? resolvedI18n.t("reactWorkbench.inspector.summary.kind.none") }}</dd>
            </div>
            <div>
              <dt>{{ resolvedI18n.t("reactWorkbench.inspector.summary.problems.label") }}</dt>
              <dd>{{ inspector.problems.problems.length }}</dd>
            </div>
          </dl>
        </header>
        <InspectorTabs secondary :tabs="objectTabs" :label="resolvedI18n.t('reactWorkbench.inspector.groups.object')">
          <template #transform>
            <TransformInspector :editor="rawEditor" :snapshot="snapshot" :section="inspector.transform" :i18n="resolvedI18n" :locked="previewLocked" />
          </template>
          <template #material>
            <MaterialInspector :key="inspector.selection.nodeId ?? 'none'" :editor="rawEditor" :snapshot="snapshot" :section="inspector.material" :i18n="resolvedI18n" :locked="previewLocked" />
          </template>
          <template #data>
            <DataBindingInspector v-if="dataContext" :context="dataContext" :snapshot="snapshot" :selection="inspector.selection" :i18n="resolvedI18n" />
          </template>
          <template #lights>
            <LightInspector v-if="activeGroup === 'object'" :editor="rawEditor" :snapshot="snapshot" :section="inspector.lights" :i18n="resolvedI18n"
              @update:active-light-id="$emit('update:activeLightId', $event)" />
          </template>
          <template #cameras>
            <CameraInspector v-if="activeGroup === 'object'" :editor="rawEditor" :snapshot="snapshot" :section="inspector.cameras" :camera="camera" :i18n="resolvedI18n"
              @update:active-camera-view-id="$emit('update:activeCameraViewId', $event)" />
          </template>
        </InspectorTabs>
      </template>
      <template #environment>
        <EnvironmentInspector :editor="rawEditor" :snapshot="snapshot" :section="inspector.environment" :i18n="resolvedI18n" />
      </template>
      <template #scene>
        <InspectorTabs secondary :tabs="sceneTabs" :label="resolvedI18n.t('reactWorkbench.inspector.groups.scene')">
          <template #lights>
            <LightInspector v-if="activeGroup !== 'object' || !selectedLight" :editor="rawEditor" :snapshot="snapshot" :section="inspector.lights" :i18n="resolvedI18n"
              @update:active-light-id="$emit('update:activeLightId', $event)" />
          </template>
          <template #cameras>
            <CameraInspector v-if="activeGroup !== 'object' || !selectedCamera" :editor="rawEditor" :snapshot="snapshot" :section="inspector.cameras" :camera="camera" :i18n="resolvedI18n"
              @update:active-camera-view-id="$emit('update:activeCameraViewId', $event)" />
          </template>
          <template #problems>
            <ProblemsPanel :section="inspector.problems" :i18n="resolvedI18n" @replace-asset="onReplaceAsset" />
          </template>
        </InspectorTabs>
      </template>
      <template #dataDisplay>
        <DataDisplayInspector v-if="dataContext && dataDisplays" :context="dataContext" :data="dataDisplays"
          :active="activeGroup === 'dataDisplay'" />
      </template>
    </InspectorTabs>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, toRaw, watch } from "vue";
import type { Editor, InspectorModel, SceneSnapshot } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext, WorkbenchCameraContext } from "../composables/use-workbench";
import type { DataDisplayRealtimeContext } from "../composables/use-data-display-realtime";
import { resolveDataDisplayMessage } from "../i18n/data-display-i18n";
import { DEFAULT_INSPECTOR_I18N, renderSectionTitle, type InspectorI18n } from "./inspector-i18n";
import { problemToneFromSeverities } from "./workbench-model-helpers";
import "./inspector.css";
import TransformInspector from "./TransformInspector.vue";
import MaterialInspector from "./MaterialInspector.vue";
import EnvironmentInspector from "./EnvironmentInspector.vue";
import LightInspector from "./LightInspector.vue";
import CameraInspector from "./CameraInspector.vue";
import DataBindingInspector from "./DataBindingInspector.vue";
import DataDisplayInspector from "./DataDisplayInspector.vue";
import ProblemsPanel from "./ProblemsPanel.vue";
import InspectorTabs from "./InspectorTabs.vue";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  inspector: InspectorModel;
  camera?: WorkbenchCameraContext;
  dataContext?: ResolvedWorkbenchContext;
  dataDisplays?: DataDisplayRealtimeContext;
  i18n?: InspectorI18n;
}>();

const emit = defineEmits<{
  "update:activeLightId": [value: string | null];
  "update:activeCameraViewId": [value: string | null];
  replaceAsset: [assetId: string, file: File];
}>();

const rawEditor = toRaw(props.editor);
const resolvedI18n = computed(() => props.i18n ?? DEFAULT_INSPECTOR_I18N);
const activeGroup = ref("object");
const groups = computed(() => [
  ...(["object", "environment", "scene"] as const).map((id) => ({
    id, label: resolvedI18n.value.t(`reactWorkbench.inspector.groups.${id}`)
  })),
  ...(props.dataContext && props.dataDisplays
    ? [{ id: "dataDisplay", label: resolveDataDisplayMessage(resolvedI18n.value, "dataDisplay.section") }] : [])
]);
watch(() => props.inspector.selection.node?.kind === "data-display" ? props.inspector.selection.nodeId : null, (id) => {
  if (id && props.dataDisplays) activeGroup.value = "dataDisplay";
}, { immediate: true });
const selectedLight = computed(() => props.inspector.selection.count === 1 && !!props.inspector.selection.light);
const selectedCamera = computed(() => props.inspector.selection.count === 1 && !!props.inspector.selection.cameraView);
const objectTabs = computed(() => {
  const sections = selectedLight.value ? [props.inspector.lights]
    : selectedCamera.value ? [props.inspector.cameras]
    : props.inspector.selection.light || props.inspector.selection.cameraView ? []
    : [props.inspector.transform, props.inspector.material];
  const tabs = sections.map((section) => ({ id: section.id, label: renderSectionTitle(resolvedI18n.value, section) }));
  return props.dataContext ? [...tabs, { id: "data", label: resolvedI18n.value.t("dataBinding.section.label") }] : tabs;
});
const sceneTabs = computed(() => [props.inspector.lights, props.inspector.cameras, props.inspector.problems]
  .map((section) => ({ id: section.id, label: renderSectionTitle(resolvedI18n.value, section) })));
const selectedLabel = computed(() => {
  const selection = props.inspector.selection;
  return selection.cameraView?.name ?? selection.light?.name ?? selection.object?.name ?? selection.node?.name ?? selection.nodeId;
});
const problemTone = computed(() => problemToneFromSeverities(props.inspector.problems.problems));
const previewLocked = computed(() => props.dataContext?.dataState.preview.enabled ?? false);

function onReplaceAsset(assetId: string, file: File): void {
  emit("replaceAsset", assetId, file);
}
</script>
