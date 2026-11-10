# 使用 local-data-source-server 做本地测试验证

> 目标读者：需要在本地一键拉起 HTTP 数据源、端到端验证「连接 → 查询映射 → 对象绑定 → 数据预览」闭环的开发者。
> 本文只描述仓库里真实存在的能力：服务端脚本 `scripts/local-data-source-server.mjs`、Vite 的 `/local-api` 代理，以及 React/Vue proof-loop demo 的默认数据工作区。

## 1. 它是什么

`local-data-source-server` 是一个零依赖（只用 `node:http`）的本地假后端，用来给数据源功能提供**可预测**的 HTTP JSON 响应：

- 固定两条设备记录，字段为 `deviceCode` / `name` / `temperature` / `running`，`/api/devices` 还会附加 `observedAt`。
- 通过 URL 查询参数 `?scenario=...` 切换「空列表、缺字段、慢响应、HTTP 500、要求 API key、业务失败」等故障态。
- 固定输出 JSON 头与宽松 CORS 头，既能被 Vite 代理同源转发，也能被浏览器直接跨域访问。

它**不是**：

- 不是自动化测试夹具。浏览器测试用的是另一个 dev-only 同源夹具 `dataSourceHttpFixturePlugin()`（`scripts/vite-data-source-fixture.ts`，路径前缀 `/__fixtures__/http-data-source`），该夹具会回显请求的 path/query/headers/body，用于断言请求构造是否正确。本服务器不记录也不回显请求细节（只有 `POST /api/query` 会把 body 原样放进 `received`）。
- 不是生产服务。它没有持久化、没有鉴权校验逻辑之外的任何安全措施，只监听本机回环地址。

## 2. 启动

在**仓库根目录**执行：

```bash
pnpm dev:data-source
```

等价命令是 `node scripts/local-data-source-server.mjs`（根 `package.json` 的 `dev:data-source` 脚本）。

启动日志：

```
Local data source listening at http://127.0.0.1:4310
Scenarios: ?scenario=empty|missing-field|slow|http-500|auth-required|business-error
```

可用环境变量覆盖监听参数：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATA_SOURCE_PORT` | `4310` | 监听端口 |
| `DATA_SOURCE_HOST` | `127.0.0.1` | 监听地址，仅本机访问 |

```powershell
# Windows PowerShell
$env:DATA_SOURCE_PORT = "4311"; pnpm dev:data-source
```

```bash
# bash
DATA_SOURCE_PORT=4311 pnpm dev:data-source
```

> 改了端口后，示例的 `/local-api` 代理仍指向 `http://127.0.0.1:4310`（`examples/react-proof-loop/vite.config.ts` 与 `examples/vue-proof-loop/vite.config.ts` 第 10 行），需要同时改 `vite.config.ts` 里的 `target`。

服务没有热重载，改过脚本后需要重启进程。

## 3. 接口与响应

所有响应统一带：

```
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Content-Type, X-Api-Key
```

`OPTIONS` 任意路径都返回 `204`（用于跨域预检）。

### 3.1 路由表

| 方法 | 路径 | 正常响应 |
| --- | --- | --- |
| `GET` | `/health` | `200 { "status": "ok", "service": "local-data-source" }` |
| `GET` | `/api/devices` | `200 { "items": [{ deviceCode, name, temperature, running, observedAt }, ...] }` |
| `GET` | `/api/devices/:code` | 命中：`200 { deviceCode, name, temperature, running, observedAt }`；未命中：`404 { "error": "device-not-found" }` |
| `POST` | `/api/query` | `200 { "code": 0, "received": <请求 body>, "items": [...设备数组] }` |
| 其他 | 任意 | `404 { "error": "route-not-found" }` |

`POST /api/query` 的 body 必须是合法 JSON（空 body 也算非法），否则返回 `400 { "error": "invalid-json" }`。

固定设备数据：

```json
[
  { "deviceCode": "pump-1", "name": "Pump 1", "temperature": 26.4, "running": true },
  { "deviceCode": "pump-2", "name": "Pump 2", "temperature": 24.8, "running": false }
]
```

