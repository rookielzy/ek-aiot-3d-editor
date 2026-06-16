import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { CommandDispatcher } from "../commands/dispatcher";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { buildLightingPresetCommands } from "./presets";

describe("lighting presets", () => {
  it("creates a conservative directional key light as undoable commands", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const preset = buildLightingPresetCommands(store.getSnapshot().lights, "conservative-key-light");

    expect(preset.ok).toBe(true);
    expect(preset.commands).toHaveLength(1);
    const result = dispatcher.dispatch({ type: "batch", commands: preset.commands });

    expect(result.ok).toBe(true);
    expect(store.getSnapshot().lights["key-light"]).toMatchObject({
      kind: "directional",
      shadow: {
        enabled: true,
        mapSize: { width: 1024, height: 1024 }
      }
    });
    dispatcher.undo();
    expect(store.getSnapshot().lights["key-light"]).toBeUndefined();
  });

  it("updates an existing soft spotlight through normal update-light commands", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "add-light", light: { id: "spot-a", kind: "spot" } });
    const preset = buildLightingPresetCommands(store.getSnapshot().lights, "soft-spotlight", { lightId: "spot-a" });

    expect(preset.commands).toEqual([expect.objectContaining({ type: "update-light", lightId: "spot-a" })]);
    const result = dispatcher.dispatch({ type: "batch", commands: preset.commands });

    expect(result.ok).toBe(true);
    expect(store.getSnapshot().lights["spot-a"]).toMatchObject({
      kind: "spot",
      penumbra: 0.45,
      shadow: { enabled: true, camera: { near: 0.5, far: 40 } }
    });
  });

  it("warns when creating a point shadow preview preset", () => {
    const preset = buildLightingPresetCommands({}, "point-shadow-preview");

    expect(preset.ok).toBe(true);
    expect(preset.problem?.code).toBe("lighting-preset-point-shadow-cost");
    expect(preset.commands).toEqual([expect.objectContaining({ type: "add-light" })]);
  });

  it("creates collision-safe ids when the requested light id belongs to another kind", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });

    const preset = buildLightingPresetCommands(store.getSnapshot().lights, "conservative-key-light", { lightId: "light-a" });
    const result = dispatcher.dispatch({ type: "batch", commands: preset.commands });

    expect(result.ok).toBe(true);
    expect(store.getSnapshot().lights["light-a"].kind).toBe("ambient");
    expect(store.getSnapshot().lights["light-a-2"]).toMatchObject({
      kind: "directional",
      shadow: { enabled: true }
    });
  });

  it("disables shadows only on shadow-capable lights", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });
    dispatcher.dispatch({
      type: "add-light",
      light: {
        id: "sun",
        kind: "directional",
        shadow: { enabled: true }
      }
    });
    dispatcher.dispatch({
      type: "add-light",
      light: {
        id: "point-a",
        kind: "point",
        shadow: { enabled: false }
      }
    });

    const preset = buildLightingPresetCommands(store.getSnapshot().lights, "disable-all-shadows");
    const result = dispatcher.dispatch({ type: "batch", commands: preset.commands });

    expect(preset.commands).toEqual([expect.objectContaining({ type: "update-light", lightId: "sun" })]);
    expect(result.ok).toBe(true);
    expect(store.getSnapshot().lights.sun).toMatchObject({ shadow: { enabled: false } });
    expect("shadow" in store.getSnapshot().lights["ambient-a"]).toBe(false);
  });
});
