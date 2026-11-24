import { useEffect, useState } from "react";
import {
  formatDeviceRealtimeField,
  type DataDeviceListItem,
  type Transform
} from "@ek-aiot/3d-editor-core";
import { useDeviceEndpoint } from "../hooks/use-device-endpoint";
import { resolveDataDisplayMessage } from "../i18n/data-display-i18n";
import type { ResolvedWorkbenchContext } from "../hooks/use-workbench";
import type { DataDisplayRealtimeContext } from "../hooks/use-data-display-realtime";
import { InspectorColorInput } from "./InspectorColorInput";
import { InspectorNumberInput } from "./InspectorNumberInput";
import { Button } from "./ui/Button";
import { DeviceMultiSelect } from "./ui/DeviceMultiSelect";
import { WorkbenchSelect } from "./ui/WorkbenchSelect";
import "./data-display.css";

const numericStyleFields = ["width", "height", "fontSize"] as const;
const colorStyleFields = ["backgroundColor", "borderColor", "textColor"] as const;
const axes = ["X", "Y", "Z"] as const;

export function DataDisplayInspector({ context, data, active }: {
  context: ResolvedWorkbenchContext;
  data: DataDisplayRealtimeContext;
  active: boolean;
}) {
  const { editor, snapshot, i18n } = context;
  const t = resolveDataDisplayMessage.bind(null, i18n);
  const connections = Object.values(snapshot.dataSources.connections).filter((connection) =>
    connection.deviceEndpoints?.deviceList && connection.deviceEndpoints.deviceRealtime);
  const [preferredConnection, setPreferredConnection] = useState("");
  const [selections, setSelections] = useState<ReadonlyMap<string, DataDeviceListItem[]>>(() => new Map());
  const [listRefresh, setListRefresh] = useState(0);
  const [commandError, setCommandError] = useState<string>();
  const connection = connections.find((candidate) => candidate.id === preferredConnection) ?? connections[0];
  const connectionId = connection?.id ?? "";
  const selectionsForConnection = selections.get(connectionId) ?? [];
  const list = useDeviceEndpoint(data.service, active ? connection : undefined, "deviceList", listRefresh);
  const realtime = data.getResult(connectionId);
  const browsingConnection = active && selectionsForConnection.length ? connectionId : null;
  useEffect(() => {
    data.browse(browsingConnection);
    return () => data.browse(null);
  }, [data.browse, browsingConnection]);
  const card = data.cards.find((item) => item.id === snapshot.selection.nodeId);
  const cardConnection = card ? snapshot.dataSources.connections[card.source.connectionId] : undefined;
  const cardRealtime = card ? data.getResult(card.source.connectionId) : undefined;
  const cardValue = card && cardRealtime?.ok
    ? formatDeviceRealtimeField(cardRealtime.devices.get(card.source.deviceId), card.source.fieldKey)
    : null;
  const feedback = context.viewportHelpers.state.snapFeedback;
  const position = card && feedback.nodeId === card.id && feedback.mode === "translate"
    ? feedback.snapped ?? feedback.preview ?? card.transform.position : card?.transform.position;

  function commit(command: Parameters<typeof editor.dispatch>[0]): boolean {
    const result = editor.dispatch(command);
    setCommandError(result.ok ? undefined : result.error);
    return result.ok;
  }

  return (
    <div className="ek-data-display">
      {connections.length ? (
        <>
          <div className="ek-data-display-row">
            <span>{t("dataDisplay.source")}</span>
            <WorkbenchSelect aria-label={t("dataDisplay.source")} value={connectionId}
              options={connections.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setPreferredConnection} />
          </div>
          {list?.ok ? (
            <>
              <DeviceMultiSelect key={connectionId} items={list.records} value={selectionsForConnection}
                label={t("dataDisplay.search")} empty={t("dataDisplay.noDevices")}
                onChange={(selection) => setSelections((previous) => new Map(previous).set(connectionId, selection))} />
              {selectionsForConnection.length > 0 ? (
                <div className="ek-data-display-row">
                  <span role="status">{t("dataDisplay.selected", { count: selectionsForConnection.length })}</span>
                  <Button onClick={() => data.refresh(connectionId)}>{t("dataDisplay.refresh")}</Button>
                </div>
              ) : null}
            </>
          ) : list ? (
            <div className="ek-data-display-row">
              <span role="alert">{t("dataDisplay.loadFailed", { detail: list.message })}</span>
              <Button onClick={() => setListRefresh((value) => value + 1)}>{t("dataDisplay.retry")}</Button>
            </div>
          ) : <p role="status">{t("dataDisplay.loadingDevices")}</p>}
        </>
      ) : <p>{t("dataDisplay.configureSource")}</p>}
      {selectionsForConnection.length && !realtime ? <p role="status">{t("dataDisplay.loadingRealtime")}</p> : null}
      {selectionsForConnection.length && realtime && !realtime.ok
        ? <p role="alert">{t("dataDisplay.loadFailed", { detail: realtime.message })}</p> : null}
      {realtime?.ok ? selectionsForConnection.map((entry) => {
        const device = realtime.devices.get(entry.deviceId);
        const fields = device ? [
          { key: null, label: t("dataDisplay.runningStatus") },
          ...device.data.map((field) => ({ key: field.key, label: field.desc }))
        ] : [];
        return (
          <section key={entry.deviceId} className="ek-data-display-section">
            <div className="ek-data-display-row"><strong>{entry.deviceName}</strong><small>{entry.deviceId}</small></div>
            {device ? fields.map((field) => {
              const exists = data.cards.some((item) => item.source.connectionId === connectionId &&
                item.source.deviceId === entry.deviceId && item.source.fieldKey === field.key);
              return (
                <div key={JSON.stringify(field.key)} className="ek-data-display-row">
                  <span>{field.label} · {formatDeviceRealtimeField(device, field.key) ?? "—"}</span>
                  <Button disabled={exists} aria-label={t("dataDisplay.addField", { field: field.label })}
                    onClick={() => commit({
                      type: "create-data-display",
                      source: { connectionId, deviceId: entry.deviceId, fieldKey: field.key },
                      name: `${entry.deviceName} · ${field.label}`,
                      position: [0, data.cards.length * 0.7, 0]
                    })}>{exists ? t("dataDisplay.added") : t("dataDisplay.add")}</Button>
                </div>
              );
            }) : <p>{t("dataDisplay.noRealtime")}</p>}
          </section>
        );
      }) : null}
      <section className="ek-data-display-section" aria-label={t("dataDisplay.cards")}>
        <strong>{t("dataDisplay.cards")}</strong>
        {data.cards.length ? data.cards.map((item) => (
          <div key={item.id} className="ek-data-display-row">
            <Button className="ek-data-display-card-select" aria-pressed={item.id === card?.id}
              onClick={() => commit({ type: "select-node", nodeId: item.id })}>{item.name}</Button>
            <Button aria-label={t("dataDisplay.removeCard", { name: item.name })}
              onClick={() => commit({ type: "delete-nodes", nodeIds: [item.id] })}>{t("dataDisplay.remove")}</Button>
          </div>
        )) : <p>{t("dataDisplay.noCards")}</p>}
      </section>
      {card && position ? (
        <section key={card.id} className="ek-data-display-section" aria-label={t("dataDisplay.style")}>
          <div className="ek-data-display-row">
            <strong>{card.name}</strong>
            {cardConnection?.deviceEndpoints?.deviceRealtime
              ? <Button onClick={() => data.refresh(card.source.connectionId)}>{t("dataDisplay.refresh")}</Button> : null}
          </div>
          {cardRealtime && !cardRealtime.ok
            ? <p role="alert">{t("dataDisplay.loadFailed", { detail: cardRealtime.message })}</p>
            : <p>{cardConnection ? cardValue ?? "—" : t("dataDisplay.sourceUnavailable")}</p>}
          {numericStyleFields.map((field) => (
            <label key={field} className="ek-data-display-row">
              <span>{t(`dataDisplay.${field}`)}</span>
              <InspectorNumberInput aria-label={t(`dataDisplay.${field}`)} min={1} max={2048} step={1} value={card.style[field]}
                onCommit={(raw) => raw.trim() !== "" && commit({
                  type: "update-data-display-style", nodeId: card.id, style: { [field]: Number(raw) }
                })} />
            </label>
          ))}
          {colorStyleFields.map((field) => (
            <div key={field} className="ek-data-display-row">
              <span>{t(`dataDisplay.${field}`)}</span>
              <InspectorColorInput aria-label={t(`dataDisplay.${field}`)} value={card.style[field]} i18n={i18n}
                onCommit={(value) => commit({
                  type: "update-data-display-style", nodeId: card.id,
                  style: { [field]: value }
                })} />
            </div>
          ))}
          <strong>{t("dataDisplay.position")}</strong>
          <div className="ek-data-display-position">
            {axes.map((axis, index) => (
              <label key={axis}>
                {axis}
                <InspectorNumberInput aria-label={axis} step="any" value={position[index]!}
                  onCommit={(raw) => {
                    if (raw.trim() === "" || !Number.isFinite(Number(raw))) return false;
                    const next: Transform["position"] = [...card.transform.position];
                    next[index] = Number(raw);
                    return commit({ type: "set-node-transform", nodeId: card.id, transform: { position: next } });
                  }} />
              </label>
            ))}
          </div>
        </section>
      ) : null}
      {commandError ? <p role="alert">{commandError}</p> : null}
    </div>
  );
}