`observedAt` 是每次请求时的当前时间（ISO 8601 字符串）。

### 3.2 场景表

`?scenario=...` 对**任意路径**生效，并按下面的顺序判断：

| `scenario` | 生效条件 | 结果 |
| --- | --- | --- |
| `slow` | 任意路径 | 固定延时 `1500 ms` 后再走正常逻辑 |
| `http-500` | 任意路径 | `500 { "error": "simulated-server-error" }` |
| `auth-required` | 任意路径；请求头 `x-api-key` 不等于 `local-fixture-key` 时触发 | `401 { "error": "api-key-required" }` |
| `empty` | 仅 `GET /api/devices` | `200 { "items": [] }` |
| `missing-field` | 仅 `GET /api/devices` | `200 { "items": [{ "deviceCode": "pump-1" }] }`（缺 name / temperature / running / observedAt） |
| `business-error` | 仅 `POST /api/query` | `200 { "code": 7, "items": [] }` |

需要注意的边界：

- `empty` / `missing-field` 只拦 `GET /api/devices`，对 `/api/devices/pump-1`、`/api/query` 无效，会落到各自的正常分支。
- `business-error` 只拦 `POST /api/query`，对 `GET /api/devices` 无效。
- `slow`、`http-500`、`auth-required` 是全局的，会先于路由判断，所以 `/api/devices?scenario=http-500` 永远拿不到设备列表。
- `slow` 与 `http-500` 同时出现时，先延时 1500 ms 再返回 500。
- `auth-required` 的通关凭证是**固定字符串** `local-fixture-key`，请求头名 `x-api-key`（HTTP 头名大小写不敏感）。
- `POST /api/query` 会**先**读并校验 body，再判断 `business-error`；空 body 或非法 JSON 一律 `400 invalid-json`，拿不到业务失败响应。

### 3.3 场景叠加的实际行为（已实测）

| 请求 | 实测结果 |
| --- | --- |
| `GET /api/devices?scenario=http-500` | `500 {"error":"simulated-server-error"}` |
| `GET /api/devices?scenario=empty` | `200 {"items":[]}` |
| `GET /api/devices?scenario=missing-field` | `200 {"items":[{"deviceCode":"pump-1"}]}` |
| `GET /api/devices?scenario=auth-required` | `401 {"error":"api-key-required"}` |
| 同上 + 头 `x-api-key: local-fixture-key` | `200`，两条完整设备 |
| `GET /api/devices/nope` | `404 {"error":"device-not-found"}` |
| `POST /api/query` body `{"code":0}` | `200 {"code":0,"received":{"code":0},"items":[...]}` |
| `POST /api/query` 空 body | `400 {"error":"invalid-json"}`（**即使带 `scenario=business-error`**） |
| `POST /api/query` body `nope` | `400 {"error":"invalid-json"}` |
| `GET /api/nope` | `404 {"error":"route-not-found"}` |
| `OPTIONS /api/devices` | `204` |
| `GET /api/devices?scenario=slow` | 实测约 `1.54 s` |

`business-error` 只有在 body 是合法 JSON 时才生效：

```
curl.exe -s -X POST "http://127.0.0.1:4310/api/query?scenario=business-error" -H "Content-Type: application/json" -d "{}"
# 200 {"code":7,"items":[]}
```

## 4. 两种接入方式

### 4.1 走 Vite 代理（推荐用于 demo）

React / Vue proof-loop 的 Vite dev server 已配置代理：

```ts
// examples/react-proof-loop/vite.config.ts:10（vue-proof-loop 相同）
server: { proxy: { "/local-api": { target: "http://127.0.0.1:4310", rewrite: (path) => path.replace(/^\/local-api/, "") } } }
```

因此在 demo 里把连接的 **Service URL** 填成：

```
http://localhost:5173/local-api
```

（端口以实际 dev server 输出为准，默认 `5173`；Vue demo 同理。）

- 浏览器看到的是同源请求，没有跨域、没有预检、不需要改 CORS。
- 请求会被原样转发到本服务器：`/local-api/api/devices` → `http://127.0.0.1:4310/api/devices`。

