import { describe, expect, it } from "vitest";
import {
  buildDataGetRequest,
  createEditor,
  type DataQueryDraft
} from "../index";

describe("GET request drafting", () => {
  it("resolves typed defaults with temporary overrides and encodes path/query values", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "create-data-connection",
      connection: {
        id: "connection-a",
        name: "Plant API",
        baseUrl: "https://api.example.test/v1",
        auth: { kind: "none" },
        headers: { "X-Tenant": "plant-a" },
        timeoutMs: 12_000
      }
    });
    const draft: DataQueryDraft = {
      connectionId: "connection-a",
      path: "/devices/{deviceId}/events",
      parameters: [
        { name: "deviceId", type: "string", defaultValue: "pump/1" },
        { name: "include", type: "boolean" },
        { name: "offset", type: "number", defaultValue: 0 },
        { name: "q", type: "string", defaultValue: "" }
      ]
    };

    const result = buildDataGetRequest(editor.getSnapshot(), draft, {
      overrides: { deviceId: "pump 1&2", include: false }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a built request.");
    expect(result.summary).toEqual({
      method: "GET",
      url: "https://api.example.test/v1/devices/pump%201%262/events?include=false&offset=0&q=",
      headers: { "X-Tenant": "plant-a" },
      credentialRef: null,
      timeoutMs: 12_000,
      parameters: {
        deviceId: "pump 1&2",
        include: false,
        offset: 0,
        q: ""
      }
    });
    const missing = buildDataGetRequest(editor.getSnapshot(), draft);
    expect(!missing.ok && missing.problems.map((problem) => [problem.code, problem.parameterName])).toEqual([
      ["parameter-missing", "include"]
    ]);
    expect(Object.keys(editor.getSnapshot().dataSources.queries)).toEqual([]);
    editor.dispose();
  });

  it("reports parameter definition, missing value, and type problems without a request", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "create-data-connection",
      connection: {
        id: "connection-a",
        name: "Plant API",
        baseUrl: "https://api.example.test/v1",
        auth: { kind: "none" },
        headers: {},
        timeoutMs: 10_000
      }
    });
    const build = (parameters: DataQueryDraft["parameters"], overrides?: Record<string, unknown>) =>
      buildDataGetRequest(editor.getSnapshot(), {
        connectionId: "connection-a",
        path: "/devices",
        parameters
      }, overrides ? { overrides: overrides as never } : {});

    const missing = build([{ name: "area", type: "string" }]);
    expect(!missing.ok && missing.problems.map((problem) => problem.code)).toEqual(["parameter-missing"]);
    const mistyped = build([{ name: "count", type: "number" }], { count: "2" });
    expect(!mistyped.ok && mistyped.problems.map((problem) => problem.code)).toEqual(["parameter-type"]);
    const badDefault = build([{ name: "count", type: "number", defaultValue: Number.NaN }]);
    expect(!badDefault.ok && badDefault.problems.map((problem) => problem.code)).toEqual(["parameter-type"]);
    const duplicate = build([
      { name: "area", type: "string", defaultValue: "A" },
      { name: " area ", type: "string", defaultValue: "B" }
    ]);
    expect(!duplicate.ok && duplicate.problems.map((problem) => problem.code)).toEqual(["parameter-duplicate"]);
    const invalidName = build([{ name: "__proto__", type: "string", defaultValue: "A" }]);
    expect(!invalidName.ok && invalidName.problems.map((problem) => problem.code)).toEqual(["parameter-definition-invalid"]);
    const badType = build([{ name: "area", type: "date" as never, defaultValue: "A" }]);
    expect(!badType.ok && badType.problems.map((problem) => problem.code)).toEqual(["parameter-definition-invalid"]);
    const missingPathParameter = buildDataGetRequest(editor.getSnapshot(), {
      connectionId: "connection-a",
      path: "/devices/{deviceId}",
      parameters: []
    });
    expect(!missingPathParameter.ok && missingPathParameter.problems.map((problem) => problem.code)).toEqual([
      "path-parameter-missing"
    ]);
    editor.dispose();
  });

  it.each([
    ["absolute", "https://evil.example.test/devices", "path-absolute"],
    ["protocol-relative", "//evil.example.test/devices", "path-protocol-relative"],
    ["nested traversal", "/../admin", "path-traversal"],
    ["encoded traversal", "/%2e%2e/admin", "path-traversal"],
    ["encoded slash", "/devices%2F..%2Fadmin", "path-invalid"],
    ["query smuggling", "/devices?admin=1", "path-invalid"],
    ["backslash", "/devices\\admin", "path-invalid"]
  ])("rejects %s request paths without leaving the service prefix", (_label, path, code) => {
    const editor = createEditor();
    editor.dispatch({
      type: "create-data-connection",
      connection: {
        id: "connection-a",
        name: "Plant API",
        baseUrl: "https://api.example.test/v1",
        auth: { kind: "none" },
        headers: {},
        timeoutMs: 10_000
      }
    });

    const result = buildDataGetRequest(editor.getSnapshot(), {
      connectionId: "connection-a",
      path,
      parameters: []
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.map((problem) => problem.code)).toEqual([code]);
    editor.dispose();
  });

  it("keeps bearer auth in the summary as a credential reference without secrets", () => {
    const editor = createEditor({
      credentials: [{ ref: "credential-ops", label: "Operations token", available: true }]
    });
    editor.dispatch({
      type: "create-data-connection",
      connection: {
        id: "connection-a",
        name: "Plant API",
        baseUrl: "https://api.example.test/v1",
        auth: { kind: "bearer", credentialRef: "credential-ops" },
        headers: { "X-Tenant": "plant-a" },
        timeoutMs: 10_000
      }
    });

    const result = buildDataGetRequest(editor.getSnapshot(), {
      connectionId: "connection-a",
      path: "/devices",
      parameters: []
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a built request.");
    expect(result.summary.credentialRef).toBe("credential-ops");
    expect(result.summary.headers).toEqual({ "X-Tenant": "plant-a" });
    expect(Object.keys(result.summary.headers).map((name) => name.toLowerCase())).not.toContain("authorization");
    expect(JSON.stringify(result.summary)).not.toContain("Bearer");
    expect(JSON.stringify(editor.serialize())).not.toContain("Operations token");
    editor.dispose();
  });
});
