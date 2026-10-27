import { describe, expect, it } from "vitest";
import {
  formatDataPath,
  mapDataQueryBody,
  parseDataPath,
  validateDataQueryMapping,
  type DataMappedField,
  type DataMappingResult,
  type DataPath,
  type DataQueryMapping,
  type DataPropertyMapping
} from "../index";

describe("query mapping engine", () => {
  it("maps a device array with leading-zero string IDs, scaled numbers, and explicit boolean values", () => {
    const result = success(mapDataQueryBody(baseMapping(), {
      data: {
        items: [
          {
            deviceCode: "001",
            name: "Pump 001",
            tempRaw: 426,
            run: 1,
            sampledAt: "2026-10-26T08:00:00+08:00",
            quality: "ok"
          },
          {
            deviceCode: "002",
            name: "Pump 002",
            tempRaw: 381,
            run: 0,
            sampledAt: "2026-10-26T08:00:05+08:00",
            quality: "bad"
          }
        ]
      }
    }, {
      connectionId: "connection-a",
      queryId: "query-a",
      executionId: "run-1",
      receivedAt: Date.parse("2026-10-26T00:00:10Z")
    }));

    expect(result.ok).toBe(true);
    expect(result.entities.map((entity) => entity.entityId)).toEqual(["001", "002"]);
    expect(result.entities[0]).toMatchObject({
      displayName: "Pump 001",
      observedAt: Date.parse("2026-10-26T00:00:00Z"),
      sourceQuality: "good"
    });
    expect(field(result.entities[0], "temperature")).toMatchObject({
      raw: 426,
      value: 42.6,
      status: "ok",
      unit: "°C"
    });
    expect(field(result.entities[0], "running")).toMatchObject({ raw: 1, value: true, status: "ok" });
    expect(field(result.entities[1], "running")).toMatchObject({ raw: 0, value: false, status: "ok" });
    expect(result.entities[1].sourceQuality).toBe("bad");
    expect(result.samples).toEqual([
      {
        connectionId: "connection-a",
        queryId: "query-a",
        executionId: "run-1",
        entityId: "001",
        propertyKey: "temperature",
        value: 42.6,
        observedAt: Date.parse("2026-10-26T00:00:00Z"),
        receivedAt: Date.parse("2026-10-26T00:00:10Z"),
        sourceQuality: "good"
      },
      {
        connectionId: "connection-a",
        queryId: "query-a",
        executionId: "run-1",
        entityId: "001",
        propertyKey: "running",
        value: true,
        observedAt: Date.parse("2026-10-26T00:00:00Z"),
        receivedAt: Date.parse("2026-10-26T00:00:10Z"),
        sourceQuality: "good"
      },
      expect.objectContaining({ entityId: "002", propertyKey: "temperature", value: 38.1, sourceQuality: "bad" }),
      expect.objectContaining({ entityId: "002", propertyKey: "running", value: false, sourceQuality: "bad" })
    ]);
  });

  it("keeps field failures isolated and never turns missing, null, or type errors into zero or false", () => {
    const mapping = baseMapping({
      properties: [
        property("temperature", "tempRaw", "number", { kind: "scale", factor: 0.1, offset: 0 }),
        property("running", "run", "boolean", {
          kind: "map",
          entries: [{ from: 1, to: true }, { from: 0, to: false }]
        }),
        property("label", "name", "string", { kind: "raw" }),
        property("nullableNote", "note", "string", { kind: "raw" }, { nullable: true })
      ]
    });
    const result = success(mapDataQueryBody(mapping, {
      data: {
        items: [
          {
            deviceCode: "001",
            name: 12,
            run: "1",
            tempRaw: null
          },
          {
            deviceCode: "002",
            tempRaw: 426,
            run: 1,
            name: "Pump 002",
            note: null
          }
        ]
      }
    }, context()));

    expect(result.ok).toBe(true);
    const first = result.entities[0];
    expect(field(first, "temperature")).toMatchObject({ raw: null, value: null, status: "null" });
    expect(field(first, "temperature").problems.map((problem) => problem.code)).toEqual(["property-null"]);
    expect(field(first, "running")).toMatchObject({ raw: "1", value: null, status: "invalid" });
    expect(field(first, "running").problems.map((problem) => problem.code)).toEqual(["property-conversion"]);
    expect(field(first, "label")).toMatchObject({ raw: 12, value: null, status: "invalid" });
    expect(field(first, "label").problems.map((problem) => problem.code)).toEqual(["property-type"]);
    expect(field(first, "nullableNote")).toMatchObject({ raw: undefined, value: null, status: "missing" });
    expect(field(first, "nullableNote").problems.map((problem) => problem.code)).toEqual(["property-missing"]);

    const second = result.entities[1];
    expect(field(second, "temperature")).toMatchObject({ value: 42.6, status: "ok" });
    expect(field(second, "running")).toMatchObject({ value: true, status: "ok" });
    expect(field(second, "label")).toMatchObject({ value: "Pump 002", status: "ok" });
    expect(second.fields.find((entry) => entry.key === "nullableNote")?.problems).toEqual([]);
    expect(result.samples.map((sample) => [sample.entityId, sample.propertyKey])).toEqual([
      ["002", "temperature"],
      ["002", "running"],
      ["002", "label"]
    ]);
  });

  it("allows nullable null without a display value but keeps required nulls diagnosed", () => {
    const mapping = baseMapping({
      properties: [
        property("reading", "value", "number", { kind: "raw" }, { nullable: true }),
        property("required", "value", "string", { kind: "raw" })
      ]
    });
    const result = success(mapDataQueryBody(mapping, { data: { items: [{ deviceCode: "001", value: null }] } }, context()));

    expect(result.ok).toBe(true);
    expect(field(result.entities[0], "reading")).toMatchObject({ value: null, status: "null", problems: [] });
    expect(field(result.entities[0], "required").problems.map((problem) => problem.code)).toEqual(["property-null"]);
    expect(result.samples).toEqual([]);
  });

  it("fails the whole result for root type errors and duplicate device IDs", () => {
    const notAnArray = mapDataQueryBody(baseMapping(), { data: { items: { deviceCode: "001" } } }, context());
    expect(notAnArray.ok).toBe(false);
    expect(notAnArray.entities).toEqual([]);
    expect(notAnArray.errors.map((error) => error.code)).toEqual(["root-type"]);

    const missingRoot = mapDataQueryBody(baseMapping(), { data: {} }, context());
    expect(missingRoot.ok).toBe(false);
    expect(missingRoot.errors.map((error) => error.code)).toEqual(["root-missing"]);

    const duplicate = mapDataQueryBody(baseMapping(), {
      data: { items: [{ deviceCode: "001", tempRaw: 426, run: 1 }, { deviceCode: "001", tempRaw: 381, run: 0 }] }
    }, context());
    expect(duplicate.ok).toBe(false);
    expect(duplicate.entities).toEqual([]);
    expect(duplicate.samples).toEqual([]);
    expect(duplicate.errors.map((error) => error.code)).toEqual(["entity-id-duplicate"]);
  });

  it("uses explicit numeric identity conversion and reports invalid or empty ID rows without dropping valid rows", () => {
    const numeric = baseMapping({
      identity: { kind: "path", path: path("deviceCode"), valueType: "number" }
    });
    const mapped = success(mapDataQueryBody(numeric, {
      data: { items: [{ deviceCode: 7, tempRaw: 426, run: 1 }] }
    }, context()));
    expect(mapped.entities[0].entityId).toBe("7");

    const mixed = success(mapDataQueryBody(numeric, {
      data: {
        items: [
          { deviceCode: "001", tempRaw: 426, run: 1 },
          { deviceCode: "", tempRaw: 426, run: 1 },
          { deviceCode: 8, tempRaw: 426, run: 1 }
        ]
      }
    }, context()));
    expect(mixed.entities.map((entity) => entity.entityId)).toEqual(["8"]);
    expect(mixed.problems.map((problem) => problem.code)).toEqual(["entity-id-invalid", "entity-id-invalid"]);
  });

  it("supports single-object identity from a parameter or fixed value", () => {
    const fromParameter = baseMapping({
      mode: "single",
      root: path("data.pump"),
      identity: { kind: "parameter", parameterName: "deviceId" }
    });
    const mapped = success(mapDataQueryBody(fromParameter, {
      data: { pump: { name: "Pump A", tempRaw: 426, run: 1 } }
    }, { ...context(), parameters: { deviceId: 12 } }));
    expect(mapped.entities[0]).toMatchObject({ entityId: "12", displayName: "Pump A" });

    const fixed = success(mapDataQueryBody(baseMapping({
      mode: "single",
      root: path("data.pump"),
      identity: { kind: "literal", value: "pump-fixed" }
    }), {
      data: { pump: { name: "Pump A", tempRaw: 426, run: 1 } }
    }, context()));
    expect(fixed.ok).toBe(true);
    expect(fixed.entities[0].entityId).toBe("pump-fixed");
  });

  it("separates unknown sample time from receivedAt and reports invalid, future, and quality values independently", () => {
    const mapping = baseMapping({
      observedAt: { path: path("sampledAt"), format: "iso" },
      sourceQuality: {
        path: path("quality"),
        entries: [{ from: "ok", quality: "good" }, { from: "bad", quality: "bad" }]
      }
    });
    const receivedAt = Date.parse("2026-10-26T00:00:00Z");

    const unknown = success(mapDataQueryBody(mapping, {
      data: { items: [{ deviceCode: "001", tempRaw: 426, run: 1 }] }
    }, { ...context(), receivedAt }));
    expect(unknown.entities[0]).toMatchObject({
      observedAt: null,
      receivedAt,
      sourceQuality: "unknown"
    });
    expect(unknown.entities[0].observedAtProblem?.code).toBe("observed-at-missing");
    expect(unknown.entities[0].qualityProblem?.code).toBe("source-quality-invalid");
    expect(field(unknown.entities[0], "temperature")).toMatchObject({ value: 42.6, status: "ok" });

    const invalid = success(mapDataQueryBody(mapping, {
      data: { items: [{ deviceCode: "001", tempRaw: 426, run: 1, sampledAt: "26/10/2026 08:00", quality: "other" }] }
    }, { ...context(), receivedAt }));
    expect(invalid.entities[0].observedAt).toBeNull();
    expect(invalid.entities[0].observedAtProblem?.code).toBe("observed-at-invalid");
    expect(invalid.entities[0].sourceQuality).toBe("unknown");
    expect(invalid.entities[0].qualityProblem?.code).toBe("source-quality-invalid");

    const future = success(mapDataQueryBody(mapping, {
      data: {
        items: [{
          deviceCode: "001",
          tempRaw: 426,
          run: 1,
          sampledAt: new Date(receivedAt + 31_000).toISOString(),
          quality: "ok"
        }]
      }
    }, { ...context(), receivedAt }));
    expect(future.entities[0].observedAt).toBeNull();
    expect(future.entities[0].observedAtProblem?.code).toBe("observed-at-future");
    expect(future.entities[0].sourceQuality).toBe("good");
    expect(field(future.entities[0], "temperature")).toMatchObject({ value: 42.6, status: "ok" });
  });

  it.each([
    "2026-02-30T00:00:00Z",
    "2026-02-29T00:00:00+08:00",
    "1900-02-29T00:00:00Z",
    "2024-02-30T00:00:00-08:00",
    "2026-04-31T00:00:00Z",
    "2026-13-01T00:00:00Z"
  ])("diagnoses invalid ISO calendar date %s without losing valid fields", (sampledAt) => {
    const result = success(mapDataQueryBody(baseMapping(), {
      data: { items: [{ deviceCode: "001", tempRaw: 426, run: 1, sampledAt, quality: "ok" }] }
    }, context()));

    expect(result.entities[0]).toMatchObject({
      observedAt: null,
      observedAtProblem: { code: "observed-at-invalid" },
      sourceQuality: "good",
      qualityProblem: null
    });
    expect(result.samples).toContainEqual(expect.objectContaining({
      propertyKey: "temperature", value: 42.6, observedAt: null
    }));
  });

  it.each([
    ["2024-02-29T00:30:00+08:00", "2024-02-28T16:30:00Z"],
    ["2000-02-29T23:30:00-08:00", "2000-03-01T07:30:00Z"],
    ["0000-02-29T00:00:00Z", "0000-02-29T00:00:00Z"]
  ])("accepts valid leap day %s and applies its timezone", (sampledAt, utc) => {
    const result = success(mapDataQueryBody(baseMapping(), {
      data: { items: [{ deviceCode: "001", tempRaw: 426, sampledAt }] }
    }, context()));

    expect(result.entities[0]).toMatchObject({ observedAt: Date.parse(utc), observedAtProblem: null });
  });

  it.each([
    { format: "unix-seconds", sampledAt: -1e308 },
    { format: "unix-seconds", sampledAt: 1e308 },
    { format: "unix-seconds", sampledAt: -8_640_000_000_001 },
    { format: "unix-seconds", sampledAt: 8_640_000_000_001 },
    { format: "unix-milliseconds", sampledAt: -1e30 },
    { format: "unix-milliseconds", sampledAt: 1e30 },
    { format: "unix-milliseconds", sampledAt: -8_640_000_000_000_001 },
    { format: "unix-milliseconds", sampledAt: 8_640_000_000_000_001 }
  ] as const)("diagnoses out-of-range $format time $sampledAt", ({ format, sampledAt }) => {
    const result = success(mapDataQueryBody(baseMapping({
      observedAt: { path: path("sampledAt"), format }
    }), {
      data: { items: [{ deviceCode: "001", tempRaw: 426, sampledAt }] }
    }, context()));

    expect(result.entities[0]).toMatchObject({
      observedAt: null,
      observedAtProblem: { code: "observed-at-invalid" }
    });
    expect(result.samples).toContainEqual(expect.objectContaining({
      propertyKey: "temperature", value: 42.6, observedAt: null
    }));
  });

  it.each([
    { format: "unix-seconds", sampledAt: -8_640_000_000_000, expected: -8_640_000_000_000_000 },
    { format: "unix-seconds", sampledAt: 8_640_000_000_000, expected: 8_640_000_000_000_000 },
    { format: "unix-milliseconds", sampledAt: -8_640_000_000_000_000, expected: -8_640_000_000_000_000 },
    { format: "unix-milliseconds", sampledAt: 8_640_000_000_000_000, expected: 8_640_000_000_000_000 },
    { format: "unix-seconds", sampledAt: 0, expected: 0 },
    { format: "unix-milliseconds", sampledAt: 0, expected: 0 }
  ] as const)("accepts representable $format time $sampledAt", ({ format, sampledAt, expected }) => {
    const result = success(mapDataQueryBody(baseMapping({
      observedAt: { path: path("sampledAt"), format }
    }), {
      data: { items: [{ deviceCode: "001", tempRaw: 426, sampledAt }] }
    }, { ...context(), receivedAt: 8_640_000_000_000_000 }));

    expect(result.entities[0]).toMatchObject({ observedAt: expected, observedAtProblem: null });
  });

  it("accepts empty device arrays and keeps the mapping untouched", () => {
    const result = success(mapDataQueryBody(baseMapping(), { data: { items: [] } }, context()));
    expect(result).toMatchObject({ ok: true, entities: [], samples: [], errors: [], problems: [] });
  });

  it("rejects malformed mapping structure without a preview", () => {
    expect(validateDataQueryMapping({ mode: "array", root: [], properties: [] })).toMatchObject({
      ok: false,
      problems: expect.arrayContaining([
        expect.objectContaining({ code: "mapping-property-required" })
      ])
    });

    expect(validateDataQueryMapping({
      mode: "array",
      root: [],
      identity: { kind: "literal", value: "fixed" },
      displayName: null,
      properties: [property("temperature", "tempRaw", "number", { kind: "scale", factor: 0.1, offset: 0 })],
      observedAt: null,
      sourceQuality: null
    })).toMatchObject({
      ok: false,
      problems: expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("Array mode requires") })
      ])
    });
  });
});

