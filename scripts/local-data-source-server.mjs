import { createServer } from "node:http";

const port = Number(process.env.DATA_SOURCE_PORT ?? 4310);
const host = process.env.DATA_SOURCE_HOST ?? "127.0.0.1";

const devices = [
  { deviceCode: "pump-1", name: "Pump 1", temperature: 26.4, running: true },
  { deviceCode: "pump-2", name: "Pump 2", temperature: 24.8, running: false }
];

const runningStatusEnum = [
  { value: 17, desc: "离线" },
  { value: 42, desc: "运行中" }
];
const offlineObservedAt = new Date(Date.now() - 15 * 60_000).toISOString();

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  const scenario = url.searchParams.get("scenario");
  if (scenario === "slow") await delay(1500);
  if (scenario === "http-500") return send(response, 500, { error: "simulated-server-error" });
  if (scenario === "auth-required" && request.headers["x-api-key"] !== "local-fixture-key") {
    return send(response, 401, { error: "api-key-required" });
  }
  if (url.pathname === "/health") return send(response, 200, { status: "ok", service: "local-data-source" });
  const deviceList = url.pathname === "/api/devices";
  if (request.method === "GET" && (deviceList || url.pathname === "/api/devices/realtime")) {
    if (scenario === "empty") return send(response, 200, []);
    if (scenario === "missing-field") {
      return send(response, 200, [deviceList
        ? { deviceId: devices[0].deviceCode }
        : { deviceId: devices[0].deviceCode, runningStatus: 42, runningStatusEnum }]);
    }
    if (deviceList) {
      return send(response, 200, devices.map((device) => ({
        deviceId: device.deviceCode,
        deviceName: device.name
      })));
    }
    const observedAt = new Date().toISOString();
    return send(response, 200, devices.map((device) => ({
      deviceId: device.deviceCode,
      runningStatus: device.running ? 42 : 17,
      runningStatusEnum,
      observedAt: device.running ? observedAt : offlineObservedAt,
      data: [
        { key: "temperature", valueType: "number", value: device.temperature, desc: "温度", unit: "°C" },
        {
          key: "power",
          valueType: "boolean",
          value: device.running ? true : null,
          desc: "开关状态",
          valueEnum: [
            { value: true, desc: "开启" },
            { value: false, desc: "关闭" }
          ]
        }
      ]
    })));
  }
  const deviceMatch = url.pathname.match(/^\/api\/devices\/([^/]+)$/);
  if (deviceMatch && request.method === "GET") {
    const device = devices.find((item) => item.deviceCode === deviceMatch[1]);
    return device ? send(response, 200, { ...device, observedAt: new Date().toISOString() }) : send(response, 404, { error: "device-not-found" });
  }
  if (url.pathname === "/api/query" && request.method === "POST") {
    const body = await readJson(request);
    if (body === null) return send(response, 400, { error: "invalid-json" });
    if (scenario === "business-error") return send(response, 200, { code: 7, items: [] });
    return send(response, 200, { code: 0, received: body, items: devices });
  }
  send(response, 404, { error: "route-not-found" });
});

server.listen(port, host, () => {
  console.log(`Local data source listening at http://${host}:${port}`);
  console.log("Standard endpoints: GET /api/devices and GET /api/devices/realtime");
  console.log("Scenarios: ?scenario=empty|missing-field|slow|http-500|auth-required|business-error");
});

function send(response, status, body) {
  response.statusCode = status;
  response.end(JSON.stringify(body));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readJson(request) {
  return new Promise((resolve) => {
    let text = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { text += chunk; });
    request.on("end", () => {
      try { resolve(text.trim() ? JSON.parse(text) : null); } catch { resolve(null); }
    });
  });
}
