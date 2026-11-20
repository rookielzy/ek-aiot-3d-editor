import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

const standardDeviceList = [
  {
    "deviceId": "pump-01",
    "deviceName": "一号水泵",
    "ext": { "location": "北区泵房" }
  },
  {
    "deviceId": "pump-02",
    "deviceName": "二号水泵"
  }
];

const standardDeviceRealtime = [
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
];

/**
 * Dev-only same-origin HTTP fixture for data source request smoke tests.
 * It echoes what actually reached the dev server and never leaves the origin.
 */
export function dataSourceHttpFixturePlugin(): Plugin {
  let requestCount = 0;

  return {
    name: "ek-aiot-data-source-http-fixture",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://fixture.local");
        if (!url.pathname.startsWith("/__fixtures__/http-data-source")) {
          next();
          return;
        }

        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");

        void (async () => {
          if (request.method !== "GET" && request.method !== "POST") {
            response.statusCode = 405;
            response.end(JSON.stringify({ source: "same-origin-fixture", error: "method-not-allowed" }));
            return;
          }

          requestCount += 1;
          if (request.method === "GET" && url.pathname === "/__fixtures__/http-data-source/standard-device-list") {
            response.end(JSON.stringify(standardDeviceList));
            return;
          }
          if (request.method === "GET" && url.pathname === "/__fixtures__/http-data-source/standard-device-realtime") {
            response.end(JSON.stringify(standardDeviceRealtime));
            return;
          }
          if (request.method === "GET" && url.pathname === "/__fixtures__/http-data-source/standard-empty") {
            response.end("[]");
            return;
          }
          if (request.method === "GET" && url.pathname === "/__fixtures__/http-data-source/standard-invalid") {
            response.end(JSON.stringify([{
              ...standardDeviceRealtime[0],
              data: [{ key: "temperature", valueType: "number", value: "24.6", desc: "温度" }]
            }]));
            return;
          }
          if (request.method === "GET" && url.pathname === "/__fixtures__/http-data-source/standard-iso-time") {
            response.end(JSON.stringify(standardDeviceRealtime.map((device, index) => ({
              ...device,
              observedAt: index === 0 ? "20261120T140000+0100" : "2026-11-20T14:00:00,5+01:00"
            }))));
            return;
          }
          if (request.method === "GET" && url.pathname === "/__fixtures__/http-data-source/standard-http-failure") {
            response.statusCode = 503;
            response.end("[]");
            return;
          }
          if (url.pathname === "/__fixtures__/http-data-source/business-failure") {
            response.statusCode = 200;
            response.end(JSON.stringify({ source: "same-origin-fixture", requestCount, code: 7, items: [] }));
            return;
          }
          if (request.method === "GET" && url.pathname === "/__fixtures__/http-data-source/devices") {
            response.statusCode = 200;
            response.end(JSON.stringify({
              source: "same-origin-fixture",
              requestCount,
              items: [
                { deviceCode: "pump-1", name: "Pump 1", reading: requestCount },
                { deviceCode: "pump-2", name: "Pump 2", reading: requestCount }
              ]
            }));
            return;
          }
          if (request.method === "GET") {
            response.statusCode = 200;
            response.end(JSON.stringify({
              source: "same-origin-fixture",
              requestCount,
              method: request.method,
              path: url.pathname,
              query: Object.fromEntries(url.searchParams),
              header: request.headers["x-fixture-probe"] ?? null
            }));
            return;
          }

          const bodyText = await readRequestBody(request);
          let body: unknown = null;
          try {
            body = bodyText.trim() ? JSON.parse(bodyText) : null;
          } catch {
            response.statusCode = 400;
            response.end(JSON.stringify({ source: "same-origin-fixture", error: "invalid-json" }));
            return;
          }
          response.statusCode = 200;
          response.end(JSON.stringify({
            source: "same-origin-fixture",
            requestCount,
            code: 0,
            method: request.method,
            path: url.pathname,
            query: Object.fromEntries(url.searchParams),
            headers: pickHeaders(request.headers, ["x-zone-key", "x-trace", "content-type"]),
            body,
            bodyTypes: bodyTypes(body)
          }));
        })();
      });
    }
  };
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function pickHeaders(
  headers: IncomingMessage["headers"],
  names: readonly string[]
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const name of names) {
    const value = headers[name];
    if (typeof value === "string") {
      picked[name] = value;
    }
  }
  return picked;
}

function bodyTypes(body: unknown): Record<string, string> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [
      key,
      value === null ? "null" : Array.isArray(value) ? "array" : typeof value
    ])
  );
}
