import { useCallback, useSyncExternalStore } from "react";
import type { DataColorState, Editor } from "@ek-aiot/3d-editor-core";

export const EMPTY_DATA_COLOR_STATE: DataColorState = Object.freeze({
  previewEnabled: false,
  trial: null,
  objects: Object.freeze({})
});

export function useEditorDataColorState(editor: Editor): DataColorState {
  const service = editor.getDataColorService?.() ?? null;
  const subscribe = useCallback(
    (listener: () => void) => service?.subscribe(listener) ?? (() => {}),
    [service]
  );
  const getState = useCallback(
    () => service?.getState() ?? EMPTY_DATA_COLOR_STATE,
    [service]
  );
  return useSyncExternalStore(subscribe, getState, getState);
}
