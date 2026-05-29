import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { buildEnvironmentSection, buildSetEnvironmentCommand } from "./environment";

describe("environment inspector commands", () => {
  it("uses existing environment command cleanup when switching HDR background to solid", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr" } });
    editor.dispatch({
      type: "set-environment",
      environment: {
        mode: "hdr",
        environment: { assetId: "hdr-a", intensity: 1, rotation: { x: 0, y: 0, z: 0 } },
        background: { mode: "hdr", assetId: "hdr-a", blur: 0.5 }
      }
    });
    const command = buildSetEnvironmentCommand(editor.getSnapshot(), "background.color", "#111111");
    if (!command.ok) {
      throw new Error(command.problem.message);
    }

    editor.dispatch(command.command);

    expect(editor.getSnapshot().environment.background.mode).toBe("solid");
    expect(editor.getSnapshot().environment.background.assetId).toBeUndefined();
    expect(editor.getSnapshot().environment.background.blur).toBeUndefined();
    expect(editor.getSnapshot().environment.background.color).toBe("#111111");
  });

  it("selects HDR mode when assigning an HDR environment asset", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr" } });

    const result = buildSetEnvironmentCommand(editor.getSnapshot(), "environment.assetId", "hdr-a");

    expect(result).toEqual({
      ok: true,
      command: { type: "set-environment", environment: { mode: "hdr", environment: { assetId: "hdr-a" } } }
    });
  });

  it("keeps environment asset fields available from the default scene state", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr" } });

    const section = buildEnvironmentSection(editor.getSnapshot());

    expect(section.fields.find((field) => field.id === "environment.assetId")?.disabled).toBeFalsy();
    expect(section.fields.find((field) => field.id === "background.assetId")?.disabled).toBeFalsy();
  });

  it("rejects unknown environment assets before dispatch", () => {
    const result = buildSetEnvironmentCommand(createEditor().getSnapshot(), "environment.assetId", "missing");

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.problem.message).toContain("existing asset");
  });

  it("rejects out-of-range environment numeric drafts before dispatch", () => {
    const result = buildSetEnvironmentCommand(createEditor().getSnapshot(), "background.blur", 1.2);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.problem.message).toContain("less than or equal to 1");
  });
});
