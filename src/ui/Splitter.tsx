/** Draggable divider that resizes an adjacent panel. */

import { useRef } from 'react';

interface Props {
  /** Current width of the panel being resized, in pixels. */
  width: number;
  /** Which side the panel is on; a right-hand panel grows when dragged left. */
  side: 'left' | 'right';
  onResize: (width: number) => void;
  /** Width restored by a double-click. */
  defaultWidth: number;
  label: string;
}

export function Splitter({ width, side, onResize, defaultWidth, label }: Props) {
  const start = useRef<{ x: number; w: number } | null>(null);

  const apply = (clientX: number) => {
    const s = start.current;
    if (!s) return;
    const delta = clientX - s.x;
    onResize(s.w + (side === 'left' ? delta : -delta));
  };

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, w: width };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        document.body.classList.add('resizing');
      }}
      onPointerMove={(e) => {
        if (start.current) apply(e.clientX);
      }}
      onPointerUp={(e) => {
        start.current = null;
        document.body.classList.remove('resizing');
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* never captured */
        }
      }}
      onDoubleClick={() => onResize(defaultWidth)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        const towardsWider = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
        const towardsNarrower = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
        if (e.key === towardsWider) {
          e.preventDefault();
          onResize(width + step);
        } else if (e.key === towardsNarrower) {
          e.preventDefault();
          onResize(width - step);
        }
      }}
      title={`Drag to resize ${label} · double-click to reset`}
    />
  );
}
