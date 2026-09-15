<template>
  <aside class="ek-inspector" :aria-label="resolvedI18n.t('reactWorkbench.inspector.scene.label')">
    <div class="ek-inspector-tabs" role="tablist" :aria-label="resolvedI18n.t('reactWorkbench.inspector.groups.label')">
      <button v-for="(group, index) in groups" :key="group" type="button" role="tab"
        :id="`${id}-tab-${group}`" :aria-controls="`${id}-panel-${group}`"
        :aria-selected="activeGroup === group" :tabindex="activeGroup === group ? 0 : -1"
        @click="activeGroup = group" @keydown="navigateGroup($event, index)">
        {{ resolvedI18n.t(`reactWorkbench.inspector.groups.${group}`) }}
      </button>
    </div>
    <div role="tabpanel" :id="`${id}-panel-object`" :aria-labelledby="`${id}-tab-object`" :hidden="activeGroup !== 'object'">
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
      <TransformInspector v-if="!inspector.selection.light && !inspector.selection.cameraView" :editor="rawEditor" :snapshot="snapshot" :section="inspector.transform" :i18n="resolvedI18n" />
      <MaterialInspector v-if="!inspector.selection.light && !inspector.selection.cameraView" :key="inspector.selection.nodeId ?? 'none'" :editor="rawEditor" :snapshot="snapshot" :section="inspector.material" :i18n="resolvedI18n" />
      <LightInspector v-if="showSelectedLight"
        :editor="rawEditor"
        :snapshot="snapshot"
        :section="inspector.lights"
        :i18n="resolvedI18n"
        @update:active-light-id="$emit('update:activeLightId', $event)"
      />
      <CameraInspector v-if="showSelectedCamera"
        :editor="rawEditor"
        :snapshot="snapshot"
        :section="inspector.cameras"
        :camera="camera"
        :i18n="resolvedI18n"
        @update:active-camera-view-id="$emit('update:activeCameraViewId', $event)"
      />
    </div>
    <div role="tabpanel" :id="`${id}-panel-environment`" :aria-labelledby="`${id}-tab-environment`" :hidden="activeGroup !== 'environment'">
      <EnvironmentInspector :editor="rawEditor" :snapshot="snapshot" :section="inspector.environment" :i18n="resolvedI18n" />
    </div>
    <div role="tabpanel" :id="`${id}-panel-scene`" :aria-labelledby="`${id}-tab-scene`" :hidden="activeGroup !== 'scene'">
      <LightInspector v-if="!showSelectedLight"
        :editor="rawEditor"
        :snapshot="snapshot"
        :section="inspector.lights"
        :i18n="resolvedI18n"
        @update:active-light-id="$emit('update:activeLightId', $event)"
      />
      <CameraInspector v-if="!showSelectedCamera"
        :editor="rawEditor"
        :snapshot="snapshot"
        :section="inspector.cameras"
        :camera="camera"
        :i18n="resolvedI18n"
        @update:active-camera-view-id="$emit('update:activeCameraViewId', $event)"
      />
    </div>
    <ProblemsPanel :section="inspector.problems" :i18n="resolvedI18n" @replace-asset="onReplaceAsset" />
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, toRaw, useId } from "vue";
import type { Editor, InspectorModel, SceneSnapshot } from "@ek-aiot/3d-editor-core";
import type { WorkbenchCameraContext } from "../composables/use-workbench";
import { DEFAULT_INSPECTOR_I18N, type InspectorI18n } from "./inspector-i18n";
import { problemToneFromSeverities } from "./workbench-model-helpers";
import "./inspector.css";
import TransformInspector from "./TransformInspector.vue";
import MaterialInspector from "./MaterialInspector.vue";
import EnvironmentInspector from "./EnvironmentInspector.vue";
import LightInspector from "./LightInspector.vue";
import CameraInspector from "./CameraInspector.vue";
import ProblemsPanel from "./ProblemsPanel.vue";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  inspector: InspectorModel;
  camera?: WorkbenchCameraContext;
  i18n?: InspectorI18n;
}>();

const emit = defineEmits<{
  "update:activeLightId": [value: string | null];
  "update:activeCameraViewId": [value: string | null];
  replaceAsset: [assetId: string, file: File];
}>();

const groups = ["object", "environment", "scene"] as const;
const activeGroup = ref<typeof groups[number]>("object");
const id = useId();
const showSelectedLight = computed(() => activeGroup.value === "object" && props.inspector.selection.count === 1 && !!props.inspector.selection.light);
const showSelectedCamera = computed(() => activeGroup.value === "object" && props.inspector.selection.count === 1 && !!props.inspector.selection.cameraView);

function navigateGroup(event: KeyboardEvent, index: number): void {
  const next = event.key === "ArrowRight" ? (index + 1) % groups.length
    : event.key === "ArrowLeft" ? (index + groups.length - 1) % groups.length
    : event.key === "Home" ? 0 : event.key === "End" ? groups.length - 1 : null;
  if (next === null) return;
  event.preventDefault();
  activeGroup.value = groups[next]!;
  (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
}

const rawEditor = toRaw(props.editor);
const resolvedI18n = computed(() => props.i18n ?? DEFAULT_INSPECTOR_I18N);
const selectedLabel = computed(() => {
  const selection = props.inspector.selection;
  return selection.cameraView?.name ?? selection.light?.name ?? selection.object?.name ?? selection.node?.name ?? selection.nodeId;
});
const problemTone = computed(() => problemToneFromSeverities(props.inspector.problems.problems));

function onReplaceAsset(assetId: string, file: File): void {
  emit("replaceAsset", assetId, file);
}
</script>
