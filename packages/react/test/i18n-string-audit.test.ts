import { describe, expect, it } from "vitest";
import { writeFileSync, rmSync } from "node:fs";
import { auditReactComponentStrings } from "../../test/i18n-string-audit";

const DEFAULT_WORKBENCH_COMPONENTS = [
  "packages/react/src/components/EditorWorkbench.tsx",
  "packages/react/src/components/WorkbenchToolbar.tsx",
  "packages/react/src/components/WorkbenchViewportTools.tsx",
  "packages/react/src/components/WorkbenchLeftPanel.tsx",
  "packages/react/src/components/DataSourcesPanel.tsx",
  "packages/react/src/components/DataQueryTester.tsx",
  "packages/react/src/components/DataQueryEditor.tsx",
  "packages/react/src/components/DataQueryBindingsDialog.tsx",
  "packages/react/src/components/DataBindingForm.tsx",
  "packages/react/src/components/DataBindingInspector.tsx",
  "packages/react/src/components/DataPreviewControls.tsx",
  "packages/react/src/components/DataDetailCard.tsx",
  "packages/react/src/components/WorkbenchStatusBar.tsx",
  "packages/react/src/components/WorkbenchProblemsDrawer.tsx",
  "packages/react/src/components/InspectorView.tsx",
  "packages/react/src/components/TransformInspector.tsx",
  "packages/react/src/components/MaterialInspector.tsx",
  "packages/react/src/components/EnvironmentInspector.tsx",
  "packages/react/src/components/LightInspector.tsx",
  "packages/react/src/components/CameraInspector.tsx",
  "packages/react/src/components/ProblemsPanel.tsx",
] as const;

describe("React Workbench hardcoded string audit", () => {
  it("keeps default user-facing Workbench copy routed through dictionaries", () => {
    expect(auditReactComponentStrings(DEFAULT_WORKBENCH_COMPONENTS)).toEqual([]);
  });

  it("flags direct user-facing English while allowing technical literals", () => {
    const path = "/tmp/react-workbench-i18n-audit-fixture.tsx";
    writeFileSync(path, `
      export function Fixture() {
        return (
          <div data-state="import-glb">
            <button>Replace asset</button>
            <button aria-label={"Export partial"} />
            <span>GLB</span>
          </div>
        );
      }
    `);

    try {
      expect(auditReactComponentStrings([path])).toEqual([
        { path, value: "Replace asset" },
        { path, value: "Export partial" },
      ]);
    } finally {
      rmSync(path, { force: true });
    }
  });
});