### 4.2 浏览器直连（跨域）

直接在 Service URL 填 `http://127.0.0.1:4310` 也能工作，因为服务端对任意来源返回 `Access-Control-Allow-Origin: *`，并对预检返回 `204`。适合临时验证或非 Vite 宿主的页面。

两者差异只有网络路径，UI 行为完全一致。实际验证建议统一走 `/local-api`，避免把「代理没起来」和「服务器没起来」两类问题混在一起。

## 5. 手动验证（不启动 UI）

先用命令行确认服务本身是好的。

### 5.1 PowerShell（Windows）

```powershell
Invoke-RestMethod http://127.0.0.1:4310/health
Invoke-RestMethod http://127.0.0.1:4310/api/devices | ConvertTo-Json -Depth 5
Invoke-RestMethod http://127.0.0.1:4310/api/devices/pump-2 | ConvertTo-Json -Depth 5
Invoke-RestMethod "http://127.0.0.1:4310/api/devices?scenario=empty"
```

需要核对状态码时，Windows PowerShell 5.1 没有 `Invoke-WebRequest -SkipHttpErrorCheck`，直接用 `curl.exe` 最省事（PowerShell 里 `curl` 是 `Invoke-WebRequest` 的别名，务必写 `curl.exe` 或 `curl -s -i`）：

```powershell
curl.exe -s -i "http://127.0.0.1:4310/api/devices?scenario=http-500"                  # 500
curl.exe -s -i "http://127.0.0.1:4310/api/devices/nope"                                # 404
curl.exe -s -i "http://127.0.0.1:4310/api/devices?scenario=auth-required"              # 401
curl.exe -s -i -H "x-api-key: local-fixture-key" "http://127.0.0.1:4310/api/devices?scenario=auth-required"   # 200

curl.exe -s -X POST "http://127.0.0.1:4310/api/query" -H "Content-Type: application/json" -d "{\"code\":0}"
curl.exe -s -X POST "http://127.0.0.1:4310/api/query?scenario=business-error" -H "Content-Type: application/json" -d "{}"
```

> 注意：`business-error` 场景在读取 body **之后**才判断，所以 body 不合法时会先返回 `400 invalid-json`，必须带上合法的 JSON body 才能拿到 `{ "code": 7, "items": [] }`。

PowerShell 7+ 也可用 `Invoke-WebRequest "…?scenario=http-500" -SkipHttpErrorCheck | Select-Object StatusCode`。

### 5.2 curl

```bash
curl -s http://127.0.0.1:4310/health
curl -s http://127.0.0.1:4310/api/devices
curl -s -i "http://127.0.0.1:4310/api/devices?scenario=http-500"
curl -s -i "http://127.0.0.1:4310/api/devices?scenario=auth-required" -H "x-api-key: local-fixture-key"
curl -s -i "http://127.0.0.1:4310/api/devices?scenario=auth-required"
curl -s -X POST http://127.0.0.1:4310/api/query -H "Content-Type: application/json" -d '{"code":0}'
curl -s -X OPTIONS http://127.0.0.1:4310/api/devices -i   # 204
curl -s "http://127.0.0.1:4310/api/devices?scenario=slow" -o /dev/null -w "%{time_total}s\n"  # 约 1.5s
```

> 注意场景参数必须跟在**真正的请求路径**上。走代理时 URL 是 `/local-api/api/devices?scenario=empty`，浏览器截图里的地址栏看到代理前缀是正常的。

## 6. 在 demo 里端到端验证

以下步骤对 `examples/react-proof-loop` 与 `examples/vue-proof-loop` 通用；界面文案中英双语，括号里给中文。

### 6.1 准备

```bash
# 终端 1：假后端
pnpm dev:data-source

# 终端 2：demo（二选一）
pnpm dev:demo:react      # 等同 pnpm --filter @ek-aiot/react-proof-loop dev
pnpm dev:demo:vue
```

首次打开若为英文界面，顶部工具栏语言下拉切到 `zh-CN`（选择会写进 `localStorage` 的 `ek-aiot.workbench.locale`）。

### 6.2 建连接

