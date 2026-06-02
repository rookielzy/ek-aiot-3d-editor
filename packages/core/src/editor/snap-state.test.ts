import { describe, expect, it } from "vitest";
import { EditorSnapState } from "./snap-state";
import { EditorTransformModeState } from "../runtime/transform/transform-mode";

describe("editor interaction session state", () => {
  it("publishes snap settings and can clear subscribers", () => {
    const snap = new EditorSnapState();
    const values: Array<ReturnType<EditorSnapState["get"]>> = [];
    snap.subscribe((settings) => values.push(settings));

    snap.set({ translate: 0.5 });
    snap.clear();
    snap.set({ translate: 1 });

    expect(values).toEqual([{}, { translate: 0.5 }]);
  });

  it("publishes transform mode changes and resets to translate", () => {
    const transformMode = new EditorTransformModeState();
    const values: string[] = [];
    transformMode.subscribe((mode) => values.push(mode));

    transformMode.set("rotate");
    transformMode.reset();

    expect(values).toEqual(["translate", "rotate", "translate"]);
  });
});
