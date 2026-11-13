import { page, userEvent } from "vitest/browser";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, type WorkbenchLocale } from "../src";
import WorkbenchStyles from "../src/components/workbench.css?raw";
import InspectorStyles from "../src/components/inspector.css?raw";
import UiStyles from "../src/components/ui/ui.css?inline";

// Issue 07 (React overall consistency and acceptance): drive the published workbench shell at the
// three desktop sizes from the spec and assert what a user can observe — reachable navigation,
// section titles, tabs, collapse controls and scrolling, unclipped primary surfaces and layers,
// focus across i18n switches, and the host-facing style contract. Landmarks, roles, accessible
// names and visible text drive every assertion, so a restyled or restructured shell keeps passing
// as long as the user experience holds. The workbench renders the host's own styles, so each test
// installs the complete compiled source styles and disables duplicate dev-plugin styles.
// The built styles.css artifact is verified separately during release acceptance.

const SIZES = [[1440, 900], [1920, 1080], [1100, 800]] as const;
const LONG_NAME = "Factory Floor Conveyor Line B — Section With An Extremely Long Device Name That Must Stay Reachable";
const STYLE_ID = "acceptance-shell-styles";

function fakeRenderer(): RendererLike {
  return {
    domElement: document.createElement("canvas"),
    setSize() {},
    render() {},
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
  element.textContent = [UiStyles, WorkbenchStyles, InspectorStyles].join("\n");
  document.head.append(element);
}

function createSeedEditor() {
  const editor = createEditor();
  editor.dispatch({ type: "import-glb", objectId: "long-node", name: LONG_NAME, asset: { id: "long-asset" } });
  editor.dispatch({ type: "import-glb", objectId: "floor", name: "Floor plate", asset: { id: "floor-asset" } });
  editor.dispatch({ type: "select-object", objectId: "long-node" });
  return editor;
}

function waitFor(predicate: () => boolean, timeout = 8000) {
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

/** The workbench shell is the host's only landmark. */
function workbench(host: HTMLElement) {
  return host.querySelector<HTMLElement>("main")!;
}

function navigation(host: HTMLElement) {
  return host.querySelector<HTMLElement>("main nav")!;
}

/** The left workspace: the panel the navigation tabs swap content in. */
function workspace(host: HTMLElement) {
  // The navigation points at the panel it swaps; that panel is the workspace.
  return document.getElementById(navigation(host).querySelector("button")!.getAttribute("aria-controls")!)!;
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

/** A button whose accessible name or visible text matches, wherever a layer renders it. */
function control(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((element) =>
    (element.getAttribute("aria-label") ?? element.textContent ?? "").trim() === label
  );
}

/** The inspector: the panel that holds the selection tabs. */
function inspector(host: HTMLElement) {
  return host.querySelector<HTMLElement>('[role="tablist"]')!.closest("aside") as HTMLElement;
}

function horizontalOverflow(element: Element) {
  return element.scrollWidth - element.clientWidth;
}

/** The nearest ancestor that clips the rect, or null when the element renders inside it. */
function clippedBy(element: Element) {
  const rect = element.getBoundingClientRect();
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

/** The point stays inside the frame a user is looking at. */
function insideFrame(element: Element, width: number, height: number) {
  const rect = element.getBoundingClientRect();
  return rect.left >= -1 && rect.top >= -1 && rect.right <= width + 1 && rect.bottom <= height + 1;
}

function hitTestReaches(element: Element) {
  // Nothing may need scrolling to be pointed at: it must be clickable where it renders.
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

  function mount(options: { locale?: WorkbenchLocale; width: number; height: number; toolbar?: boolean; hostRegions?: boolean } = { width: 1440, height: 900 }) {
    const host = document.createElement("div");
    host.className = "starter-host";
    host.style.cssText = `width:${options.width}px;height:${options.height}px;overflow:hidden;`;
    document.body.append(host);
    const editor = createSeedEditor();
    const root = createRoot(host);
    root.render(<EditorWorkbench
      editor={editor}
      locale={options.locale}
      rendererFactory={fakeRenderer}
      // Tests skip the runtime; the mount still needs a laid-out viewport.
      className="acceptance-workbench"
      style={{ height: `${options.height}px` }}
      toolbar={options.toolbar ? ({ i18n }) => <button type="button" className="host-toolbar-action">{`${i18n.t("reactWorkbench.leftPanel.nav.scene")} host`}</button> : undefined}
      viewportOverlay={options.hostRegions ? () => <p className="host-overlay">Host overlay</p> : undefined}
      status={options.hostRegions ? () => <span className="host-status">Host status</span> : undefined}
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
        // The shell never forces the host document to scroll sideways.
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);

        // Every view is reachable from the bar with a readable label and its own count.
        const buttons = [...navigation(host).querySelectorAll<HTMLButtonElement>("button")];
        expect(buttons.map((element) => element.textContent?.replace(/\d+/g, "").trim())).toEqual([
          "Scene", "Assets", "Data", "Project"
        ]);
        expect(buttons.map((element) => element.getAttribute("aria-label"))).toEqual([
          "Scene 2", "Assets 2", "Data 0", "Project 2"
        ]);
        for (const element of buttons) {
          expect(clippedBy(element)).toBeNull();
          const rect = element.getBoundingClientRect();
          expect(rect.bottom).toBeLessThanOrEqual(shell.getBoundingClientRect().bottom + 1);
          expect(hitTestReaches(element)).toBe(true);
        }

        // Tabs swap one titled region at a time and keep its title inside the panel.
        const panel = workspace(host);
        // Jump to a neutral tab first so every step below expands a panel instead of toggling it.
        await userEvent.click(navButton(host, "Data"));
        await waitFor(() => navButton(host, "Data").getAttribute("aria-expanded") === "true");
        const titles: Array<[string, string]> = [["Assets", "Assets"], ["Data", "Data sources"], ["Project", "Project"], ["Scene", "Hierarchy"]];
        for (const [label, title] of titles) {
          await userEvent.click(navButton(host, label));
          const region = page.getByRole("region", { name: title, exact: true });
          await expect.element(region).toBeVisible();
          const heading = region.getByRole("heading", { name: title, exact: true }).element();
          for (const otherTitle of titles.map((entry) => entry[1]).filter((entry) => entry !== title)) {
            await expect.element(page.getByRole("region", { name: otherTitle, exact: true, includeHidden: true })).not.toBeVisible();
          }
          expect(heading.textContent).toBe(title);
          expect(navButton(host, label).getAttribute("aria-pressed")).toBe("true");
          expect(navButton(host, label).getAttribute("aria-expanded")).toBe("true");
          expect(clippedBy(heading)).toBeNull();
          expect(horizontalOverflow(panel)).toBeLessThanOrEqual(0);
        }

        // Collapse controls stay on-screen and pointer-reachable at every size.
        for (const label of ["Collapse left panel", "Collapse right panel"]) {
          const element = control(label)!;
          expect(insideFrame(element, width, height)).toBe(true);
          expect(hitTestReaches(element)).toBe(true);
        }

        // Toolbar and status stay inside the frame at the narrow size.
        expect(workbench(host).querySelector("footer")!.getBoundingClientRect().right).toBeLessThanOrEqual(width + 1);
        expect(workbench(host).querySelector("footer")!.getBoundingClientRect().bottom).toBeLessThanOrEqual(height + 1);
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
        await waitFor(() => Boolean(host.querySelector('[role="treeitem"]')));
        await waitForFrame();

        const shell = workbench(host);
        const panel = workspace(host);
        const row = [...host.querySelectorAll<HTMLElement>('[role="treeitem"]')].find((element) => element.textContent?.includes(LONG_NAME))!;
        expect(row).toBeTruthy();
        expect(horizontalOverflow(panel)).toBeLessThanOrEqual(0);
        expect(horizontalOverflow(shell)).toBeLessThanOrEqual(0);
        // A long device name stays inside its row instead of pushing the panel wider.
        expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(panel.getBoundingClientRect().right + 1);

        // Controls floating over the viewport stay reachable with both panels open. They overlap
        // whatever they hover above, so hit-testing them is the whole promise.
        const tools = [...shell.querySelectorAll<HTMLElement>('[aria-label="3D viewport"] button')]
          .filter((element) => element.getBoundingClientRect().width > 0);
        expect(tools.length).toBeGreaterThan(0);
        for (const element of tools) {
          expect(insideFrame(element, width, height)).toBe(true);
          expect(hitTestReaches(element)).toBe(true);
        }

        // The inspector keeps its own tab list and header inside the right panel.
        const inspectorPanel = inspector(host);
        expect(inspectorPanel.getBoundingClientRect().right).toBeLessThanOrEqual(width + 1);
        expect(horizontalOverflow(inspectorPanel)).toBeLessThanOrEqual(0);
        const inspectorTabs = [...inspectorPanel.querySelectorAll<HTMLElement>('[role="tab"]')];
        expect(inspectorTabs.length).toBeGreaterThan(0);
        for (const tab of inspectorTabs) {
          expect(clippedBy(tab)).toBeNull();
          expect(hitTestReaches(tab)).toBe(true);
        }
      }
    } finally {
      await page.viewport(originalSize.width, originalSize.height);
      await waitForFrame();
    }
  }, 60000);

  it("shows empty, filtered and error states legibly at desktop sizes", async () => {
    const originalSize = { width: window.innerWidth, height: window.innerHeight };
    try {
      for (const [width, height] of SIZES) {
        await page.viewport(width, height);
        cleanup?.();
        cleanup = null;
        document.body.innerHTML = "";
        const { host } = mount({ width, height });
        await waitFor(() => Boolean(navigation(host)));
        await waitForFrame();
        const panel = workspace(host);

        // An empty data workspace says so where the user looks.
        // Tabs only swap content while the panel is open; clicking the active tab collapses it.
        if (navButton(host, "Data").getAttribute("aria-pressed") !== "true" || navButton(host, "Data").getAttribute("aria-expanded") === "false") {
          await userEvent.click(navButton(host, "Data"));
        }
        await waitFor(() => (panel.textContent ?? "").includes("No connections yet"));
        const dataSection = page.getByRole("region", { name: "Data sources", exact: true }).element();
        expect(dataSection.textContent ?? "").toContain("No connections yet");
        expect(clippedBy(dataSection)).toBeNull();
        expect(horizontalOverflow(panel)).toBeLessThanOrEqual(0);

        // A filter that matches nothing explains itself instead of showing an empty list.
        await userEvent.click(navButton(host, "Assets"));
        await waitFor(() => (navButton(host, "Assets").getAttribute("aria-expanded")) === "true");
        // Only the visible workspace holds the filter the user types into.
        const visibleWorkspace = () => page.getByRole("region", { name: "Assets", exact: true }).element();
        await waitFor(() => Boolean(visibleWorkspace().querySelector<HTMLInputElement>('input[type="search"]')));
        await waitForFrame();
        const assetSearch = () => visibleWorkspace().querySelector<HTMLInputElement>('input[type="search"]')!;
        await userEvent.fill(assetSearch(), "nothing-matches-this");
        await waitFor(() => (panel.textContent ?? "").includes("No matching assets"));
        expect(panel.querySelector<HTMLElement>('[role="status"]')?.textContent ?? panel.textContent).toContain("No matching assets");
        expect(clippedBy(visibleWorkspace())).toBeNull();

        // A rejected import reports the failure inside the queue with a readable reason.
        await userEvent.fill(assetSearch(), "");
        const fileInput = visibleWorkspace().querySelector<HTMLInputElement>('input[type="file"]')!;
        await userEvent.upload(fileInput, new File(["x"], "notes.txt", { type: "text/plain" }));
        await waitFor(() => (panel.textContent ?? "").includes("Unsupported asset type"));
        const failure = [...panel.querySelectorAll<HTMLElement>("li")].find((element) => element.textContent?.includes("Unsupported asset type"))!;
        expect(failure.textContent).toContain("notes.txt");
        expect(clippedBy(failure)).toBeNull();
        expect(insideFrame(failure, width, height)).toBe(true);

        // Project problems stay readable: an empty list says so, and listed problems stay in frame.
        if (navButton(host, "Project").getAttribute("aria-expanded") === "false") await userEvent.click(navButton(host, "Project"));
        await waitFor(() => (navButton(host, "Project").getAttribute("aria-expanded")) === "true");
        await expect.element(page.getByRole("region", { name: "Project", exact: true })).toBeVisible();
        const project = page.getByRole("region", { name: "Project", exact: true }).element();
        expect(project.querySelector("h2")?.textContent).toBe("Project");
        for (const item of project.querySelectorAll<HTMLElement>("li")) {
          expect(clippedBy(item)).toBeNull();
        }
        expect(horizontalOverflow(project)).toBeLessThanOrEqual(0);
      }
    } finally {
      await page.viewport(originalSize.width, originalSize.height);
      await waitForFrame();
    }
  }, 90000);

  it("opens menus and dialogs inside the frame, closes the top layer with Escape and returns focus", async () => {
    const originalSize = { width: window.innerWidth, height: window.innerHeight };
    try {
      for (const [width, height] of SIZES) {
        await page.viewport(width, height);
        cleanup?.();
        cleanup = null;
        document.body.innerHTML = "";
        const { host } = mount({ width, height });
        await waitFor(() => Boolean(navigation(host)));
        await waitForFrame();

        // The project menu draws inside the frame and Escape hands focus back to its trigger.
        const projectMenu = host.querySelector<HTMLButtonElement>('main [aria-haspopup="menu"]')!;
        expect(projectMenu.getAttribute("aria-expanded")).toBe("false");
        await userEvent.click(projectMenu);
        await waitFor(() => Boolean(document.querySelector('[role="menu"]')));
        const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
        expect(insideFrame(menu, width, height)).toBe(true);
        expect(menu.querySelectorAll('[role^="menuitem"]').length).toBeGreaterThan(0);
        for (const item of menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')) {
          expect(clippedBy(item)).toBeNull();
        }
        await userEvent.keyboard("{Escape}");
        await waitFor(() => !document.querySelector('[role="menu"]'));
        expect(document.activeElement).toBe(projectMenu);

        // The hierarchy row menu belongs to its row and closes with Escape without moving focus.
        await userEvent.click(navButton(host, "Scene"));
        if (navButton(host, "Scene").getAttribute("aria-expanded") === "false") await userEvent.click(navButton(host, "Scene"));
        await waitFor(() => Boolean(workspace(host).querySelector('[role="treeitem"]')));
        await waitForFrame();
        const row = [...host.querySelectorAll<HTMLElement>('[role="treeitem"]')].find((element) => element.textContent?.includes("Floor plate"))!;
        // Selecting is the user's reason to open the row menu, and keeps the row reachable.
        await userEvent.click(row);
        await waitFor(() => row.getAttribute("aria-selected") === "true");
        const rowMenu = control(`Actions for Floor plate`)!;
        await userEvent.click(rowMenu);
        await waitFor(() => Boolean(document.querySelector('[role="menu"]')));
        const panel = document.querySelector<HTMLElement>('[role="menu"]')!;
        expect(insideFrame(panel, width, height)).toBe(true);
        const deleteItem = [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((element) => element.textContent === "Delete")!;
        expect(deleteItem).toBeTruthy();
        await userEvent.keyboard("{Escape}");
        await waitFor(() => !document.querySelector('[role="menu"]'));

        expect(document.activeElement).toBe(row);

        // Deleting through the menu updates the tree and the status the user reads.
        await userEvent.click(rowMenu);
        await waitFor(() => Boolean(document.querySelector('[role^="menuitem"]')));
        await userEvent.click([...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((element) => element.textContent === "Delete")!);
        await waitFor(() => ![...host.querySelectorAll<HTMLElement>('[role="treeitem"]')].some((element) => element.textContent?.includes("Floor plate")));
        expect(host.querySelector("footer")?.textContent ?? "").toMatch(/\d/);

        // The data-source connection dialog stays inside the frame at every size.
        await userEvent.click(navButton(host, "Data"));
        const addConnection = page.getByRole("button", { name: "New connection", exact: true });
        await expect.element(addConnection).toBeVisible();
        await addConnection.click();
        await waitFor(() => Boolean(document.querySelector("dialog[open]")));
        const dialog = document.querySelector<HTMLElement>("dialog[open]")!;
        expect(insideFrame(dialog, width, height)).toBe(true);
        expect(dialog.scrollWidth).toBeLessThanOrEqual(width);
        await userEvent.keyboard("{Escape}");
        await waitFor(() => !document.querySelector("dialog[open]"));
        await expect.element(addConnection).toHaveFocus();
      }
    } finally {
      await page.viewport(originalSize.width, originalSize.height);
      await waitForFrame();
    }
  }, 90000);

  it("resizes panels from the keyboard and the pointer without clipping either panel", async () => {
    // The panel handles belong to the desktop shell, so ask for a desktop window first and
    // hand the default window back afterwards so neighbouring tests keep their size.
    const originalSize = { width: window.innerWidth, height: window.innerHeight };
    await page.viewport(1440, 900);
    try {
      const { host } = mount({ width: 1440, height: 900 });
      await waitFor(() => Boolean(host.querySelector('[role="separator"]')));
      await waitForFrame();
      const panel = workspace(host);
      const width = () => Math.round(panel.getBoundingClientRect().width);

      // Keyboard resizing moves the panel in fixed steps and keeps its content inside the shell.
      const separator = host.querySelector<HTMLElement>('[role="separator"][aria-label="Resize left panel"]')!;
      expect(separator.getAttribute("aria-orientation")).toBe("vertical");
      const before = width();
      separator.focus();
      await userEvent.keyboard("{ArrowRight}");
      await waitFor(() => width() > before);
      expect(width()).toBe(before + 16);
      await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
      await waitFor(() => width() === before - 16);

      // The other panel resizes the other way, and neither panel may leave the frame.
      const rightSeparator = host.querySelector<HTMLElement>('[role="separator"][aria-label="Resize right panel"]')!;
      const inspectorPanel = inspector(host);
      const inspectorWidth = () => Math.round(inspectorPanel.getBoundingClientRect().width);
      const inspectorBefore = inspectorWidth();
      rightSeparator.focus();
      await userEvent.keyboard("{ArrowLeft}");
      await waitFor(() => inspectorWidth() > inspectorBefore);
      for (const element of [panel, inspectorPanel]) {
        expect(insideFrame(element, host.getBoundingClientRect().width, host.getBoundingClientRect().height)).toBe(true);
        expect(horizontalOverflow(element)).toBeLessThanOrEqual(0);
      }

      // A drag on the handle keeps the panel inside the frame while the pointer moves.
      const separatorRect = separator.getBoundingClientRect();
      const beforeDrag = width();
      const hostRect = host.getBoundingClientRect();
      await userEvent.dragAndDrop(separator, host, {
        sourcePosition: { x: 1, y: 120 },
        targetPosition: { x: separatorRect.left + separator.clientLeft - hostRect.left - host.clientLeft + 41, y: separatorRect.top - hostRect.top + 120 }
      });
      await expect.poll(width).toBe(beforeDrag + 40);
      expect(width()).toBe(beforeDrag + 40);
      expect(insideFrame(panel, hostRect.width, hostRect.height)).toBe(true);
      expect(horizontalOverflow(panel)).toBeLessThanOrEqual(0);
      expect(insideFrame(separator, host.getBoundingClientRect().width, host.getBoundingClientRect().height)).toBe(true);
    } finally {
      await page.viewport(originalSize.width, originalSize.height);
      await waitForFrame();
    }
  }, 30000);

  it("switches language without rebuilding the editor, and restores focus to the switcher", async () => {
    const { host, editor } = mount({ width: 1440, height: 900 });
    await waitFor(() => Boolean(navigation(host)));
    await waitFor(() => editor.getRuntime() !== null && Boolean(host.querySelector("canvas")));
    const idleRuntime = editor.getRuntime();
    expect(idleRuntime).toBeTruthy();
    const canvas = host.querySelector("canvas");

    // The switcher's label follows the language it is about to show.
    const switcher = host.querySelector<HTMLSelectElement>('select[aria-label="Language"]')!;
    expect(switcher).toBeTruthy();
    switcher.focus();
    await userEvent.selectOptions(switcher, "zh-CN");
    await waitFor(() => Boolean(button(host, "收起左面板")));
    expect(navButton(host, "场景").getAttribute("aria-label")).toBe("场景 2");
    expect(workspace(host).getAttribute("aria-label")).toBe("项目面板");
    expect([...host.querySelectorAll("h2")].map((element) => element.textContent)).toContain("层级");
    expect(host.querySelector("canvas")).toBe(canvas);
    expect(editor.getRuntime()).toBe(idleRuntime);
    expect(editor.getSnapshot().selection.objectId).toBe("long-node");
    // Switching labels must not move focus away from the control the user is operating.
    expect(document.activeElement).toBe(switcher);

    await userEvent.selectOptions(host.querySelector<HTMLSelectElement>('select[aria-label="语言"]')!, "en");
    await waitFor(() => Boolean(button(host, "Collapse left panel")));
    expect(navButton(host, "Scene").getAttribute("aria-label")).toBe("Scene 2");
    expect(host.querySelector("canvas")).toBe(canvas);
    expect(editor.getRuntime()).toBe(idleRuntime);
  }, 30000);

  it("isolates compiled styles from host styles and leaves host regions unstyled", async () => {
    const hostStyle = document.createElement("style");
    hostStyle.textContent = `
      .starter-host { color: rgb(0, 128, 96); font: 12px/1.2 serif; }
      .starter-host button { border: 3px dashed rgb(0, 128, 96); }
    `;
    document.head.append(hostStyle);
    const outsideButton = document.createElement("button");
    outsideButton.textContent = "Host outside editor";
    outsideButton.style.position = "absolute";
    document.body.append(outsideButton);
    const packageStyle = document.getElementById(STYLE_ID) as HTMLStyleElement;
    packageStyle.disabled = true;
    const outsideAppearance = () => {
      const style = getComputedStyle(outsideButton);
      return [style.color, style.backgroundColor, style.fontFamily, style.padding, style.border, style.boxSizing];
    };
    const baseline = outsideAppearance();
    packageStyle.disabled = false;
    try {
      const { host } = mount({ width: 1440, height: 900, toolbar: true, hostRegions: true });
      await waitFor(() => Boolean(navigation(host)));
      expect(outsideAppearance()).toEqual(baseline);
      expect(getComputedStyle(navigation(host)).backgroundColor).toBe("rgb(255, 255, 255)");
      const headerFont = getComputedStyle(host.querySelector("h2")!).fontFamily;
      expect(headerFont).toContain("system-ui");
      expect(headerFont).not.toMatch(/(^|,\s*)serif\s*$/);
      const sceneButton = navButton(host, "Scene");
      expect(getComputedStyle(sceneButton).color).not.toBe("rgb(0, 128, 96)");
      // Host regions keep the host's own styling; the package only styles its shell hooks.
      const hostAction = host.querySelector<HTMLElement>(".host-toolbar-action")!;
      expect(hostAction).toBeTruthy();
      expect(getComputedStyle(hostAction).borderTopStyle).toBe("dashed");
      // Every host render region keeps the host's styling and stays inside the shell.
      for (const region of [".host-overlay", ".host-status"]) {
        const element = host.querySelector<HTMLElement>(region)!;
        expect(element.textContent?.startsWith("Host")).toBe(true);
        expect(getComputedStyle(element).fontFamily).toContain("serif");
        expect(clippedBy(element)).toBeNull();
      }
      workbench(host).style.setProperty("--ek-workbench-text", "rgb(73, 61, 52)");
      await userEvent.click(control("Actions for Floor plate")!);
      await waitFor(() => Boolean(document.querySelector('[role="menu"]')));
      const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
      expect(getComputedStyle(menu).color).toBe("rgb(73, 61, 52)");
      expect(outsideAppearance()).toEqual(baseline);
      await userEvent.keyboard("{Escape}");
    } finally {
      hostStyle.remove();
    }
  }, 30000);
});
