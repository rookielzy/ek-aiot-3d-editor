import { page, userEvent } from "vitest/browser";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, type WorkbenchLocale } from "../src";
import WorkbenchStyles from "../src/components/workbench.css?raw";
import InspectorStyles from "../src/components/inspector.css?raw";

// Issue 07 (React overall consistency and acceptance): drive the published workbench shell at the
// three desktop sizes from the spec and assert what a user can observe — reachable navigation,
// section titles, tabs, collapse controls and scrolling, unclipped primary surfaces, focus across
// i18n switches, and the host-facing style contract. The workbench renders the host's own styles,
// so each test installs the package CSS the way a published `styles.css` consumer does and keeps
// the dev-plugin styles disabled so palette assertions stay meaningful.

const SIZES = [[1440, 900], [1920, 1080], [1100, 800]] as const;
const LONG_NAME = "Factory Floor Conveyor Line B — Section With An Extremely Long Device Name That Must Stay Reachable";
const STYLE_ID = "acceptance-shell-styles";

function fakeRenderer(): RendererLike {
  return {
    domElement: document.createElement("canvas"),
    setSize() {},
    setPixelRatio() {},
    render() {},
    setAnimationLoop() {},
    dispose() {}
  };
}

function disableViteStyles() {
  const styles = [...document.querySelectorAll<HTMLStyleElement>("style[data-vite-dev-id]")];
  const previous = styles.map((style) => style.disabled);
  styles.forEach((style) => { style.disabled = true; });
  return () => styles.forEach((style, index) => { style.disabled = previous[index]; });
}

function installStyles() {
  const element = document.createElement("style");
  element.id = STYLE_ID;
  element.textContent = [WorkbenchStyles, InspectorStyles].join("\n");
  document.head.append(element);
}

function createSeedEditor() {
  const editor = createEditor();
  editor.dispatch({ type: "import-glb", objectId: "long-node", name: LONG_NAME, asset: { id: "long-asset" } });
  editor.dispatch({ type: "import-glb", objectId: "floor", name: "Floor plate", asset: { id: "floor-asset" } });
  editor.dispatch({ type: "select-object", objectId: "long-node" });
  return editor;
}