1. 左栏导航切到 **Data（数据）**。
2. 点 **New connection（新建连接）**。
3. **Connection name**：`Local fixture`。
4. **Service URL**：`http://localhost:5173/local-api`（用实际 dev server 端口）。
5. **Authentication**：保持 **No authentication**。demo 的宿主没有凭证库，选 Bearer / API key 会在表单里提示 `The host provides no credentials…`，且不会注入任何密钥。
6. **Timeout (seconds)**：`5`（要试 `slow` 场景时保持 5 即可，1.5 s 延时能正常返回；把它改成 `1` 就能复现超时）。
7. **Save connection（保存连接）**。

列表行会显示连接名、认证方式（`No authentication`）、超时、查询数与绑定数。

### 6.3 用 Test request 验证连通性

在连接行上点 **Test request（测试请求）**，打开请求测试器：

- **Method**：`GET`
- **Request path**：`/health` → **Run request**。结果为 `Success`，`Status 200`，Parsed JSON 显示 `{ status: "ok", service: "local-data-source" }`。
- 再把 path 改成 `/api/devices` 并运行，能看到 `items` 两条记录，`observedAt` 是刚刚的时间。
- 想验证故障态时，把 path 写成 `/api/devices?scenario=http-500` 运行，应得到 `The service returned HTTP 500.`；`?scenario=slow` 会明显卡 1.5 s（`Request result` 里的毫秒数可佐证）。

> 请求测试器的响应、测试用参数覆盖只存在于当前窗口会话，不会写进场景快照或 `.ek3d`。

### 6.4 建查询与映射

在连接所在区域点 **New query（新建查询）**（或在查询列表里新建），打开查询配置：

**Request 段**

- **Query name（查询名称）**：`Devices`。
- **Method**：`GET`。若选 `POST`，必须勾选 **I confirm this POST only reads data**，否则保存或运行都会被拒；POST 查询只会在手动测试、首次预览和显式刷新时执行，不会自动轮询。
- **Request path**：`/api/devices`（故障演练时改成 `/api/devices?scenario=empty` 等）。
- **Refresh interval (seconds)**：如 `5`；**Expire after (seconds)**：如 `15`。两者共同决定数据何时变为 `Expired（已过期）`。
- **Parameters**：本次映射不需要参数。若要试 `/api/devices/{code}`，添加一个 string 参数 `code`，位置选 `Path`，默认值填 `pump-1`。
- **Success field path**：留空即可（表示只要 HTTP 成功且是合法 JSON 就算成功）。若想验证业务失败，可填 `code`、类型 Number、成功值 `0`，再用下面的 POST 场景看区别。

**Mapping 段**

- **Data root path**：`items`（响应是 `{ items: [...] }`）。
- **Data shape（数据形状）**：`Device array（设备数组）`。
- **Identity source（标识来源）**：`Field path`；**Device ID path**：`deviceCode`。
- **Display name path**：`name`。
- **Properties**：添加三行

| key | label | type | source path | 说明 |
| --- | --- | --- | --- | --- |
| `temperature` | Temperature | Number | `temperature` | 可选 `unit` 填 `°C` |
| `running` | Running | Boolean | `running` | — |
| `reportedAt` | Reported at | String | `observedAt` | — |

- **Sample time**：path 填 `observedAt`，format 选 `ISO 8601 with timezone`。
- **Source quality**：可留空（未映射的质量显示为 `Unknown`）。

**Mapping preview 段**

两种方式二选一：

- 点 **Run request**（或先保存后用测试结果）跑真实请求；
- 或用 **Example JSON**：把 `/api/devices` 的响应粘进 `Example JSON` 文本框，点 **Apply example JSON（应用示例 JSON）**。这条路径完全不发网络请求，可离线校验映射。

预览区会为每个设备列出 `Property / Raw value / Mapped value / Status`，非法映射会给出 `Mapping errors`。确认后 **Save query（保存查询）**。

### 6.5 绑定对象

