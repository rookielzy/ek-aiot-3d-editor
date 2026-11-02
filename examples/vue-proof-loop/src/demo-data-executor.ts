import type { DataRequestExecutor } from "@ek-aiot/3d-editor-core";

/**
 * Browser demo host: real same-origin fetch. The demo has no credential store,
 * so any connection that requires a credential reports a host capability gap
 * instead of leaking a secret into the page.
 */
export const fetchDataRequestExecutor: DataRequestExecutor = async (request) => {
  // The descriptor is frozen and shared, so copy the headers before handing them
  // to fetch. A real host injects its credential into this copy.
  const headers: Record<string, string> = { ...request.headers };
  const response = await fetch(request.url, {
    method: request.method,
    headers,
    body: request.body === null ? undefined : JSON.stringify(request.body),
    signal: request.signal
  });
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    body: await response.text()
  };
};