function waitFor(predicate: () => boolean, timeout = 4000) {
  const started = performance.now();
  return new Promise<void>((resolve, reject) => {
    const tick = () => {
      let passed = false;
      try {
        passed = predicate();
      } catch (error) {
        return reject(error);
      }
      if (passed) return resolve();
      if (performance.now() - started > timeout) return reject(new Error("waitFor timed out"));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function waitForFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function workbench(host: HTMLElement) {
  return host.querySelector<HTMLElement>(".ek-workbench")!;
}

function navigation(host: HTMLElement) {
  return host.querySelector<HTMLElement>("nav.ek-workbench__navigation")!;
}

function navButton(host: HTMLElement, label: string) {
  return [...navigation(host).querySelectorAll<HTMLButtonElement>("button")].find((element) =>
    (element.getAttribute("aria-label") ?? "").startsWith(`${label} `)
  )!;
}

function button(host: HTMLElement, label: string) {
  return [...host.querySelectorAll<HTMLButtonElement>("button")].find((element) =>
    (element.getAttribute("aria-label") ?? element.textContent ?? "").trim() === label
  );
}

function horizontalOverflow(element: HTMLElement) {
  return element.scrollWidth - element.clientWidth;
}

/** The nearest ancestor that clips the rect, or null when it is fully reachable. */
function clippedBy(element: Element) {
  let rect = element.getBoundingClientRect();
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== document.body) {
    const style = getComputedStyle(ancestor);
    if (style.overflowX !== "visible" || style.overflowY !== "visible") {
      const bounds = ancestor.getBoundingClientRect();
      const overflowX = style.overflowX !== "visible" && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1);
      const overflowY = style.overflowY !== "visible" && (rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1);
      if (overflowX || overflowY) return ancestor;
    }
    ancestor = ancestor.parentElement;
  }
  return null;
}

function hitTestReaches(element: Element) {
  // Nothing in the shell may need scrolling to be pointed at: it must be clickable where it renders.
  const rect = element.getBoundingClientRect();
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return Boolean(hit && (element.contains(hit) || hit.contains(element)));
}

describe("React workbench shell acceptance", () => {
  let cleanup: (() => void) | null = null;
  let restoreStyles: (() => void) | null = null;

  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    restoreStyles = disableViteStyles();
    installStyles();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.getElementById(STYLE_ID)?.remove();
    restoreStyles?.();
    restoreStyles = null;
    document.body.innerHTML = "";
  });

  function mount(options: { locale?: WorkbenchLocale; width: number; height: number; toolbar?: boolean } = { width: 1440, height: 900 }) {
    const host = document.createElement("div");
    host.className = "starter-host";
    host.style.cssText = `width:${options.width}px;height:${options.height}px;overflow:hidden;`;
    document.body.append(host);
    const editor = createSeedEditor();
    const root = createRoot(host);
    root.render(<EditorWorkbench
      editor={editor}
      locale={options.locale}
      loader={null}
      rendererFactory={fakeRenderer}
      // Tests skip the runtime; the mount still needs a laid-out viewport.
      className="acceptance-workbench"
      style={{ height: `${options.height}px` }}
      toolbar={options.toolbar ? ({ i18n }) => <button type="button" className="host-toolbar-action">{`${i18n.t("reactWorkbench.leftPanel.nav.scene")} host`}</button> : undefined}
    />);
    cleanup = () => {
      root.unmount();
      editor.dispose();
    };
    return { host, editor };
  }

  it("keeps navigation, titles, tabs and collapse controls reachable and unclipped at desktop sizes", async () => {
    const originalSize = { width: window.innerWidth, height: window.innerHeight };
    try {
      for (const [width, height] of SIZES) {
        await page.viewport(width, height);
        await waitForFrame();
        cleanup?.();
        cleanup = null;
        document.body.innerHTML = "";
        const { host } = mount({ width, height });
        await waitFor(() => Boolean(navigation(host)));
        await waitForFrame();

        const shell = workbench(host);
        expect(shell.getBoundingClientRect().width).toBeLessThanOrEqual(width + 1);
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        expect(shell.querySelector(".ek-workbench__brand")).toBeTruthy();

        // Every view is reachable from the bar with a readable label and count.
        const buttons = [...navigation(host).querySelectorAll<HTMLButtonElement>("button")];
        expect(buttons.map((element) => element.textContent?.replace(/\d+/g, "").trim())).toEqual([
          "Scene", "Assets", "Data", "Project"
        ]);
        expect(buttons.map((element) => element.getAttribute("aria-label")?.split(" ").at(-1))).toEqual(
          buttons.map((element) => element.querySelector("small")!.textContent)
        );
        for (const element of buttons) {
          expect(clippedBy(element)).toBeNull();
          const rect = element.getBoundingClientRect();
          expect(rect.bottom).toBeLessThanOrEqual(shell.getBoundingClientRect().bottom + 1);
          expect(hitTestReaches(element)).toBe(true);
        }

        // Tabs swap one titled section at a time and keep the header inside the panel.
        const panel = shell.querySelector<HTMLElement>("aside.ek-workbench__side-panel")!;
        const titles: Array<[string, string]> = [["Assets", "Assets"], ["Data", "Data sources"], ["Project", "Project"], ["Scene", "Hierarchy"]];
        for (const [label, title] of titles) {
          await userEvent.click(navButton(host, label));
          await waitFor(() => [...panel.querySelectorAll<HTMLElement>("section:not([hidden])")].length === 1);
          const visibleSection = panel.querySelector<HTMLElement>("section:not([hidden])")!;
          expect(visibleSection.querySelector("h2")?.textContent).toBe(title);
          expect(navButton(host, label).getAttribute("aria-pressed")).toBe("true");
          expect(navButton(host, label).getAttribute("aria-expanded")).toBe("true");
          expect(clippedBy(visibleSection.querySelector(".ek-workbench__section-header")!)).toBeNull();
          expect(horizontalOverflow(panel)).toBeLessThanOrEqual(0);
        }

        // Collapse controls stay on-screen and hit-testable at every size.
        for (const label of ["Collapse left panel", "Collapse right panel"]) {
          const control = button(host, label)!;
          const rect = control.getBoundingClientRect();
          expect(rect.left).toBeGreaterThanOrEqual(0);
          expect(rect.right).toBeLessThanOrEqual(width);
          expect(rect.top).toBeGreaterThanOrEqual(0);
          expect(rect.bottom).toBeLessThanOrEqual(height);
          expect(hitTestReaches(control)).toBe(true);
        }

        // Toolbar and status stay inside the frame at the narrow size.
        const toolbar = host.querySelector<HTMLElement>(".ek-workbench__toolbar")!;
        expect(toolbar.getBoundingClientRect().right).toBeLessThanOrEqual(width + 1);
        const status = host.querySelector<HTMLElement>(".ek-workbench__status")!;
        expect(status.getBoundingClientRect().bottom).toBeLessThanOrEqual(height);
      }
    } finally {
      await page.viewport(originalSize.width, originalSize.height);
      await waitForFrame();
    }
  }, 60000);

  it("keeps long names, floating viewport tools and the inspector header inside the frame", async () => {
    const originalSize = { width: window.innerWidth, height: window.innerHeight };
    try {
      for (const [width, height] of SIZES) {
        await page.viewport(width, height);
        cleanup?.();
        cleanup = null;
        document.body.innerHTML = "";
        const { host } = mount({ width, height });
        await waitFor(() => Boolean(host.querySelector(".ek-workbench__tree")));
        await waitForFrame();

        const shell = workbench(host);
        const panel = host.querySelector<HTMLElement>("aside.ek-workbench__side-panel")!;
        const tree = host.querySelector<HTMLElement>(".ek-workbench__tree")!;
        expect(tree.textContent).toContain(LONG_NAME);
        expect(horizontalOverflow(panel)).toBeLessThanOrEqual(0);
        expect(horizontalOverflow(workbench(host))).toBeLessThanOrEqual(0);
        const row = [...tree.querySelectorAll<HTMLElement>(".ek-workbench__tree-row")].find((element) => element.textContent?.includes("Extremely Long"))!;
        expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(panel.getBoundingClientRect().right + 1);

        // Floating viewport controls stay reachable with both panels open.
        const tools = [...host.querySelectorAll<HTMLElement>(".ek-workbench__viewport-tools button, .ek-workbench__panel-toggles button")];
        expect(tools.length).toBeGreaterThan(0);
        for (const element of tools) {
          const rect = element.getBoundingClientRect();
          expect(rect.left).toBeGreaterThanOrEqual(-1);
          expect(rect.right).toBeLessThanOrEqual(width + 1);
          expect(rect.bottom).toBeLessThanOrEqual(shell.getBoundingClientRect().bottom + 1);
          expect(hitTestReaches(element)).toBe(true);
        }

        // The inspector keeps its own header and scroll region inside the right panel.
        const inspector = host.querySelector<HTMLElement>("aside.ek-workbench__right-panel")!;
        expect(inspector.getBoundingClientRect().right).toBeLessThanOrEqual(width + 1);
        expect(horizontalOverflow(inspector)).toBeLessThanOrEqual(0);
      }
    } finally {
      await page.viewport(originalSize.width, originalSize.height);
      await waitForFrame();
    }
  }, 60000);

  it("switches language without rebuilding the editor, and restores focus to the switcher", async () => {
    const { host, editor } = mount({ width: 1440, height: 900 });
    await waitFor(() => Boolean(navigation(host)));
    const idleRuntime = editor.getRuntime();
    const canvas = host.querySelector("canvas");
    const localeSwitch = button(host, "简体中文")!;
    expect(localeSwitch).toBeTruthy();

    await userEvent.click(localeSwitch);
    await waitFor(() => Boolean(button(host, "收起左面板")));
    expect(navButton(host, "场景").getAttribute("aria-label")).toBe("场景 2");
    expect(host.querySelector<HTMLElement>("aside.ek-workbench__side-panel")!.getAttribute("aria-label")).toBe("项目面板");
    expect(document.activeElement).toBe(localeSwitch);
    expect(host.querySelector("canvas")).toBe(canvas);
    expect(editor.getRuntime()).toBe(idleRuntime);
    expect(editor.getSnapshot().selection.objectId).toBe("long-node");

    await userEvent.click(button(host, "English")!);
    await waitFor(() => Boolean(button(host, "Collapse left panel")));
    expect(navButton(host, "Scene").getAttribute("aria-label")).toBe("Scene 2");
    expect(host.querySelector("canvas")).toBe(canvas);
    expect(editor.getRuntime()).toBe(idleRuntime);
  }, 30000);

  it("isolates published styles from host styles and leaves host regions unstyled", async () => {
    const hostStyle = document.createElement("style");
    hostStyle.textContent = `
      .starter-host { color: rgb(0, 128, 96); font: 12px/1.2 serif; }
      .starter-host button { border: 3px dashed rgb(0, 128, 96); }
    `;
    document.head.append(hostStyle);
    try {
      const { host } = mount({ width: 1440, height: 900, toolbar: true });
      await waitFor(() => Boolean(navigation(host)));
      expect(getComputedStyle(navigation(host)).backgroundColor).toBe("rgb(255, 255, 255)");
      const headerFont = getComputedStyle(host.querySelector(".ek-workbench__section-header h2")!).fontFamily;
      expect(headerFont).toContain("system-ui");
      expect(headerFont).not.toMatch(/(^|,\s*)serif\s*$/);
      const sceneButton = navButton(host, "Scene");
      expect(getComputedStyle(sceneButton).color).not.toBe("rgb(0, 128, 96)");
      // Host regions keep the host's own styling; the package only styles its shell hooks.
      const hostAction = host.querySelector<HTMLElement>(".ek-workbench__toolbar-region .host-toolbar-action")!;
      expect(hostAction).toBeTruthy();
      expect(getComputedStyle(hostAction).borderTopStyle).toBe("dashed");
    } finally {
      hostStyle.remove();
    }
  }, 30000);
});
