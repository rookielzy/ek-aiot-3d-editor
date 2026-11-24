// Combobox composition adapted from shadcn/ui (MIT): https://ui.shadcn.com/docs/components/base/combobox
import { Combobox } from "@base-ui/react/combobox";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { useRef, useState, type CSSProperties, type RefObject } from "react";
import type { DataDeviceListItem } from "@ek-aiot/3d-editor-core";
import { getPortalTheme } from "./Popover";
import { Input } from "./Input";

type DeviceVirtualizer = Virtualizer<HTMLDivElement, Element>;

export function DeviceMultiSelect({ items, value, onChange, label, empty }: {
  items: readonly DataDeviceListItem[];
  value: DataDeviceListItem[];
  onChange(value: DataDeviceListItem[]): void;
  label: string;
  empty: string;
}) {
  const virtualizer = useRef<DeviceVirtualizer | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<CSSProperties>();
  return (
    <Combobox.Root items={items} value={value} multiple virtualized openOnInputClick
      onValueChange={(next, event) => {
        if (event.reason === "escape-key") {
          event.cancel();
          return;
        }
        onChange(next);
      }}
      itemToStringLabel={(device) => device.deviceName}
      itemToStringValue={(device) => device.deviceId}
      isItemEqualToValue={(device, selected) => device.deviceId === selected.deviceId}
      onOpenChange={(open) => {
        if (open) setTheme(getPortalTheme(input.current));
      }}
      filter={(device, query) => {
        const search = query.trim().toLocaleLowerCase();
        return device.deviceName.toLocaleLowerCase().includes(search) || device.deviceId.toLocaleLowerCase().includes(search);
      }}
      onItemHighlighted={(device, event) => {
        if (device && event.reason !== "pointer") virtualizer.current?.scrollToIndex(event.index, { align: "auto" });
      }}>
      <Combobox.Input render={<Input ref={input} />} aria-label={label} placeholder={label} />
      <Combobox.Portal>
        <Combobox.Positioner className="ek-device-select-positioner" sideOffset={4} collisionPadding={8}>
          <Combobox.Popup className="ek-ui-scope ek-ui-popup ek-ui-popover ek-device-select-popup" style={theme}>
            <Combobox.Empty className="ek-device-select-empty">{empty}</Combobox.Empty>
            <Combobox.List>
              <DeviceOptions virtualizer={virtualizer} />
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

function DeviceOptions({ virtualizer }: { virtualizer: RefObject<DeviceVirtualizer | null> }) {
  const items = Combobox.useFilteredItems<DataDeviceListItem>();
  const scroll = useRef<HTMLDivElement>(null);
  const rows = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 34,
    getItemKey: (index) => items[index]!.deviceId,
    overscan: 6
  });
  virtualizer.current = rows;
  return (
    <div className="ek-device-select-scroll" ref={scroll}>
      <div role="presentation" style={{ position: "relative", height: rows.getTotalSize() }}>
        {rows.getVirtualItems().map((row) => {
          const item = items[row.index]!;
          return (
            <Combobox.Item key={row.key} value={item} index={row.index} className="ek-device-select-option"
              aria-posinset={row.index + 1} aria-setsize={items.length}
              style={{ height: row.size, transform: `translateY(${row.start}px)` }}>
              <span className="ek-device-select-check" aria-hidden="true"><Combobox.ItemIndicator>✓</Combobox.ItemIndicator></span>
              <span className="ek-device-select-name">{item.deviceName}</span>
              <small className="ek-device-select-id">{item.deviceId}</small>
            </Combobox.Item>
          );
        })}
      </div>
    </div>
  );
}
