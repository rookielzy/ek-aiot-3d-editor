import { useEffect, useState } from "react";
import { resolveDefaultPresentationView, type DataRequestExecutor, type EditorRuntimeOptions, type EditorWithGlbImport } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, type WorkbenchLocale } from "@ek-aiot/3d-editor-react";
import { createDemoGltfLoader } from "./demo-gltf-loader";
import { createShowcaseEditor, showcaseInteractions } from "../../showcase/showcase";

const demoLoader = createDemoGltfLoader();

/** Browser demo host: real same-origin fetch; credentials stay a host concern. */
const fetchDataRequestExecutor: DataRequestExecutor = async (request) => {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body === null ? undefined : JSON.stringify(request.body),
    signal: request.signal
  });
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    body: await response.text()
  };
};

export interface AppProps {
  locale?: WorkbenchLocale;
  loader?: EditorRuntimeOptions["loader"];
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
}

export function App({ locale, loader = demoLoader, rendererFactory }: AppProps = {}) {
  const [editor, setEditor] = useState<EditorWithGlbImport | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let ownedEditor: EditorWithGlbImport | null = null;
    setEditor(null);
    setFailed(false);
    void createShowcaseEditor(loader, controller.signal, { executor: fetchDataRequestExecutor }).then((created) => {
      if (controller.signal.aborted) { created.dispose(); return; }
      ownedEditor = created;
      setEditor(created);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => {
      controller.abort();
      ownedEditor?.dispose();
    };
  }, [loader, attempt]);

  if (!editor) {
    return <main className="showcase-loading" role="status">
      {failed ? (locale === "zh-CN" ? "无法打开展示场景。" : "Unable to open the showcase.") : (locale === "zh-CN" ? "正在打开工作室…" : "Opening the studio…")}
      {failed && <button type="button" onClick={() => setAttempt((value) => value + 1)}>{locale === "zh-CN" ? "重试" : "Retry"}</button>}
    </main>;
  }

  return <EditorWorkbench
    editor={editor}
    loader={loader}
    rendererFactory={rendererFactory}
    locale={locale}
    interactions={showcaseInteractions}
    onRuntimeReady={(runtime) => {
      const view = resolveDefaultPresentationView(editor.getSnapshot());
      if (runtime && view.status === "resolved") runtime.applyCameraView(view.view);
    }}
  />;
}
