import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { InspectorTextInput } from "../src/components/InspectorTextInput";

it("does not submit IME confirmation and cancels text drafts without a blur commit", () => {
  const commit = vi.fn(() => true);
  render(<InspectorTextInput aria-label="Name" value="Light" onCommit={commit} />);
  const input = screen.getByLabelText("Name") as HTMLInputElement;
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: "灯光" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(commit).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.blur(input);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit).toHaveBeenCalledWith("灯光");
  fireEvent.change(input, { target: { value: "取消" } });
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.blur(input);
  expect(input.value).toBe("Light");
  expect(commit).toHaveBeenCalledTimes(1);
});
