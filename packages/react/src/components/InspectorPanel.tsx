import type { Editor } from "@ek-aiot/3d-editor-core";
import { useInspector } from "../hooks/use-inspector";
import { InspectorView } from "./InspectorView";

export interface InspectorPanelProps {
  editor: Editor;
  className?: string;
}

export function InspectorPanel({ editor, className }: InspectorPanelProps) {
  const { inspector, snapshot, setActiveLightId } = useInspector({ editor });

  return <InspectorView editor={editor} snapshot={snapshot} inspector={inspector} setActiveLightId={setActiveLightId} className={className} />;
}
