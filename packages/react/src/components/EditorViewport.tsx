import { useEffect, useRef, useSyncExternalStore } from "react";
import { IDLE_MARQUEE_SELECTION_STATE, type AssetResolverBridge, type Editor, type EditorMarqueeSelectionStateSnapshot, type EditorRuntime, type EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";

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
  const marquee = useSyncExternalStore(
    (listener) => editor.subscribeMarqueeSelection?.(listener) ?? (() => {}),
    () => editor.marqueeSelection?.get() ?? IDLE_MARQUEE_SELECTION_STATE,
    () => editor.marqueeSelection?.get() ?? IDLE_MARQUEE_SELECTION_STATE
  );
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

  return (
    <div ref={containerRef} className={className ?? "ek-editor-viewport"}>
      <MarqueeSelectionOverlay state={marquee} />
    </div>
  );
}

function MarqueeSelectionOverlay({ state }: { state: EditorMarqueeSelectionStateSnapshot }) {
  if (state.status !== "dragging" || !state.rect) {
    return null;
  }

  return (
    <div
      className="ek-editor-viewport__marquee"
      aria-hidden="true"
      style={{
        left: state.rect.left,
        top: state.rect.top,
        width: state.rect.width,
        height: state.rect.height
      }}
    />
  );
}
