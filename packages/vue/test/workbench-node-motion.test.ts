import { DOMWrapper, mount } from "@vue/test-utils";
import { markRaw } from "vue";
import { it } from "vitest";
import { verifyWorkbenchNodeMotion } from "../../test/workbench-node-motion";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";
import { selectInspectorOption } from "./support/inspector-controls";

it("authors, switches, and stops node motion in the Vue Workbench", async () => {
  await verifyWorkbenchNodeMotion(
    "zh-CN",
    (props, host) =>
      mount(EditorWorkbench, { attachTo: host, props: { ...props, editor: markRaw(props.editor), resolver: markRaw(props.resolver) } }),
    (trigger, value) => selectInspectorOption(new DOMWrapper(trigger), value)
  );
});
