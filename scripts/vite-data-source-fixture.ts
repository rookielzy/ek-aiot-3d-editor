import type { Plugin } from "vite";

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
        if (request.method !== "GET") {
          response.statusCode = 405;
          response.end(JSON.stringify({ source: "same-origin-fixture", error: "method-not-allowed" }));
          return;
        }

        requestCount += 1;
        response.statusCode = 200;
        if (url.pathname === "/__fixtures__/http-data-source/devices") {
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
        response.end(JSON.stringify({
          source: "same-origin-fixture",
          requestCount,
          method: request.method,
          path: url.pathname,
          query: Object.fromEntries(url.searchParams),
          header: request.headers["x-fixture-probe"] ?? null
        }));
      });
    }
  };
}
