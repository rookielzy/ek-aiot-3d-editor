import type { WorkbenchI18n, WorkbenchMessageValues } from "./workbench-i18n";

const EN_MESSAGES = {
  "dataDisplay.section": "Data display",
  "dataDisplay.source": "Data source",
  "dataDisplay.sourceUnavailable": "This card’s data source is unavailable.",
  "dataDisplay.configureSource": "Configure the device list and realtime endpoints in Data Sources.",
  "dataDisplay.search": "Search devices",
  "dataDisplay.noDevices": "No matching devices",
  "dataDisplay.selected": "{count} selected",
  "dataDisplay.refresh": "Refresh values",
  "dataDisplay.retry": "Retry",
  "dataDisplay.loadingDevices": "Loading devices…",
  "dataDisplay.loadingRealtime": "Loading live values…",
  "dataDisplay.loadFailed": "Could not load device data. {detail}",
  "dataDisplay.noRealtime": "No live data returned for this device.",
  "dataDisplay.runningStatus": "Running status",
  "dataDisplay.addField": "Add {field} to canvas",
  "dataDisplay.add": "Add",
  "dataDisplay.added": "Added",
  "dataDisplay.cards": "Canvas cards",
  "dataDisplay.noCards": "No data cards on the canvas.",
  "dataDisplay.style": "Card settings",
  "dataDisplay.removeCard": "Remove {name}",
  "dataDisplay.remove": "Remove",
  "dataDisplay.width": "Width (px)",
  "dataDisplay.height": "Height (px)",
  "dataDisplay.fontSize": "Font size (px)",
  "dataDisplay.backgroundColor": "Background",
  "dataDisplay.borderColor": "Border",
  "dataDisplay.textColor": "Text color",
  "dataDisplay.position": "World position",
};

const ZH_CN_MESSAGES = {
  "dataDisplay.section": "数据展示配置",
  "dataDisplay.source": "数据源",
  "dataDisplay.sourceUnavailable": "此卡片的数据源不可用。",
  "dataDisplay.configureSource": "请在数据源管理中配置设备列表和实时数据接口。",
  "dataDisplay.search": "搜索设备名称或 ID",
  "dataDisplay.noDevices": "没有匹配的设备",
  "dataDisplay.selected": "已选 {count} 台设备",
  "dataDisplay.refresh": "刷新数据",
  "dataDisplay.retry": "重试",
  "dataDisplay.loadingDevices": "正在加载设备…",
  "dataDisplay.loadingRealtime": "正在加载实时数据…",
  "dataDisplay.loadFailed": "读取设备数据失败。{detail}",
  "dataDisplay.noRealtime": "本次未返回此设备的实时数据。",
  "dataDisplay.runningStatus": "运行状态",
  "dataDisplay.addField": "将{field}添加到画布",
  "dataDisplay.add": "添加",
  "dataDisplay.added": "已添加",
  "dataDisplay.cards": "画布卡片",
  "dataDisplay.noCards": "画布中还没有数据卡片。",
  "dataDisplay.style": "卡片配置",
  "dataDisplay.removeCard": "移除{name}",
  "dataDisplay.remove": "移除",
  "dataDisplay.width": "宽度（像素）",
  "dataDisplay.height": "高度（像素）",
  "dataDisplay.fontSize": "字号（像素）",
  "dataDisplay.backgroundColor": "背景色",
  "dataDisplay.borderColor": "边框色",
  "dataDisplay.textColor": "字体颜色",
  "dataDisplay.position": "世界坐标",
} satisfies Record<keyof typeof EN_MESSAGES, string>;

export function resolveDataDisplayMessage(
  i18n: WorkbenchI18n, key: keyof typeof EN_MESSAGES, values?: WorkbenchMessageValues
): string {
  const messages = i18n.locale === "zh-CN" ? ZH_CN_MESSAGES : EN_MESSAGES;
  return i18n.t({ key: `reactWorkbench.${key}`, fallback: messages[key] }, values);
}
