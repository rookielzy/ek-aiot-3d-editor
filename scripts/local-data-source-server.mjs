import { createServer } from "node:http";

const port = Number(process.env.DATA_SOURCE_PORT ?? 4310);
const host = process.env.DATA_SOURCE_HOST ?? "127.0.0.1";

const devices = [
  { deviceCode: "pump-1", name: "Pump 1", temperature: 26.4, running: true },
  { deviceCode: "pump-2", name: "Pump 2", temperature: 24.8, running: false }
];

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
  if (url.pathname === "/api/devices" && request.method === "GET") {
    if (scenario === "empty") return send(response, 200, { items: [] });
    if (scenario === "missing-field") return send(response, 200, { items: [{ deviceCode: "pump-1" }] });
    return send(response, 200, { items: devices.map((device) => ({ ...device, observedAt: new Date().toISOString() })) });
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