1. 左栏切回 **Scene（场景）**，在层级或视口中选中示例里的 **Toy Car**（单个 object 节点）。
2. 右栏 Inspector 顶部选 **Object（属性）** 分组，向下滚到 **Device data（设备数据）** 区块。
3. **Query**：选刚保存的 `Devices`。
4. **Device ID**：先点 **Load devices（加载设备）** 拉当前结果里的候选（`pump-1` / `pump-2`），选中 `pump-1`；也可以直接手填，候选为空时允许手填并等待数据。
5. **Detail fields（详情字段）**：至少选一个字段，例如 `Temperature`；可设小数位与标签覆盖。
6. **Status color（状态颜色）**（可选）：勾选启用，属性选 `running`，加一条 `Equals / true` 的绿色规则，验证数据驱动外观。
7. **Enabled** 保持勾选，**Save binding（保存绑定）**。

> 绑定只允许单个 GLB object 节点。多选、group、light、camera、imported 子节点都会显示明确原因；imported 节点会给出 **Select owner {name}** 按钮跳到所属对象。

也可以从 **Data** 工作区查询行的 **Bindings（绑定）** 对话框里做同样的事，区别是查询被固定。

### 6.6 看预览

1. 视口上方的 **Data preview（数据预览）** 工具条点 **Start data preview（启动数据预览）**。
2. 状态从 `Requesting` 走向 `Ready（就绪）`；工具条显示 `Enabled bindings: 1 · Shared requests: 1`（启用的绑定：1 · 共享请求：1）。
3. 选中 `pump-1` 对应的对象后出现 **Device data** 详情卡，显示各字段值、单位、精度、`Received` / `Sampled` 时间与 `Source quality`。
4. **Refresh data（刷新数据）** 手动触发重取；`Refresh interval` 生效时会显示 `Next refresh`。
5. **Stop data preview（停止数据预览）** 清空运行态并关闭详情卡，但绑定本身保留。

预览期间，右栏的变换（Position/Rotation/Scale）与基础材质控件被禁用，并提示 `Editing is paused while data preview runs…`（数据预览期间暂停编辑）。选择、镜头导航和数据配置编辑仍然可用。

### 6.7 故障态对照表

把查询路径换成下表，刷新预览，观察 UI 该给出什么：

| 查询路径 | 预期 |
| --- | --- |
| `/api/devices` | 就绪，两条设备都能查到值 |
| `/api/devices?scenario=empty` | 预览显示 `No data（没有数据）`；绑定对象详情卡显示 `No data in current result`，并允许保存映射 |
| `/api/devices?scenario=missing-field` | 该设备除 `deviceCode` 外字段缺失，映射预览出现 `Property … source field is missing`；详情卡显示 `Some fields are unavailable（部分字段缺失）` |
| `/api/devices?scenario=slow` | 预览在 `Requesting` 停留约 1.5 s 后成功；连接超时改为 1 s 时得到 `The request timed out.` |
| `/api/devices?scenario=http-500` | 预览状态 `Error（错误）`，详情卡 `Query failed`，问题来源为 data；问题抽屉可定位到查询与对象 |
| `/api/devices?scenario=auth-required` | demo 不带凭证，得到 `401`，预览进入 `Authentication paused（认证暂停）`，详情卡提示 `The service returned HTTP 401. Fix credentials, then retry.` |
| POST `/api/query?scenario=business-error` + Success field `code`=0 | 请求本身 200，但业务成功条件不满足，提示 `The response did not satisfy the business success condition.` |
| 未知路径 `/api/nope` | `The service returned HTTP 404.` |

> `auth-required` 场景在本 demo 里永远是失败路径，因为 demo 宿主不提供凭证。要验证成功路径，需要用 `integration-react.md` / `integration-vanilla.md` 里描述的方式自建宿主 `executor` 注入 `x-api-key: local-fixture-key`；或者用 5.1/5.2 的 curl 命令直接验证服务端行为。

## 7. 验收清单

一次完整的本地验证应覆盖：

