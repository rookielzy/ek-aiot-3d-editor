# 物联网设备数据源接口规范

本规范定义 3D 组态编辑器接入设备列表和设备实时数据时使用的 HTTP JSON 成功响应。新数据源直接使用本规范，标准字段取代原有字段映射与转换配置，旧字段映射的兼容和迁移均无需实现。接口路径、请求参数和鉴权由接入方约定。

两个接口的响应体都是顶层 JSON 数组，查询结果为空时返回 `[]`。字段表中的可选字段可以省略。设备列表用于在组态中选择设备，实时数据用于显示状态和属性值，以及配置基于状态或属性的颜色规则。

## 设备列表

数组中的每一项代表一台设备。

| 字段 | 类型 | 必填 | 约定 |
| --- | --- | --- | --- |
| `deviceId` | 字符串 | 是 | 非空，在同一数据源内唯一且稳定。实时数据接口使用完全相同的 ID。 |
| `deviceName` | 字符串 | 是 | 非空的设备显示名称，可以修改或重名。 |
| `ext` | JSON 对象 | 否 | 业务开发者自定义的设备扩展信息。 |

### 设备列表响应示例

```json
[
  {
    "deviceId": "pump-01",
    "deviceName": "一号水泵",
    "ext": { "location": "北区泵房" }
  },
  {
    "deviceId": "pump-02",
    "deviceName": "二号水泵"
  }
]
```

## 设备实时数据

同一次响应中，每个 `deviceId` 最多出现一次。

| 字段 | 类型 | 必填 | 约定 |
| --- | --- | --- | --- |
| `deviceId` | 字符串 | 是 | 与设备列表中的 ID 一致。 |
| `runningStatus` | 整数 | 是 | 设备当前状态码，码值和含义由后端定义。 |
| `runningStatusEnum` | 状态枚举项数组 | 是 | 每项包含必填的 `value`（整数）和 `desc`（非空显示文案）。`value` 在数组内唯一，且数组包含当前 `runningStatus` 对应的枚举项。 |
| `data` | 设备属性数组 | 是 | 本次返回的属性，可以返回 `[]`。 |
| `observedAt` | 字符串 | 否 | 本批属性值的实际采样时间，使用带时区的 ISO 8601 格式。 |

### 设备属性

| 字段 | 类型 | 必填 | 约定 |
| --- | --- | --- | --- |
| `key` | 字符串 | 是 | 非空，在设备内唯一且稳定。编辑器保存 `key` 作为属性绑定的标识。 |
| `valueType` | `"number"`、`"boolean"` 或 `"string"` | 是 | 属性的值类型。 |
| `value` | 数字、布尔值、字符串或 `null` | 是 | 有值时必须与 `valueType` 一致，数值必须有限。`null` 表示本次该属性无值。`0`、`false` 和空字符串都是有效值。 |
| `desc` | 字符串 | 是 | 非空的属性显示名称，可以修改。 |
| `unit` | 字符串 | 否 | 数值属性的显示单位，例如 `°C`。 |
| `valueEnum` | 属性枚举项数组 | 否 | 每项包含必填的 `value` 和 `desc`。`value` 与 `valueType` 一致且在数组内唯一，`desc` 为非空显示文案。 |
| `ext` | JSON 对象 | 否 | 业务开发者自定义的属性扩展信息。 |

### 状态与离线返回

- 后端决定有哪些设备状态，以及每个状态的整数码值和显示文案。`runningStatusEnum` 提供这些码值与文案的对应关系，编辑器据此显示当前状态。
- 设备离线时仍使用同一响应结构。后端决定本次是否返回该设备、包含哪些属性，以及每个属性的 `value`。可以返回最后一次读数、显式返回 `null`、省略部分属性，或返回 `data: []`。已返回的属性仍须包含全部必填字段。
- 编辑器使用匹配的枚举文案显示状态和属性，未配置对应文案的属性直接显示原始值。颜色规则比较响应中的原始状态码或属性值。设备或属性未出现在响应里时，表示本次未返回对应数据。整次请求失败属于请求结果，设备状态来自成功响应中的 `runningStatus`。

### 实时数据响应示例

一号水泵正在运行。二号水泵使用后端定义的离线状态码 `17`，温度返回最后一次读数，开关值返回 `null`。

```json
[
  {
    "deviceId": "pump-01",
    "runningStatus": 42,
    "runningStatusEnum": [
      { "value": 17, "desc": "离线" },
      { "value": 42, "desc": "运行中" }
    ],
    "observedAt": "2026-11-20T14:00:00Z",
    "data": [
      {
        "key": "temperature",
        "valueType": "number",
        "value": 24.6,
        "desc": "温度",
        "unit": "°C",
        "ext": { "sensorChannel": "T1" }
      },
      {
        "key": "power",
        "valueType": "boolean",
        "value": true,
        "desc": "开关状态",
        "valueEnum": [
          { "value": true, "desc": "开启" },
          { "value": false, "desc": "关闭" }
        ]
      },
      {
        "key": "mode",
        "valueType": "string",
        "value": "auto",
        "desc": "工作模式"
      }
    ]
  },
  {
    "deviceId": "pump-02",
    "runningStatus": 17,
    "runningStatusEnum": [
      { "value": 17, "desc": "离线" },
      { "value": 42, "desc": "运行中" }
    ],
    "observedAt": "2026-11-20T13:48:30Z",
    "data": [
      {
        "key": "temperature",
        "valueType": "number",
        "value": 12.2,
        "desc": "温度",
        "unit": "°C"
      },
      {
        "key": "power",
        "valueType": "boolean",
        "value": null,
        "desc": "开关状态"
      }
    ]
  }
]
```
