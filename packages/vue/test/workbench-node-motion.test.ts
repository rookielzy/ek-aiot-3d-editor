import { mount } from "@vue/test-utils";
import { markRaw } from "vue";
import { it } from "vitest";
import { verifyWorkbenchNodeMotion } from "../../test/workbench-node-motion";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";

it("authors and stops the selected node's spin in the Vue Workbench", async () => {
  await verifyWorkbenchNodeMotion("zh-CN", (props, host) =>
    mount(EditorWorkbench, { attachTo: host, props: { ...props, editor: markRaw(props.editor), resolver: markRaw(props.resolver) } })
  );
});
