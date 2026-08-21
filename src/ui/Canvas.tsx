/**
 * The flowchart surface: pan, zoom, block dragging and connection drawing.
 *
 * Connections are drawn the way the app draws them — leaving the source port
 * downward or sideways, entering the target's IN port from above — using
 * orthogonal-ish bezier curves tinted with the source port's colour.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BLOCK_H, BLOCK_W, CELL, BlockView } from './BlockView';
import { hasInputPort, outputPorts } from '../flo/blocks';
import type { PortSide } from '../flo/blocks';
import type { Block, BlockId, FlowModel } from '../flo/model';

interface Props {
  model: FlowModel;
  /**
   * The owner's edit counter, bumped on every change to `model`.
   *
   * The model is mutated in place — `createBlock` pushes into the existing
   * `blocks` array, moving a block writes `x`/`y` on the block itself — so no
   * array or object identity here changes when the flow does. Anything derived
   * from the model has to key off this instead, or it silently serves the
   * flow as it was when the file was opened.
   */
  rev: number;
  selected: BlockId | null;
  /** Block id -> worst finding severity, for the corner marker. */
  issues?: Map<BlockId, 'error' | 'warning'>;
  onSelect: (id: BlockId | null) => void;
  onMoveBlock: (id: BlockId, x: number, y: number) => void;
  onConnect: (from: BlockId, port: string, to: BlockId) => void;
  onDisconnect: (from: BlockId, port: string) => void;
  onDropBlock: (typeId: number, x: number, y: number) => void;
}

interface View {
  x: number;
  y: number;
  scale: number;
}

/** Where a port sits in world coordinates. */
function portPoint(block: Block, side: 'top' | 'bottom' | 'right') {
  const x = block.x * CELL;
  const y = block.y * CELL;
  if (side === 'top') return { x: x + BLOCK_W / 2, y };
  if (side === 'bottom') return { x: x + BLOCK_W / 2, y: y + BLOCK_H };
  return { x: x + BLOCK_W, y: y + BLOCK_H / 2 };
}

interface Point {
  x: number;
  y: number;
}

/** Straight run leaving a source port and entering a target's IN port. */
const STUB = 16;
/** How far a connection detours sideways when it has to double back. */
const LANE = 56;
/** Corner radius, matching the app's rounded elbows. */
const RADIUS = 10;

/** Drop duplicate and collinear points so corners only appear at real turns. */
function simplify(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
    out.push(p);
  }
  for (let i = 1; i < out.length - 1; ) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    const collinear =
      (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) ||
      (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5);
    if (collinear) out.splice(i, 1);
    else i++;
  }
  return out;
}

/**
 * Waypoints for a connection, using only horizontal and vertical runs — the
 * app routes this way, so long links read as pipework rather than as diagonals
 * cutting across the chart.
 *
 * Every connection leaves its port along that port's axis and enters the
 * target's IN connector from directly above.
 */
function route(from: Point, side: 'top' | 'bottom' | 'right', to: Point): Point[] {
  const entry: Point = { x: to.x, y: to.y - STUB };
  const pts: Point[] = [from];

  if (side === 'right') {
    const exit: Point = { x: from.x + STUB, y: from.y };
    // Reach the target's column, detouring past it when doubling back upwards.
    const lane = entry.y > exit.y ? Math.max(exit.x, entry.x) : Math.max(exit.x, entry.x + LANE);
    pts.push(exit, { x: lane, y: exit.y }, { x: lane, y: entry.y });
  } else {
    const exit: Point = { x: from.x, y: from.y + STUB };
    pts.push(exit);
    if (entry.y > exit.y) {
      // Target is below: step across at the midpoint between the two blocks.
      const midY = (exit.y + entry.y) / 2;
      pts.push({ x: exit.x, y: midY }, { x: entry.x, y: midY });
    } else {
      // Target is level or above: swing out to a side lane and come back up.
      const lane = from.x + (to.x >= from.x ? LANE : -LANE);
      pts.push({ x: lane, y: exit.y }, { x: lane, y: entry.y });
    }
  }

  pts.push(entry, to);
  return simplify(pts);
}

