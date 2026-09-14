import { useRef } from "react";

export function WorkbenchPanelResize({ side, label, panelId, width, minimum, maximum, onResize }: {
  side: "left" | "right";
  label: string;
  panelId: string;
  width: number;
  minimum: number;
  maximum: number;
  onResize(width: number): void;
}) {
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const direction = side === "left" ? 1 : -1;
  const resize = (value: number) => onResize(Math.round(Math.max(minimum, Math.min(maximum, value))));
  return (
    <div
      className={`ek-workbench__resize ek-workbench__resize--${side}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-controls={panelId}
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={width}
      aria-valuetext={`${width}px`}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        resize(event.key === "Home" ? minimum : event.key === "End" ? maximum :
          width + (event.key === "ArrowRight" ? 16 : -16) * direction);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current) {
          return;
        }
        event.preventDefault();
        event.currentTarget.focus();
        drag.current = { pointerId: event.pointerId, x: event.clientX, width };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointerId === event.pointerId) {
          resize(drag.current.width + (event.clientX - drag.current.x) * direction);
        }
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId === event.pointerId) {
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }
      }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
    />
  );
}
