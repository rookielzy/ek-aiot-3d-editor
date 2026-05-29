import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { buildProblemSection } from "./problems";

describe("problem inspector model", () => {
  it("combines runtime problems with authored acknowledgement state without mutating snapshots", () => {
    const editor = createEditor();
    const before = editor.serialize();
    const section = buildProblemSection(
      {
        ...editor.getSnapshot(),
        problems: {
          acknowledged: {
            "asset-unresolved:asset-a:object-a": { problemId: "asset-unresolved:asset-a:object-a" }
          }
        }
      },
      [
        {
          id: "asset-unresolved:asset-a:object-a",
          severity: "warning",
          code: "asset-unresolved",
          source: "asset-resolver",
          target: { kind: "object", objectId: "object-a" },
          objectId: "object-a",
          assetId: "asset-a",
          recoverability: "user-action",
          message: "Missing asset",
          display: { title: "Asset missing", detail: "asset-a is unavailable." }
        }
      ]
    );

    expect(section.problems).toEqual([
      expect.objectContaining({
        id: "asset-unresolved:asset-a:object-a",
        acknowledged: true,
        runtime: true,
        assetId: "asset-a",
        actionLabel: "Replace asset"
      })
    ]);
    expect(editor.serialize()).toEqual(before);
  });
});
