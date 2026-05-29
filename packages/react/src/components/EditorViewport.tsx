import { useEffect, useRef } from "react";
import type { AssetResolverBridge, Editor, EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";

export interface EditorViewportProps {
  editor: Editor;
  resolver?: AssetResolverBridge;
  loader?: EditorRuntimeOptions["loader"];
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
  className?: string;
}

export function EditorViewport({ editor, resolver, loader, rendererFactory, className }: EditorViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const runtime = editor.mountRuntime({
      container: containerRef.current,
      resolver,
      loader,
      rendererFactory
    });

    return () => {
      runtime.dispose();
    };
  }, [editor, resolver, loader, rendererFactory]);

  return <div ref={containerRef} className={className ?? "ek-editor-viewport"} />;
}
