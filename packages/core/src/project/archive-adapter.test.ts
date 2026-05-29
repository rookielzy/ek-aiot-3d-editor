import { describe, expect, it } from "vitest";
import { FflateArchiveAdapter, decodeArchiveJson, encodeArchiveJson } from "./archive-adapter";

describe("project archive adapter", () => {
  it("round-trips package entries without exposing fflate types", () => {
    const adapter = new FflateArchiveAdapter();
    const zipped = adapter.write([
      { path: "project.json", bytes: encodeArchiveJson({ version: 1 }) },
      { path: "assets/model.glb", bytes: new Uint8Array([1, 2, 3]) }
    ]);

    const entries = adapter.read(zipped);

    expect(decodeArchiveJson(entries.find((entry) => entry.path === "project.json")!.bytes)).toEqual({ version: 1 });
    expect(entries.find((entry) => entry.path === "assets/model.glb")?.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });
});