- [ ] `pnpm dev:data-source` 启动日志正确，`/health` 返回 `status: ok`。
- [ ] demo 里连接保存成功，`Test request` 对 `/api/devices` 返回 200 与两条设备。
- [ ] 查询预览把 `items` 映射成两个设备，`temperature` / `running` / `observedAt` 值正确。
- [ ] 对象绑定保存后，`Start data preview` 状态变为就绪，详情卡显示 `pump-1` 的字段、单位、采样时间与质量。
- [ ] `Refresh data` 后 `Received at` 更新，`observedAt` 随服务端时间变化。
- [ ] `empty` / `missing-field` / `slow` / `http-500` 四个场景各自产生对应的 UI 状态，而不是统一报错。
- [ ] `business-error` 在配置了 `Success field path` 的 POST 查询上被判定为失败。
- [ ] `Stop data preview` 后运行态清空、详情卡关闭、绑定仍存在（可在 **Device data** 区块看到已保存配置）。
- [ ] 刷新页面或重新打开 demo 后，连接、查询、绑定仍在（它们保存在场景快照里），**响应的原始数据不会**被保存。

## 8. 常见问题

**端口 4310 被占用**

`EADDRINUSE`。用 `netstat -ano | findstr :4310`（Windows）或 `lsof -i :4310` 找到占用进程，或改用 `DATA_SOURCE_PORT=4311` 并同步修改 `vite.config.ts` 的代理 `target`。

**demo 里请求失败但 curl 能通**

先确认 Vite dev server 在跑（代理由它提供），再确认连接 URL 用的是 dev server 的地址而不是 `127.0.0.1:4310`（两者都能通，但混用会让排查变复杂）。Vite 终端里没出现 `/local-api` 的代理日志，通常说明 URL 写错了前缀。

**保存/运行 POST 查询被拒**

没有勾选 **I confirm this POST only reads data**。这是 core 的显式确认要求，不是 bug。

**表单提示缺少凭证**

demo 没有凭证库。认证方式只有 none 可用；Bearer / API key 需要宿主通过 `credentials` + `executor` 提供，见 `docs/integration-react.md`。

**`slow` 场景直接超时**

连接或查询的 Timeout 小于 1.5 s。把超时调到 ≥ 3 s。

**`auth-required` 一直是 401**

demo 不注入 `x-api-key`。该场景在 demo 内只用于验证「认证暂停」的 UI 状态。

**`empty` / `missing-field` 没生效**

它们只对 `GET /api/devices` 生效。想验证空列表却把路径写成了 `/api/devices/pump-1` 或用 POST 时，会走正常分支。

**`business-error` 场景拿不到 `code: 7`，而是 400**

`POST /api/query` 先校验 body：必须带合法 JSON（例如 `-d "{}"`），否则返回 `400 invalid-json`。

**修改脚本后行为没变**

服务没有热重载，需要重启 `pnpm dev:data-source`。

**预览期间改不动变换**

预期行为：全局数据预览开启时，core 与 React 都会禁用变换与基础材质编辑。先 **Stop data preview**。

**这些数据会被存进 `.ek3d` 吗**

不会。快照里只有连接、查询、映射、绑定等作者态配置；响应正文、`receivedAt`、预览状态、测试覆盖、原始响应都只存在于运行态，见 `docs/project-package.md`。

## 9. 相关文件

- `scripts/local-data-source-server.mjs` —— 本服务器实现。
- `scripts/vite-data-source-fixture.ts` —— 自动化测试用的同源回显夹具，与本文的服务器不同。
- `package.json:22` —— `dev:data-source` 脚本。
- `examples/react-proof-loop/vite.config.ts:10`、`examples/vue-proof-loop/vite.config.ts:10` —— `/local-api` 代理。
- `examples/react-proof-loop/src/App.tsx:10`、`examples/vue-proof-loop/src/demo-data-executor.ts:8` —— demo 的 `DataRequestExecutor`（真实 `fetch`，不注入凭证）。
- `docs/integration-react.md` —— 连接、请求测试、对象绑定与预览的完整语义。
- `docs/project-package.md` —— 哪些数据源内容会/不会进入 `.ek3d`。
- `packages/react/test/http-data-source.browser.test.tsx` —— 浏览器自动化里的数据源闭环参考（走的是 `/__fixtures__` 夹具）。
