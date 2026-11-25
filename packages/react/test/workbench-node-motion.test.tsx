import { render } from "@testing-library/react";
import { it } from "vitest";
import { verifyWorkbenchNodeMotion } from "../../test/workbench-node-motion";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import { selectInspectorOption } from "./support/inspector-controls";

it("authors, switches, and stops node motion in the React Workbench", async () => {
  await verifyWorkbenchNodeMotion(
    "en",
    (props, host) => render(<EditorWorkbench {...props} />, { container: host }),
    (trigger, value) => selectInspectorOption(trigger, value)
  );
});
