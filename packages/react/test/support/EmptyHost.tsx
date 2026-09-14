import type { EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, type WorkbenchLocale } from "@ek-aiot/3d-editor-react";
import { createDemoGltfLoader } from "../../../../examples/react-proof-loop/src/demo-gltf-loader";

const demoLoader = createDemoGltfLoader();

/** An empty custom host, independent of the demo's authored showcase. */
export function EmptyHost({ loader = demoLoader, ...props }: { locale?: WorkbenchLocale; loader?: EditorRuntimeOptions["loader"]; rendererFactory?: EditorRuntimeOptions["rendererFactory"] }) {
  return <EditorWorkbench loader={loader} {...props} viewportClassName="starter-viewport"
    viewportOverlay={({ model }) => <aside data-testid="starter-overlay">
      {model.project.objectCount} objects · {model.project.assetCount} assets
    </aside>}
  />;
}
