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

    expect(editor.getSnapshot().environment.background.source).toEqual({ kind: "solid", color: "#111111" });
    expect(editor.getSnapshot().environment.background.blur).toBeUndefined();
  });

  it("selects HDR mode when assigning an HDR environment asset", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr" } });

    const result = buildSetEnvironmentCommand(editor.getSnapshot(), "lighting.source.assetId", "hdr-a");

    expect(result).toEqual({
      ok: true,
      command: { type: "set-environment", environment: { lighting: { source: { kind: "hdr", assetId: "hdr-a" } } } }
    });
  });

  it("keeps environment asset fields available from the default scene state", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr" } });

    const section = buildEnvironmentSection(editor.getSnapshot());

    expect(section.fields.find((field) => field.id === "lighting.source.assetId")?.disabled).toBeFalsy();
    expect(section.fields.find((field) => field.id === "background.source.assetId")?.disabled).toBeFalsy();
  });

  it("exposes environment preset actions as core commands", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "studio-hdr", kind: "hdr" } });

    const section = buildEnvironmentSection(editor.getSnapshot());
    const shared = section.actions?.find((action) => action.id === "environment-preset-shared-asset");

    expect(shared).toMatchObject({
      label: "Shared lighting/background",
      command: {
        type: "set-environment",
        environment: {
          lighting: { source: { kind: "hdr", assetId: "studio-hdr" } },
          background: { source: { kind: "hdr", assetId: "studio-hdr" } }
        }
      }
    });
  });

  it("exposes complete cubemap preset actions when named face assets exist", () => {
    const editor = createEditor();
    for (const id of ["px", "nx", "py", "ny", "pz", "nz"]) {
      editor.dispatch({ type: "register-asset", asset: { id, kind: "texture" } });
    }

    const section = buildEnvironmentSection(editor.getSnapshot());
    const cubemap = section.actions?.find((action) => action.id === "environment-preset-cubemap-both");

    expect(cubemap?.disabled).toBeFalsy();
    expect(cubemap?.command).toMatchObject({
      type: "set-environment",
      environment: {
        lighting: { source: { kind: "cubemap" } },
        background: { source: { kind: "cubemap" } }
      }
    });
    expect(cubemap?.command && cubemap.command.type === "set-environment"
      ? cubemap.command.environment.lighting?.source?.kind === "cubemap"
        ? cubemap.command.environment.lighting.source.faces.map((face) => face.assetId)
        : []
      : []).toEqual(["px", "nx", "py", "ny", "pz", "nz"]);
  });

  it("rejects unknown environment assets before dispatch", () => {
    const result = buildSetEnvironmentCommand(createEditor().getSnapshot(), "lighting.source.assetId", "missing");

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.problem.message).toContain("existing asset");
  });

  it("rejects out-of-range environment numeric drafts before dispatch", () => {
    const result = buildSetEnvironmentCommand(createEditor().getSnapshot(), "background.blur", 1.2);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.problem.message).toContain("less than or equal to 1");
  });
});