describe("data path parsing", () => {
  it("round-trips readable object and array paths", () => {
    const cases = [
      "data.items[0].temp",
      "data[\"field.with.dot\"]",
      "items[12]",
      "device-code"
    ];
    for (const text of cases) {
      const parsed = parseDataPath(text);
      expect(parsed, text).toBeTruthy();
      expect(parseDataPath(formatDataPath(parsed!))).toEqual(parsed);
    }
    expect(parseDataPath("")).toEqual([]);
    expect(formatDataPath([{ kind: "key", key: "a b" }])).toBe("[\"a b\"]");
  });

  it.each(["data.*", "data.__proto__", "items[-1]", "items[1", "items..value", "items['key']"])(
    "rejects unsafe or ambiguous path %s",
    (text) => {
      expect(parseDataPath(text)).toBeNull();
    }
  );
});

function baseMapping(patch: Partial<DataQueryMapping> = {}): DataQueryMapping {
  return {
    mode: "array",
    root: path("data.items"),
    identity: { kind: "path", path: path("deviceCode"), valueType: "string" },
    displayName: path("name"),
    properties: [
      property("temperature", "tempRaw", "number", { kind: "scale", factor: 0.1, offset: 0 }, { unit: "°C" }),
      property("running", "run", "boolean", {
        kind: "map",
        entries: [{ from: 1, to: true }, { from: 0, to: false }]
      })
    ],
    observedAt: { path: path("sampledAt"), format: "iso" },
    sourceQuality: {
      path: path("quality"),
      entries: [{ from: "ok", quality: "good" }, { from: "bad", quality: "bad" }]
    },
    ...patch
  };
}

function property(
  key: string,
  source: string,
  type: DataPropertyMapping["type"],
  transform: DataPropertyMapping["transform"],
  patch: Partial<DataPropertyMapping> = {}
): DataPropertyMapping {
  return {
    key,
    label: key,
    type,
    nullable: false,
    unit: null,
    source: path(source),
    transform,
    range: null,
    allowed: null,
    ...patch
  };
}

function path(text: string): DataPath {
  const parsed = parseDataPath(text);
  if (!parsed) {
    throw new Error(`Invalid test path: ${text}`);
  }
  return parsed;
}

function context() {
  return {
    connectionId: "connection-a",
    queryId: "query-a" as string | null,
    executionId: "run-1",
    receivedAt: Date.parse("2026-10-26T00:00:10Z")
  };
}

function field(entity: { fields: readonly DataMappedField[] }, key: string): DataMappedField {
  const found = entity.fields.find((entry) => entry.key === key);
  if (!found) {
    throw new Error(`Missing field ${key}`);
  }
  return found;
}

function success(result: DataMappingResult): Extract<DataMappingResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(`Expected a mapped result: ${result.errors.map((error) => error.message).join("; ")}`);
  }
  return result;
}
