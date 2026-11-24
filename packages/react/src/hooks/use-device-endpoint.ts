import { useEffect, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_DATA_QUERY_REFRESH_INTERVAL_MS,
  type DataConnection,
  type DataDeviceEndpointKind,
  type DataDeviceReadResult,
  type EditorDataService
} from "@ek-aiot/3d-editor-core";

const unavailable = { ok: false, message: "The editor does not provide device requests." } as const;
const missing = { ok: false, message: "This device endpoint is not configured." } as const;

export function useDeviceEndpoint<Kind extends DataDeviceEndpointKind>(
  service: EditorDataService | undefined,
  connection: DataConnection | undefined,
  kind: Kind,
  refresh = 0
): DataDeviceReadResult<Kind> | undefined {
  const revision = useSyncExternalStore(
    (listener) => service?.subscribe(listener) ?? (() => {}),
    () => `${service?.getAuthRevision() ?? 0}:${service?.getDeviceReadRevision?.() ?? 0}`,
    () => "0:0"
  );
  const connectionId = connection?.id;
  const method = connection?.deviceEndpoints?.[kind]?.method;
  const key = JSON.stringify([connection, revision, refresh]);
  const [state, setState] = useState<{ key: string; service: typeof service; result: DataDeviceReadResult<Kind> }>();
  useEffect(() => {
    if (!connectionId || !method || !service?.readDeviceEndpoint) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const readEndpoint = service.readDeviceEndpoint.bind(service);
    const read = async () => {
      const result = await readEndpoint(connectionId, kind, controller.signal);
      if (controller.signal.aborted) return;
      setState({ key, service, result });
      if (kind === "deviceRealtime" && method === "GET") {
        timer = setTimeout(() => { void read(); }, DEFAULT_DATA_QUERY_REFRESH_INTERVAL_MS);
      }
    };
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [service, connectionId, method, kind, key]);
  if (!connectionId) return undefined;
  if (!service?.readDeviceEndpoint) return unavailable;
  if (!method) return missing;
  return state?.key === key && state.service === service ? state.result : undefined;
}
