import { render } from "@testing-library/react";
import { it } from "vitest";
import { verifyWorkbenchNodeMotion } from "../../test/workbench-node-motion";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

it("authors and stops the selected node's spin in the React Workbench", async () => {
  await verifyWorkbenchNodeMotion("en", (props, host) =>
    render(<EditorWorkbench {...props} />, { container: host })
  );
});
