import { describe, expect, it } from "vitest";
import { writeFileSync, rmSync } from "node:fs";
import { auditVueComponentStrings } from "../../test/i18n-string-audit";

const DEFAULT_WORKBENCH_COMPONENTS = [
  "packages/vue/src/components/EditorWorkbench.vue",
  "packages/vue/src/components/WorkbenchToolbar.vue",
  "packages/vue/src/components/WorkbenchLeftPanel.vue",
  "packages/vue/src/components/WorkbenchStatusBar.vue",
  "packages/vue/src/components/InspectorView.vue",
  "packages/vue/src/components/TransformInspector.vue",
  "packages/vue/src/components/MaterialInspector.vue",
  "packages/vue/src/components/InspectorFieldControl.vue",
  "packages/vue/src/components/InspectorColorInput.vue",
  "packages/vue/src/components/InspectorSelect.vue",
  "packages/vue/src/components/ui/Command.vue",
  "packages/vue/src/components/EnvironmentInspector.vue",
  "packages/vue/src/components/LightInspector.vue",
  "packages/vue/src/components/CameraInspector.vue",
  "packages/vue/src/components/ProblemsPanel.vue",
  "packages/vue/src/components/DataBindingInspector.vue",
  "packages/vue/src/components/DataBindingForm.vue",
  "packages/vue/src/components/DataDetailCard.vue",
  "packages/vue/src/components/DataPreviewControls.vue",
  "packages/vue/src/components/DataQueryBindingsDialog.vue",
  "packages/vue/src/components/DataSourcesPanel.vue",
] as const;

describe("Vue Workbench hardcoded string audit", () => {
  it("keeps default user-facing Workbench copy routed through dictionaries", () => {
    expect(auditVueComponentStrings(DEFAULT_WORKBENCH_COMPONENTS)).toEqual([]);
  });

  it("flags direct user-facing English while allowing technical literals", () => {
    const path = "/tmp/vue-workbench-i18n-audit-fixture.vue";
    writeFileSync(path, `
      <template>
        <div data-state="import-glb">
          <button>Camera views</button>
          <button :aria-label="'Replace asset'" />
          <span>GLB</span>
        </div>
      </template>
    `);

    try {
      expect(auditVueComponentStrings([path])).toEqual([
        { path, value: "Camera views" },
        { path, value: "Replace asset" },
      ]);
    } finally {
      rmSync(path, { force: true });
    }
  });
});
