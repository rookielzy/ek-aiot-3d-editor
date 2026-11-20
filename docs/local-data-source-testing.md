# 使用 local-data-source-server 做本地测试验证

`local-data-source-server` 是基于 `node:http` 的本地测试服务，用于手动验证标准设备列表和设备实时数据。工作台配置步骤见 [Demo 手把手引导](./local-data-source-demo-walkthrough.md)。

## 启动

在仓库根目录运行：

```bash
pnpm dev:data-source
```

等价命令为 `node scripts/local-data-source-server.mjs`。默认地址是 `http://127.0.0.1:4310`。`GET /health` 返回 `{"status":"ok","service":"local-data-source"}`。修改脚本后需重启服务。

可通过 `DATA_SOURCE_PORT` 和 `DATA_SOURCE_HOST` 覆盖端口和监听地址。以下 PowerShell 示例将端口改为 `4311`：

```powershell
$env:DATA_SOURCE_PORT = "4311"
pnpm dev:data-source
```

React 和 Vue demo 的 `/local-api` 代理默认转发到 `http://127.0.0.1:4310`。如果改了服务端口，可以使用直连地址，或同步修改相应 demo 的 Vite 代理目标。[React 代理配置](../examples/react-proof-loop/vite.config.ts) · [Vue 代理配置](../examples/vue-proof-loop/vite.config.ts)

## 标准接口

| 方法 | 路径 | 成功响应 |
| --- | --- | --- |
| `GET` | `/api/devices` | 顶层数组，每项含 `deviceId` 和 `deviceName` |
| `GET` | `/api/devices/realtime` | 顶层数组，每项含 `deviceId`、`runningStatus`、`runningStatusEnum` 和 `data` |

两个接口使用相同的设备 ID。实时响应中的 `pump-1` 使用状态码 `42`（运行中）和当前采样时间。`pump-2` 使用状态码 `17`（离线），温度仍返回上次读数 `24.8 °C`，开关值返回 `null`，采样时间在服务启动时固定为 15 分钟前。状态码和离线返回值均由这个本地后端定义。[接口字段和完整示例](../.scratch/iot-device-api/spec.md)

响应使用 JSON、`Cache-Control: no-store` 和 `Access-Control-Allow-Origin: *`。跨域预检 `OPTIONS` 返回 `204`，允许 `Content-Type` 和 `X-Api-Key` 请求头。

## 测试场景

两个标准接口均支持 `scenario` 查询参数。每次请求使用一个场景。

| 场景值 | HTTP 状态 | 结果 |
| --- | --- | --- |
| `empty` | `200` | 返回 `[]`。工作台显示成功和 `0 条记录` |
| `missing-field` | `200` | 设备列表缺少 `deviceName`，实时数据缺少 `data`。工作台提示对应字段不符合接口规范 |
| `slow` | `200` | 延时约 1.5 秒后正常返回。连接超时设为 1 秒时可复现超时 |
| `http-500` | `500` | 返回 `{"error":"simulated-server-error"}` |
| `auth-required` | `401` 或 `200` | 缺少或填错 `X-Api-Key` 时返回 401，固定测试值 `local-fixture-key` 可通过 |

兼作通用请求调试的 `GET /api/devices/:code` 返回单台模拟设备，`POST /api/query` 接收 JSON 并回显请求体。POST 的 `business-error` 场景返回业务码 `7`，空或无效的请求体返回 HTTP 400。

## 命令行验证

以下命令可在 Windows PowerShell 运行，其他终端可以用 `curl`：

```powershell
curl.exe -sS http://127.0.0.1:4310/health
curl.exe -sS http://127.0.0.1:4310/api/devices
curl.exe -sS http://127.0.0.1:4310/api/devices/realtime
curl.exe -sS "http://127.0.0.1:4310/api/devices?scenario=empty"
curl.exe -sSi "http://127.0.0.1:4310/api/devices/realtime?scenario=missing-field"
curl.exe -sSi "http://127.0.0.1:4310/api/devices/realtime?scenario=http-500"
curl.exe -sSi "http://127.0.0.1:4310/api/devices?scenario=auth-required"
curl.exe -sSi -H "X-Api-Key: local-fixture-key" "http://127.0.0.1:4310/api/devices?scenario=auth-required"
```

通过命令行访问时，可以把查询参数写在 URL 中。在工作台里，请求路径填写 `/api/devices` 或 `/api/devices/realtime`，`scenario` 在请求参数区域配置。
