/** A single flowchart block, drawn to match the Automate app's BlockView. */

import { memo } from 'react';
import { describeBlock, hasInputPort, outputPorts, COLORS } from '../flo/blocks';
import { initials, useIconFont } from './iconFont';
import type { Block } from '../flo/model';

export const CELL = 24;
export const BLOCK_W = 96;
export const BLOCK_H = 72;

interface Props {
  block: Block;
  selected: boolean;
  /**
   * Worst lint severity on this block, or null.
   *
   * Marked on the block itself because the fields these findings are about are
   * empty, and an empty field looks exactly like one you meant to leave empty —
   * there is nothing on the flowchart to notice unless something is drawn.
   */
  issue?: 'error' | 'warning' | null;
  /** Port currently armed for connecting, if it belongs to this block. */
  armedPort: string | null;
  onPointerDown: (e: React.PointerEvent, block: Block) => void;
  onPortClick: (e: React.MouseEvent, block: Block, field: string) => void;
  onInputClick: (e: React.MouseEvent, block: Block) => void;
}

function BlockViewImpl({
  block,
  selected,
  issue = null,
  armedPort,
  onPointerDown,
  onPortClick,
  onInputClick,
}: Props) {
  const entry = block.entry;
  const caption = describeBlock(block.raw, entry);
  const hasFont = useIconFont();
  const glyph = hasFont && entry?.icon ? String.fromCharCode(entry.icon) : null;

  return (
    <div
      className={`block${selected ? ' selected' : ''}`}
      style={{ left: block.x * CELL, top: block.y * CELL }}
      onPointerDown={(e) => onPointerDown(e, block)}
      title={`#${block.id} ${entry?.title ?? ''}\n${entry?.summary ?? ''}`}
    >
      <span className="badge">{block.id}</span>
      {issue && <span className={`issue-dot ${issue}`} title="Has a lint finding" />}

      {glyph ? (
        <span className="icon">{glyph}</span>
      ) : (
        <span className="icon fallback">{initials(entry?.name ?? '?')}</span>
      )}

      <span className="caption">{caption}</span>

      {hasInputPort(block.typeId) && (
        <span
          className="port top"
          style={{ background: COLORS.blue }}
          onClick={(e) => onInputClick(e, block)}
          title="IN"
        >
          IN
        </span>
      )}

      {outputPorts(block.typeId).map((p) => (
        <span
          key={p.field}
          className={`port ${p.side}${armedPort === p.field ? ' armed' : ''}`}
          style={{ background: p.color }}
          onClick={(e) => onPortClick(e, block, p.field)}
          title={`${p.label} — click, then click a target block's IN`}
        >
          {p.label}
        </span>
      ))}
    </div>
  );
}

export const BlockView = memo(BlockViewImpl);
