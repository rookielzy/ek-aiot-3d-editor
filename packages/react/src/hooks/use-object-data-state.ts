import { useCallback, useSyncExternalStore } from "react";
import type { DataObjectDataState } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "./use-workbench";

const EMPTY_OBJECT_DATA_STATE: DataObjectDataState = Object.freeze({
  preview: Object.freeze({ enabled: false, refreshing: false, lastRefreshAt: null }),
  objects: Object.freeze({})
});

export function useObjectDataState(context: ResolvedWorkbenchContext): DataObjectDataState {
  const service = context.editor.getDataService?.() ?? null;
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
