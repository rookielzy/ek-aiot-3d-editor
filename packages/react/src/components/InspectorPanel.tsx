import type { Editor } from "@ek-aiot/3d-editor-core";
import { useInspector } from "../hooks/use-inspector";
import { EnvironmentInspector } from "./EnvironmentInspector";
import { LightInspector } from "./LightInspector";
import { MaterialInspector } from "./MaterialInspector";
import { ProblemsPanel } from "./ProblemsPanel";
import { TransformInspector } from "./TransformInspector";
import "./inspector.css";

export interface InspectorPanelProps {
  editor: Editor;
  className?: string;
}

export function InspectorPanel({ editor, className }: InspectorPanelProps) {
  const { inspector, snapshot, setActiveLightId } = useInspector({ editor });

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
