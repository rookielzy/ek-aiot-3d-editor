import type { Editor, InspectorModel, SceneSnapshot } from "@ek-aiot/3d-editor-core";
import { EnvironmentInspector } from "./EnvironmentInspector";
import { LightInspector } from "./LightInspector";
import { MaterialInspector } from "./MaterialInspector";
import { ProblemsPanel } from "./ProblemsPanel";
import { TransformInspector } from "./TransformInspector";
import "./inspector.css";

export interface InspectorViewProps {
  editor: Editor;
  snapshot: SceneSnapshot;
  inspector: InspectorModel;
  setActiveLightId(value: string | null): void;
  className?: string;
}

export function InspectorView({ editor, snapshot, inspector, setActiveLightId, className }: InspectorViewProps) {
  return (
    <aside className={className ? `ek-inspector ${className}` : "ek-inspector"} aria-label="Scene inspector">
      <TransformInspector editor={editor} snapshot={snapshot} section={inspector.transform} />
      <MaterialInspector editor={editor} snapshot={snapshot} section={inspector.material} />
      <EnvironmentInspector editor={editor} snapshot={snapshot} section={inspector.environment} />
      <LightInspector editor={editor} snapshot={snapshot} section={inspector.lights} onActiveLightIdChange={setActiveLightId} />
      <ProblemsPanel section={inspector.problems} />
    </aside>
  );
}
