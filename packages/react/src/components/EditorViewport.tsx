import { useEffect, useRef } from "react";
import type { AssetResolverBridge, Editor, EditorRuntime, EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";

export interface EditorViewportProps {
  editor: Editor;
  resolver?: AssetResolverBridge;
  loader?: EditorRuntimeOptions["loader"];
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
  interactions?: EditorRuntimeOptions["interactions"];
  onRuntimeReady?(runtime: EditorRuntime | null): void;
  className?: string;
}

export function EditorViewport({ editor, resolver, loader, rendererFactory, interactions, onRuntimeReady, className }: EditorViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeReadyRef = useRef(onRuntimeReady);
  runtimeReadyRef.current = onRuntimeReady;

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const runtime = editor.mountRuntime({
      container: containerRef.current,
      resolver,
      loader,
      rendererFactory,
      interactions
    });
    runtimeReadyRef.current?.(runtime);

    return () => {
      runtime.dispose();
      runtimeReadyRef.current?.(null);
    };
  }, [editor, resolver, loader, rendererFactory, interactions]);

  return <div ref={containerRef} className={className ?? "ek-editor-viewport"} />;
}
