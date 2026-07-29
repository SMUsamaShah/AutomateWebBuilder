/**
 * Panel widths, clamped to the window and remembered between sessions.
 *
 * The width you chose is stored as an intent and clamped only for display, so
 * shrinking the window and growing it again restores what you set rather than
 * leaving the panel permanently narrow. The canvas always keeps a usable
 * minimum, so dragging a panel wide cannot squeeze the flowchart away.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

export const PANEL_DEFAULTS = { left: 264, right: 340 };

const LIMITS = {
  left: { min: 180, max: 620 },
  right: { min: 260, max: 900 },
};

/** Canvas width preserved when clamping. */
const MIN_CANVAS = 280;
/** Total width of the two splitter columns. */
const SPLITTERS = 12;

const STORAGE_KEY = 'awb.panelWidths';

type Widths = { left: number; right: number };

function readStored(): Widths {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...PANEL_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Widths>;
    return {
      left: Number(parsed.left) || PANEL_DEFAULTS.left,
      right: Number(parsed.right) || PANEL_DEFAULTS.right,
    };
  } catch {
    // Private mode, or a file:// origin that refuses storage.
    return { ...PANEL_DEFAULTS };
  }
}

function clamp(v: number, { min, max }: { min: number; max: number }): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** Fit both panels alongside a usable canvas, trimming the wider one first. */
function fitToWindow(desired: Widths, viewport: number): Widths {
  const available = viewport - MIN_CANVAS - SPLITTERS;
  let left = clamp(desired.left, LIMITS.left);
  let right = clamp(desired.right, LIMITS.right);
  let over = left + right - available;
  while (over > 0) {
    const trimLeft = left - LIMITS.left.min;
    const trimRight = right - LIMITS.right.min;
    if (trimLeft <= 0 && trimRight <= 0) break;
    if (trimRight >= trimLeft) {
      const t = Math.min(over, trimRight);
      right -= t;
      over -= t;
    } else {
      const t = Math.min(over, trimLeft);
      left -= t;
      over -= t;
    }
  }
  return { left, right };
}

function viewportWidth(): number {
  return typeof window === 'undefined' ? 1280 : window.innerWidth;
}

export function usePanelWidths() {
  /** What the user asked for, independent of the current window size. */
  const [desired, setDesired] = useState<Widths>(readStored);
  const [viewport, setViewport] = useState(viewportWidth);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(desired));
    } catch {
      /* storage unavailable; widths simply do not persist */
    }
  }, [desired]);

  useEffect(() => {
    const onResize = () => setViewport(viewportWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const widths = useMemo(() => fitToWindow(desired, viewport), [desired, viewport]);

  const setLeft = useCallback((v: number) => {
    setDesired((d) => ({ ...d, left: clamp(v, LIMITS.left) }));
  }, []);

  const setRight = useCallback((v: number) => {
    setDesired((d) => ({ ...d, right: clamp(v, LIMITS.right) }));
  }, []);

  return { widths, setLeft, setRight };
}
