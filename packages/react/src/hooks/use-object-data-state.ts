import { useCallback, useSyncExternalStore } from "react";
import type { DataObjectDataState, Editor } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "./use-workbench";

export const EMPTY_OBJECT_DATA_STATE: DataObjectDataState = Object.freeze({
  preview: Object.freeze({
    enabled: false,
    refreshing: false,
    lastRefreshAt: null,
    contextCount: 0,
    pausedCount: 0
  }),
  contexts: Object.freeze({}),
  objects: Object.freeze({})
});

export function useEditorObjectDataState(editor: Editor): DataObjectDataState {
  const service = editor.getDataService?.() ?? null;
  const subscribe = useCallback(
    (listener: () => void) => service?.subscribeObjectData(listener) ?? (() => {}),
    [service]
  );
  const getState = useCallback(
    () => service?.getObjectDataState() ?? EMPTY_OBJECT_DATA_STATE,
    [service]
  );
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useObjectDataState(context: ResolvedWorkbenchContext): DataObjectDataState {
  return useEditorObjectDataState(context.editor);
}
