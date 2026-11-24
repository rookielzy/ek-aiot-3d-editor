import type { Editor } from "@ek-aiot/3d-editor-core";
import type { AuthoredCameraView, AuthoredCameraViewInput, RuntimeCameraFrameOptions } from "@ek-aiot/3d-editor-core";
import type { WorkbenchCameraContext } from "../hooks/use-workbench";
import { useInspector } from "../hooks/use-inspector";
import { InspectorView } from "./InspectorView";

export interface InspectorPanelProps {
  editor: Editor;
  className?: string;
}

export function InspectorPanel({ editor, className }: InspectorPanelProps) {
  const { inspector, snapshot, setActiveLightId, setActiveCameraViewId } = useInspector({ editor });
  const camera = createInspectorCameraContext(editor);

  return <InspectorView editor={editor} snapshot={snapshot} inspector={inspector} setActiveLightId={setActiveLightId} setActiveCameraViewId={setActiveCameraViewId} camera={camera} runtime={editor.getRuntime()} className={className} />;
}

function createInspectorCameraContext(editor: Editor): WorkbenchCameraContext {
  return {
    ready: editor.getRuntime() !== null,
    reset() {
      editor.getRuntime()?.resetCamera();
    },
    frameSelected(options?: RuntimeCameraFrameOptions) {
      return editor.getRuntime()?.frameSelected(options) ?? false;
    },
    frameAll(options?: RuntimeCameraFrameOptions) {
      return editor.getRuntime()?.frameAll(options) ?? false;
    },
    capture(input: Pick<AuthoredCameraViewInput, "id" | "name" | "metadata"> = {}) {
      const result = editor.getRuntime()?.captureCameraView(input);
      return result?.ok ? result.view : null;
    },
    apply(view: AuthoredCameraView) {
      const runtime = editor.getRuntime();
      if (!runtime) {
        return false;
      }
      runtime.applyCameraView(view);
      return true;
    }
  };
}