/** Render waypoints as a path with rounded corners. */
function roundedPath(pts: Point[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(RADIUS, inLen / 2, outLen / 2);
    if (r < 1) {
      d += ` L ${cur.x} ${cur.y}`;
      continue;
    }
    const before = {
      x: cur.x - ((cur.x - prev.x) / inLen) * r,
      y: cur.y - ((cur.y - prev.y) / inLen) * r,
    };
    const after = {
      x: cur.x + ((next.x - cur.x) / outLen) * r,
      y: cur.y + ((next.y - cur.y) / outLen) * r,
    };
    d += ` L ${before.x} ${before.y} Q ${cur.x} ${cur.y} ${after.x} ${after.y}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L ${last.x} ${last.y}`;
}

function edgePath(from: Point, side: 'top' | 'bottom' | 'right', to: Point): string {
  return roundedPath(route(from, side, to));
}

export function Canvas({
  model,
  rev,
  selected,
  issues,
  onSelect,
  onMoveBlock,
  onConnect,
  onDisconnect,
  onDropBlock,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 40, y: 40, scale: 1 });
  const [panning, setPanning] = useState(false);
  const [armed, setArmed] = useState<{ id: BlockId; port: string } | null>(null);

  const [linkTo, setLinkTo] = useState<Point | null>(null);

  const pan = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);
  const drag = useRef<{ id: BlockId; px: number; py: number; ox: number; oy: number } | null>(null);
  /**
   * A press on an output port, before we know whether it is a click or a drag.
   * `moved` decides: a drag connects to whatever it lands on, a click arms the
   * port and waits for a second click on the target.
   */
  const link = useRef<{
    id: BlockId;
    port: string;
    side: PortSide;
    px: number;
    py: number;
    moved: boolean;
  } | null>(null);

  const byId = useMemo(() => {
    const m = new Map<BlockId, Block>();
    for (const b of model.blocks) m.set(b.id, b);
    return m;
  }, [model, rev]);

  /** Fit all blocks in view. */
  const fit = useCallback(() => {
    const host = hostRef.current;
    if (!host || model.blocks.length === 0) return;
    const xs = model.blocks.map((b) => b.x * CELL);
    const ys = model.blocks.map((b) => b.y * CELL);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs) + BLOCK_W;
    const maxY = Math.max(...ys) + BLOCK_H;
    const pad = 60;
    const scale = Math.min(
      1.4,
      Math.max(
        0.12,
        Math.min(
          (host.clientWidth - pad * 2) / Math.max(1, maxX - minX),
          (host.clientHeight - pad * 2) / Math.max(1, maxY - minY),
        ),
      ),
    );
    setView({ x: pad - minX * scale, y: pad - minY * scale, scale });
  }, [model, rev]);

  // Fit once when a flow is mounted. Editing must not disturb the user's view,
  // so this deliberately does not re-run as blocks move or get added.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || model.blocks.length === 0) return;
    fitted.current = true;
    fit();
  }, [fit, model.blocks.length]);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = hostRef.current!.getBoundingClientRect();
      return {
        x: (clientX - rect.left - view.x) / view.scale,
        y: (clientY - rect.top - view.y) / view.scale,
      };
    },
    [view],
  );

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('world')) {
      return;
    }
    onSelect(null);
    setArmed(null);
    setPanning(true);
    pan.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  /** Past this many screen pixels, a press on a port is a drag, not a click. */
  const SLOP = 4;
  /** How far outside a block a drop still counts, measured on screen. */
  const SNAP_PX = 28;
  /** Radius of a connector dot in world units; matches `--port` in the stylesheet. */
  const PORT_R = 11;

  const onPointerMove = (e: React.PointerEvent) => {
    if (link.current) {
      const l = link.current;
      if (Math.hypot(e.clientX - l.px, e.clientY - l.py) > SLOP) l.moved = true;
      if (l.moved) setLinkTo(toWorld(e.clientX, e.clientY));
      return;
    }
    if (drag.current) {
      const d = drag.current;
      const dx = (e.clientX - d.px) / view.scale;
      const dy = (e.clientY - d.py) / view.scale;
      const nx = Math.round((d.ox + dx) / CELL);
      const ny = Math.round((d.oy + dy) / CELL);
      onMoveBlock(d.id, nx, ny);
      return;
    }
    if (pan.current) {
      setView((v) => ({
        ...v,
        x: pan.current!.vx + (e.clientX - pan.current!.px),
        y: pan.current!.vy + (e.clientY - pan.current!.py),
      }));
    }
  };

  /** Arm a port, disarm it, or clear the connection it already has. */
  const togglePort = (id: BlockId, field: string) => {
    if (armed && armed.id === id && armed.port === field) {
      setArmed(null);
      return;
    }
    const existing = model.connections.find((c) => c.from === id && c.port === field);
    if (existing && !armed) {
      onDisconnect(id, field);
      return;
    }
    setArmed({ id, port: field });
  };

  /**
   * The block a drop lands on, from the geometry rather than from the DOM.
   *
   * `document.elementFromPoint` was the obvious way to do this and it is the
   * wrong one: it depends on what the browser decides is on top, and it demands
   * that the pointer be inside the block to the pixel. Zoomed out to fit a big
   * flow, a block is a dozen screen pixels across, so a drop that looks on
   * target misses. Blocks are plain rectangles on a grid, so measure instead.
   */
  const dropTarget = (world: Point, from: BlockId): BlockId | null => {
    const accepts = (b: Block) => b.id !== from && hasInputPort(b.typeId);

    // Distance from the point to a block's rectangle; 0 means inside it.
    const gap = (b: Block) => {
      const x = b.x * CELL;
      const y = b.y * CELL;
      return Math.hypot(
        Math.max(x - world.x, 0, world.x - (x + BLOCK_W)),
        Math.max(y - world.y, 0, world.y - (y + BLOCK_H)),
      );
    };

    // The IN dot hangs half outside its block, above the top edge, so on a
    // tight layout it sits on the block above — very often the one the wire is
    // being dragged from. Aiming at a connector is unambiguous, so it decides
    // the drop before any rectangle gets a say. Without this, letting go on the
    // dot the user was aiming at does nothing at all.
    let onPort: { id: BlockId; d: number } | null = null;
    for (const b of model.blocks) {
      if (!accepts(b)) continue;
      const p = portPoint(b, 'top');
      const d = Math.hypot(p.x - world.x, p.y - world.y);
      if (d <= PORT_R && (!onPort || d < onPort.d)) onPort = { id: b.id, d };
    }
    if (onPort) return onPort.id;

    // Inside a block decides it, even when that block cannot be a target.
    // Snapping past it to a neighbour would connect somewhere unasked for.
    // Blocks may overlap, so answer with the one drawn on top — the last one.
    let inside: Block | null = null;
    for (const b of model.blocks) if (gap(b) === 0) inside = b;
    if (inside) return accepts(inside) ? inside.id : null;

    // Otherwise take the nearest block, within a fixed distance on screen so
    // the reach feels the same at every zoom level.
    const reach = SNAP_PX / view.scale;
    let best: { id: BlockId; d: number } | null = null;
    for (const b of model.blocks) {
      if (!accepts(b)) continue;
      const d = gap(b);
      if (d <= reach && (!best || d < best.d)) best = { id: b.id, d };
    }
    return best?.id ?? null;
  };

  const endGesture = (e: React.PointerEvent) => {
    if (link.current) {
      const l = link.current;
      link.current = null;
      setLinkTo(null);
      if (l.moved) {
        const to = dropTarget(toWorld(e.clientX, e.clientY), l.id);
        if (to) {
          onConnect(l.id, l.port, to);
          setArmed(null);
        } else {
          // A miss leaves the port armed rather than throwing the gesture
          // away. The ring stays on, and a click on the target finishes it.
          setArmed({ id: l.id, port: l.port });
        }
      } else {
        togglePort(l.id, l.port);
      }
    }
    drag.current = null;
    pan.current = null;
    setPanning(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer was never captured */
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = hostRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setView((v) => {
      const next = Math.min(2.5, Math.max(0.08, v.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const k = next / v.scale;
      return { x: mx - (mx - v.x) * k, y: my - (my - v.y) * k, scale: next };
    });
  };

  const onBlockPointerDown = (e: React.PointerEvent, block: Block) => {
    e.stopPropagation();

    // A port is waiting for a target, and this block can be one. Take the
    // press as the answer rather than starting a drag.
    if (armed && armed.id !== block.id && hasInputPort(block.typeId)) {
      onConnect(armed.id, armed.port, block.id);
      setArmed(null);
      onSelect(block.id);
      return;
    }

    onSelect(block.id);
    drag.current = {
      id: block.id,
      px: e.clientX,
      py: e.clientY,
      ox: block.x * CELL,
      oy: block.y * CELL,
    };
    (e.currentTarget.closest('.canvas') as HTMLElement)?.setPointerCapture(e.pointerId);
  };

  const onPortPointerDown = (
    e: React.PointerEvent,
    block: Block,
    field: string,
    side: PortSide,
  ) => {
    // Without this the block's own handler runs, starts a drag and captures
    // the pointer — which retargets the click away from the port entirely.
    e.stopPropagation();
    onSelect(block.id);
    link.current = { id: block.id, port: field, side, px: e.clientX, py: e.clientY, moved: false };
    (e.currentTarget.closest('.canvas') as HTMLElement)?.setPointerCapture(e.pointerId);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-automate-block');
    if (!raw) return;
    const { x, y } = toWorld(e.clientX, e.clientY);
    onDropBlock(Number(raw), Math.round(x / CELL), Math.round(y / CELL));
  };

  const edges = useMemo(() => {
    const out: Array<{ key: string; d: string; color: string }> = [];
    for (const c of model.connections) {
      const from = byId.get(c.from);
      const to = byId.get(c.to);
      if (!from || !to) continue;
      const spec = outputPorts(from.typeId).find((p) => p.field === c.port);
      if (!spec) continue;
      const a = portPoint(from, spec.side);
      const b = portPoint(to, 'top');
      out.push({
        key: `${c.from}:${c.port}`,
        d: edgePath(a, spec.side, b),
        // The app draws connections in a lightened tint of the port colour.
        color: spec.color + '99',
      });
    }
    return out;
  }, [model, rev, byId]);

  /** The line that follows the pointer while a connection is being dragged. */
  const liveEdge = useMemo(() => {
    const l = link.current;
    if (!l || !linkTo) return null;
    const from = byId.get(l.id);
    if (!from) return null;
    const spec = outputPorts(from.typeId).find((p) => p.field === l.port);
    if (!spec) return null;
    return { d: edgePath(portPoint(from, spec.side), spec.side, linkTo), color: spec.color };
  }, [linkTo, byId]);

  return (
    <div
      ref={hostRef}
      className={`canvas${panning ? ' panning' : ''}${linkTo ? ' linking' : ''}`}
      style={{ backgroundSize: `${CELL * view.scale}px ${CELL * view.scale}px`,
               backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onWheel={onWheel}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div
        className="world"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        <svg className="edges" width="1" height="1">
          {edges.map((e) => (
            <path key={e.key} d={e.d} fill="none" stroke={e.color} strokeWidth={3} />
          ))}
          {liveEdge && (
            <path
              d={liveEdge.d}
              fill="none"
              stroke={liveEdge.color}
              strokeWidth={3}
              strokeDasharray="6 4"
            />
          )}
        </svg>

        {model.blocks.map((b) => (
          <BlockView
            key={b.id}
            block={b}
            selected={selected === b.id}
            issue={issues?.get(b.id) ?? null}
            armedPort={armed?.id === b.id ? armed.port : null}
            onPointerDown={onBlockPointerDown}
            onPortPointerDown={onPortPointerDown}
          />
        ))}
      </div>

      <div className="zoom">
        <button onClick={() => setView((v) => ({ ...v, scale: Math.max(0.08, v.scale / 1.2) }))} title="Zoom out">
          −
        </button>
        <span className="level">{Math.round(view.scale * 100)}%</span>
        <button onClick={() => setView((v) => ({ ...v, scale: Math.min(2.5, v.scale * 1.2) }))} title="Zoom in">
          +
        </button>
        <button onClick={fit} title="Fit to window">
          ⤢
        </button>
      </div>
    </div>
  );
}
