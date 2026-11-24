import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatDeviceRealtimeField,
  type DataConnection,
  type DataDeviceRealtimeItem,
  type Editor,
  type EditorDataService,
  type Problem,
  type SceneDataDisplayNode,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import { useDeviceEndpoint } from "./use-device-endpoint";

type RealtimeResult = { ok: true; devices: ReadonlyMap<string, DataDeviceRealtimeItem> } | { ok: false; message: string };

export function useDataDisplayRealtime(editor: Editor, snapshot: SceneSnapshot) {
  const [browsing, setBrowsing] = useState<{ editor: Editor; connectionId: string } | null>(null);
  const [refreshes, setRefreshes] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [results, setResults] = useState<ReadonlyMap<string, {
    service: EditorDataService | undefined; key: string; result: RealtimeResult;
  }>>(() => new Map());
  const service = editor.getDataService?.();
  const cards = useMemo(() =>
    Object.values(snapshot.nodes).filter((node): node is SceneDataDisplayNode => node.kind === "data-display"), [snapshot.nodes]);
  const activeConnections = new Set(cards.map((card) => card.source.connectionId));
  if (browsing?.editor === editor) activeConnections.add(browsing.connectionId);
  const receive = useCallback((id: string, key: string, result: RealtimeResult | undefined) => {
    setResults((previous) => {
      if (!result && previous.get(id)?.key !== key) return previous;
      const next = new Map(previous);
      if (result) next.set(id, { service, key, result });
      if (!result) next.delete(id);
      return next;
    });
  }, [service]);
  const browse = useCallback((connectionId: string | null) => {
    setBrowsing(connectionId === null ? null : { editor, connectionId });
  }, [editor]);
  const refresh = useCallback((id: string) => {
    setRefreshes((previous) => new Map(previous).set(id, (previous.get(id) ?? 0) + 1));
  }, []);
  const connectionMap = snapshot.dataSources.connections;
  const getResult = useCallback((id: string) => {
    const entry = results.get(id);
    return entry && entry.service === service && entry.key === JSON.stringify(connectionMap[id]) ? entry.result : undefined;
  }, [connectionMap, results, service]);

  useEffect(() => {
    const values = new Map<string, string>();
    const problems = new Map<string, Problem>();
    for (const card of cards) {
      const source = card.source;
      const result = getResult(source.connectionId);
      const value = formatDeviceRealtimeField(
        result?.ok ? result.devices.get(source.deviceId) : undefined, source.fieldKey, { includeUnit: false }
      );
      if (value !== null) values.set(card.id, value);
      const message = result?.ok === false ? result.message
        : connectionMap[source.connectionId] ? undefined : "The card's data source is unavailable.";
      if (message && !problems.has(source.connectionId)) {
        problems.set(source.connectionId, {
          id: `data-display-request:${source.connectionId}`,
          code: "data-display-request",
          severity: "warning",
          source: "data",
          target: { kind: "scene", sceneId: snapshot.scene.id },
          recoverability: "user-action",
          message,
          display: { title: connectionMap[source.connectionId]?.name ?? source.connectionId, detail: message }
        });
      }
    }
    const details = [...problems.values()];
    const sync = () => editor.getRuntime()?.setDataDisplayValues?.(values, details);
    sync();
    return editor.subscribeRuntime(sync);
  }, [cards, connectionMap, editor, getResult, snapshot.scene.id]);

  const readers = [...activeConnections].flatMap((id) => {
    const connection = connectionMap[id];
    return connection ? [<RealtimeDeviceRead key={id} service={service} connection={connection}
      refresh={refreshes.get(id)} receive={receive} />] : [];
  });
  return { cards, service, getResult, browse, refresh, readers };
}

function RealtimeDeviceRead({ service, connection, refresh, receive }: {
  service: EditorDataService | undefined;
  connection: DataConnection;
  refresh: number | undefined;
  receive(id: string, key: string, result: RealtimeResult | undefined): void;
}) {
  const response = useDeviceEndpoint(service, connection, "deviceRealtime", refresh);
  const result = useMemo<RealtimeResult | undefined>(() => response?.ok
    ? { ok: true, devices: new Map(response.records.map((device) => [device.deviceId, device])) }
    : response, [response]);
  const key = JSON.stringify(connection);
  useEffect(() => {
    receive(connection.id, key, result);
    return () => receive(connection.id, key, undefined);
  }, [connection.id, key, receive, result]);
  return null;
}

export type DataDisplayRealtimeContext = ReturnType<typeof useDataDisplayRealtime>;
