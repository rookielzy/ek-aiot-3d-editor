import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { CommandDispatcher } from "./dispatcher";

describe("set environment command", () => {
  it("stores solid background settings without runtime texture state", () => {
    const dispatcher = new CommandDispatcher(new EditorStore(), new CommandHistory(), new AssetRegistry());

    const result = dispatcher.dispatch({
      type: "set-environment",
      environment: {
        mode: "solid",
        background: {
          mode: "solid",
          color: "#202530",
          intensity: 0.8
        }
      }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.environment.background).toMatchObject({
      mode: "solid",
      color: "#202530",
      intensity: 0.8
    });
    expect(JSON.stringify(result.snapshot)).not.toContain("Texture");
  });

  it("stores HDR environment references with intensity and rotation", () => {
    const dispatcher = new CommandDispatcher(new EditorStore(), new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr", source: { runtime: true } } });

    const result = dispatcher.dispatch({
      type: "set-environment",
      environment: {
        mode: "hdr",
        environment: {
          assetId: "hdr-a",
          intensity: 1.5,
          rotation: { x: 0, y: 1, z: 0 }
        },
        background: {
          mode: "hdr",
          assetId: "hdr-a",
          blur: 0.25
        }
      }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.environment.environment).toEqual({
      assetId: "hdr-a",
      intensity: 1.5,
      rotation: { x: 0, y: 1, z: 0 }
    });
    expect(result.snapshot.environment.background.assetId).toBe("hdr-a");
    expect(JSON.stringify(result.snapshot)).not.toContain("runtime");
  });

  it("rejects unknown environment assets without mutating state", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const before = store.getSnapshot();

    const result = dispatcher.dispatch({
      type: "set-environment",
      environment: {
        mode: "hdr",
        environment: {
          assetId: "missing",
          intensity: 1,
          rotation: { x: 0, y: 0, z: 0 }
        }
      }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Environment asset");
    expect(store.getSnapshot()).toBe(before);
  });

  it("clears stale asset fields when switching back to solid background", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr" } });
    dispatcher.dispatch({
      type: "set-environment",
      environment: {
        mode: "hdr",
        environment: { assetId: "hdr-a", intensity: 1, rotation: { x: 0, y: 0, z: 0 } },
        background: { mode: "hdr", assetId: "hdr-a" }
      }
    });

    const result = dispatcher.dispatch({
      type: "set-environment",
      environment: {
        mode: "solid",
        background: { mode: "solid", color: "#111111" }
      }
    });

    expect(result.ok).toBe(true);
    expect(store.getSnapshot().environment.environment.assetId).toBeUndefined();
    expect(store.getSnapshot().environment.background.assetId).toBeUndefined();
    expect(store.getSnapshot().environment.background.color).toBe("#111111");
  });

  it("requires texture or HDR asset references for matching environment modes", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture" } });

    const missing = dispatcher.dispatch({ type: "set-environment", environment: { mode: "texture" } });
    const wrongKind = dispatcher.dispatch({
      type: "set-environment",
      environment: {
        mode: "hdr",
        environment: { assetId: "texture-a", intensity: 1, rotation: { x: 0, y: 0, z: 0 } }
      }
    });

    expect(missing.ok).toBe(false);
    expect(wrongKind.ok).toBe(false);
    expect(wrongKind.error).toContain("Environment asset kind is unsupported");
  });

  it.each([
    ["invalid environment mode", { mode: "sky" }],
    ["invalid background mode", { background: { mode: "gradient" } }],
    ["invalid solid color", { background: { mode: "solid", color: "black" } }],
    ["negative intensity", { background: { mode: "solid", color: "#111111", intensity: -1 } }],
    ["blur above range", { background: { mode: "hdr", assetId: "missing", blur: 2 } }],
    ["non-finite rotation", { environment: { intensity: 1, rotation: { x: 0, y: Number.POSITIVE_INFINITY, z: 0 } } }]
  ])("rejects %s without recording history", (_label, environment) => {
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());
    const before = store.getSnapshot();
    const undoCount = history.state.undoCount;

    const result = dispatcher.dispatch({
      type: "set-environment",
      environment: environment as never
    });

    expect(result.ok).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(history.state.undoCount).toBe(undoCount);
  });

  it("undoes and redoes environment edits", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({
      type: "set-environment",
      environment: { background: { mode: "solid", color: "#111111" } }
    });

    expect(store.getSnapshot().environment.background.color).toBe("#111111");
    dispatcher.undo();
    expect(store.getSnapshot().environment.background.mode).toBe("none");
    dispatcher.redo();
    expect(store.getSnapshot().environment.background.color).toBe("#111111");
  });
});
