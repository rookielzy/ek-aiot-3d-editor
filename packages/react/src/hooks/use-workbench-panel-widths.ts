import { useLayoutEffect, useState, type RefObject } from "react";

// Reserve a usable viewport and both resize handles before budgeting the panels.
export function useWorkbenchPanelWidths(rootRef: RefObject<HTMLElement | null>) {
  const [availableWidth, setAvailableWidth] = useState(1440);
  const [leftWidth, setLeftWidth] = useState(272);
  const [rightWidth, setRightWidth] = useState(320);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const measure = () => {
      const width = root.getBoundingClientRect().width;
      if (width > 0) {
        setAvailableWidth(Math.floor(width));
      }
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(root);
    return () => observer?.disconnect();
  }, [rootRef]);
  const maximum = Math.max(260, Math.min(480, Math.floor((availableWidth - 64 - 12 - 320) / 2)));
  return {
    desktop: availableWidth >= 1024,
    maximum,
    leftWidth: Math.min(leftWidth, maximum),
    rightWidth: Math.min(rightWidth, maximum),
    setLeftWidth,
    setRightWidth
  };
}
