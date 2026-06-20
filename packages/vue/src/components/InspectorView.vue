<template>
  <aside class="ek-inspector" :aria-label="resolvedI18n.t('reactWorkbench.inspector.scene.label')">
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
    <TransformInspector :editor="rawEditor" :snapshot="snapshot" :section="inspector.transform" :i18n="resolvedI18n" />
    <MaterialInspector :editor="rawEditor" :snapshot="snapshot" :section="inspector.material" :i18n="resolvedI18n" />
    <EnvironmentInspector :editor="rawEditor" :snapshot="snapshot" :section="inspector.environment" :i18n="resolvedI18n" />
    <LightInspector
      :editor="rawEditor"
      :snapshot="snapshot"
      :section="inspector.lights"
      :i18n="resolvedI18n"
      @update:active-light-id="$emit('update:activeLightId', $event)"
    />
    <CameraInspector
      :editor="rawEditor"
      :snapshot="snapshot"
      :section="inspector.cameras"
      :camera="camera"
      :i18n="resolvedI18n"
      @update:active-camera-view-id="$emit('update:activeCameraViewId', $event)"
    />
    <ProblemsPanel :section="inspector.problems" :i18n="resolvedI18n" @replace-asset="onReplaceAsset" />
  </aside>
</template>

<script setup lang="ts">
import { computed, toRaw } from "vue";
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
