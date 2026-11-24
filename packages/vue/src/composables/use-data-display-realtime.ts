import { computed, onScopeDispose, ref, shallowReactive, watch, watchEffect } from "vue";
import { formatDeviceRealtimeField, type DataDeviceRealtimeItem, type Problem, type SceneDataDisplayNode } from "@ek-aiot/3d-editor-core";
import { startDeviceEndpoint } from "./use-device-endpoint";
import type { UseWorkbenchResult } from "./use-workbench";

type RealtimeResult = { ok: true; devices: ReadonlyMap<string, DataDeviceRealtimeItem> } | { ok: false; message: string };

export function useDataDisplayRealtime(workbench: Pick<UseWorkbenchResult, "editor" | "snapshot" | "runtime" | "dataServiceState">) {
  const service = computed(() => workbench.editor.getDataService?.());
  const revision = ref("");
  watch([service, workbench.dataServiceState], ([currentService]) => {
    revision.value = `${currentService?.getAuthRevision() ?? 0}:${currentService?.getDeviceReadRevision?.() ?? 0}`;
  }, { immediate: true });
  const cards = computed(() => Object.values(workbench.snapshot.value.nodes)
    .filter((node): node is SceneDataDisplayNode => node.kind === "data-display"));
  const browsing = ref<string | null>(null);
  const refreshes = shallowReactive(new Map<string, number>());
  const results = shallowReactive(new Map<string, RealtimeResult>());
  const requests = new Map<string, { key: string; cancel(): void }>();
  const activeConnections = computed(() => {
    const ids = new Set(cards.value.map((card) => card.source.connectionId));
    if (browsing.value) ids.add(browsing.value);
    return [...ids].flatMap((id) => {
      const connection = workbench.snapshot.value.dataSources.connections[id];
      return connection ? [{ connection, key: JSON.stringify([connection, revision.value, refreshes.get(id)]) }] : [];
    });
  });

  watch([service, activeConnections], ([currentService, connections], [previousService]) => {
    const nextKeys = new Map(connections.map((entry) => [entry.connection.id, entry.key]));
    for (const [id, request] of requests) {
      if (currentService === previousService && nextKeys.get(id) === request.key) continue;
      request.cancel();
      requests.delete(id);
      results.delete(id);
    }
    for (const entry of connections) {
      const id = entry.connection.id;
      if (requests.has(id)) continue;
      const cancel = startDeviceEndpoint(currentService, entry.connection, "deviceRealtime", (result) => {
        results.set(id, result.ok ? { ok: true, devices: new Map(result.records.map((device) => [device.deviceId, device])) } : result);
      });
      requests.set(id, { key: entry.key, cancel });
    }
  }, { immediate: true });
  onScopeDispose(() => {
    for (const request of requests.values()) request.cancel();
  });

  watchEffect(() => {
    const runtime = workbench.runtime.value;
    if (!runtime?.setDataDisplayValues) return;
    const values = new Map<string, string>();
    const problems = new Map<string, Problem>();
    const snapshot = workbench.snapshot.value;
    for (const card of cards.value) {
      const source = card.source;
      const result = results.get(source.connectionId);
      const value = formatDeviceRealtimeField(
        result?.ok ? result.devices.get(source.deviceId) : undefined, source.fieldKey, { includeUnit: false }
      );
      if (value !== null) values.set(card.id, value);
      const connection = snapshot.dataSources.connections[source.connectionId];
      const message = result?.ok === false ? result.message : connection ? undefined : "The card's data source is unavailable.";
      if (message && !problems.has(source.connectionId)) {
        problems.set(source.connectionId, {
          id: `data-display-request:${source.connectionId}`,
          code: "data-display-request",
          severity: "warning",
          source: "data",
          target: { kind: "scene", sceneId: snapshot.scene.id },
          recoverability: "user-action",
          message,
          display: { title: connection?.name ?? source.connectionId, detail: message }
        });
      }
    }
    runtime.setDataDisplayValues(values, [...problems.values()]);
  });

  return {
    cards,
    service,
    revision,
    getResult: (id: string) => results.get(id),
    browse: (id: string | null) => { browsing.value = id; },
    refresh: (id: string) => { refreshes.set(id, (refreshes.get(id) ?? 0) + 1); }
  };
}

export type DataDisplayRealtimeContext = ReturnType<typeof useDataDisplayRealtime>;
