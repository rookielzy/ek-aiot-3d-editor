import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { CommandDispatcher } from "../commands/dispatcher";
import type { SetEnvironmentCommand } from "../commands/types";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import {
  buildClearEnvironmentPreset,
  buildEnvironmentBackgroundAssetPreset,
  buildEnvironmentCubemapPreset,
  buildEnvironmentLightingAssetPreset,
  buildEnvironmentSharedAssetPreset,
  buildEnvironmentWithConservativeLightsPreset,
  buildSolidBackgroundPreset
} from "./presets";

describe("environment presets", () => {
  it("builds deterministic set-environment commands for common source presets", () => {
    expect(buildClearEnvironmentPreset()).toMatchObject({
      ok: true,
      command: {
        type: "set-environment",
        environment: {
          lighting: { source: { kind: "none" } },
          background: { source: { kind: "none" } }
        }
      }
    });
    expect(buildSolidBackgroundPreset("#202530")).toEqual({
      ok: true,
      command: { type: "set-environment", environment: { background: { source: { kind: "solid", color: "#202530" } } } }
    });
    expect(buildEnvironmentLightingAssetPreset({ id: "hdr-a", kind: "hdr" })).toEqual({
      ok: true,
      command: { type: "set-environment", environment: { lighting: { source: { kind: "hdr", assetId: "hdr-a" } } } }
    });
    expect(buildEnvironmentBackgroundAssetPreset({ id: "sky-a", kind: "texture" }, { equirectangular: true })).toEqual({
      ok: true,
      command: { type: "set-environment", environment: { background: { source: { kind: "equirectangular", assetId: "sky-a" } } } }
    });
  });

  it("uses one asset for both lighting and sky background", () => {
    const result = buildEnvironmentSharedAssetPreset({ id: "studio-a", kind: "hdr" });

    expect(result).toEqual({
      ok: true,
      command: {
        type: "set-environment",
        environment: {
          lighting: { source: { kind: "hdr", assetId: "studio-a" } },
          background: { source: { kind: "hdr", assetId: "studio-a" } }
        }
      }
    });
  });

  it("rejects invalid preset input before dispatch", () => {
    expect(buildSolidBackgroundPreset("black")).toMatchObject({
      ok: false,
      problem: { code: "environment-preset-invalid" }
    });
    expect(buildEnvironmentLightingAssetPreset({ id: "model-a", kind: "glb" })).toMatchObject({
      ok: false,
      problem: { code: "environment-preset-invalid" }
    });
    expect(buildEnvironmentCubemapPreset([{ role: "positive-x", assetId: "px" }])).toMatchObject({
      ok: false,
      problem: { code: "environment-preset-invalid" }
    });
  });

  it("dispatches shared HDR presets as one undoable command", () => {
    const store = new EditorStore();
    const history = new CommandHistory();
    const assets = new AssetRegistry();
    const dispatcher = new CommandDispatcher(store, history, assets);
    dispatcher.dispatch({ type: "register-asset", asset: { id: "studio-a", kind: "hdr" } });
    const preset = buildEnvironmentSharedAssetPreset({ id: "studio-a", kind: "hdr" });
    if (!preset.ok) {
      throw new Error(preset.problem.message);
    }

    const result = dispatcher.dispatch(preset.command);

    expect(result.ok).toBe(true);
    expect(store.getSnapshot().environment.lighting.source).toEqual({ kind: "hdr", assetId: "studio-a" });
    expect(store.getSnapshot().environment.background.source).toEqual({ kind: "hdr", assetId: "studio-a" });
    expect(history.state.undoCount).toBe(2);

    dispatcher.undo();
    expect(store.getSnapshot().environment.lighting.source.kind).toBe("none");
    expect(store.getSnapshot().environment.background.source.kind).toBe("none");
  });

  it("wraps an environment command with conservative light commands", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const environmentCommand: SetEnvironmentCommand = {
      type: "set-environment",
      environment: { background: { source: { kind: "solid", color: "#202530" } } }
    };
    const preset = buildEnvironmentWithConservativeLightsPreset(store.getSnapshot(), environmentCommand);
    if (!preset.ok) {
      throw new Error(preset.problem.message);
    }

    const result = dispatcher.dispatch(preset.command);

    expect(result.ok).toBe(true);
    expect(store.getSnapshot().environment.background.source).toEqual({ kind: "solid", color: "#202530" });
    expect(store.getSnapshot().lights["environment-ambient-light"]).toMatchObject({ kind: "ambient", intensity: 0.35 });
    expect(store.getSnapshot().lights["environment-key-light"]).toMatchObject({ kind: "directional", intensity: 1 });
  });
});
