import { useState } from "react";
import {
  type EditorRuntimeOptions,
  type Problem,
  type WorkbenchModel
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, useEditor, type WorkbenchContext, type WorkbenchLocale } from "@ek-aiot/3d-editor-react";
import { createDemoGltfLoader } from "./demo-gltf-loader";

const demoLoader = createDemoGltfLoader();

export interface AppProps {
  locale?: WorkbenchLocale;
  loader?: EditorRuntimeOptions["loader"];
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
}

export function App({ locale, loader = demoLoader, rendererFactory }: AppProps = {}) {
  const editor = useEditor();
  const [runtimeReady, setRuntimeReady] = useState(false);

  return (
    <EditorWorkbench
      editor={editor}
      loader={loader}
      rendererFactory={rendererFactory}
      locale={locale}
      viewportClassName="starter-viewport"
      onRuntimeReady={(runtime) => setRuntimeReady(Boolean(runtime))}
      viewportOverlay={(context) => (
        <StarterOverlay
          context={context}
          runtimeReady={runtimeReady}
        />
      )}
    />
  );
}

function StarterOverlay({ context, runtimeReady }: { context: WorkbenchContext; runtimeReady: boolean }) {
  return (
    <aside className="starter-overlay" data-testid="starter-overlay" aria-label="Starter host status">
      <span>Host starter</span>
      <strong>{context.model.project.sceneName}</strong>
      <small>
        {context.model.project.objectCount} objects · {context.model.project.assetCount} assets · {formatProblems(context.runtimeProblems, context.model)}
      </small>
      <small>Runtime {runtimeReady ? "ready" : "mounting"} · Selection {context.model.selection.label}</small>
    </aside>
  );
}

function formatProblems(runtimeProblems: readonly Problem[], model: WorkbenchModel): string {
  if (model.problems.totalCount === 0) {
    return "no problems";
  }
  return `${model.problems.totalCount} problems, ${runtimeProblems.length} runtime`;
}
