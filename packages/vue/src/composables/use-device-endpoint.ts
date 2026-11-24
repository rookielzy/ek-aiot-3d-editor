import { shallowRef, watch, type Ref } from "vue";
import {
  DEFAULT_DATA_QUERY_REFRESH_INTERVAL_MS,
  type DataConnection,
  type DataDeviceEndpointKind,
  type DataDeviceReadResult,
  type EditorDataService
} from "@ek-aiot/3d-editor-core";

interface DeviceRequestSource {
  service: Readonly<Ref<EditorDataService | undefined>>;
  revision: Readonly<Ref<string>>;
}

export function useDeviceEndpoint<Kind extends DataDeviceEndpointKind>(
  source: DeviceRequestSource,
  connection: () => DataConnection | undefined,
  kind: Kind,
  refresh: () => number = () => 0
) {
  const result = shallowRef<DataDeviceReadResult<Kind>>();
  watch([source.service, source.revision, () => JSON.stringify(connection()), refresh],
    ([service], _, cleanup) => {
      result.value = undefined;
      const current = connection();
      if (current) cleanup(startDeviceEndpoint(service, current, kind, (next) => { result.value = next; }));
    }, { immediate: true });
  return result;
}

export function startDeviceEndpoint<Kind extends DataDeviceEndpointKind>(
  service: EditorDataService | undefined,
  connection: DataConnection,
  kind: Kind,
  receive: (result: DataDeviceReadResult<Kind>) => void
): () => void {
  if (!service?.readDeviceEndpoint) {
    receive({ ok: false, message: "The editor does not provide device requests." });
    return () => {};
  }
  const method = connection.deviceEndpoints?.[kind]?.method;
  if (!method) {
    receive({ ok: false, message: "This device endpoint is not configured." });
    return () => {};
  }

  const readEndpoint = service.readDeviceEndpoint.bind(service);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const read = async () => {
    const result = await readEndpoint(connection.id, kind, controller.signal);
    if (controller.signal.aborted) return;
    receive(result);
    if (kind === "deviceRealtime" && method === "GET") {
      timer = setTimeout(() => { void read(); }, DEFAULT_DATA_QUERY_REFRESH_INTERVAL_MS);
    }
  };
  void read();
  return () => {
    controller.abort();
    clearTimeout(timer);
  };
}
