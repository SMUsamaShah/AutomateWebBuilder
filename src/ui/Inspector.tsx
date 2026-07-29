/**
 * Property editor for the selected block.
 *
 * Expression-valued fields are shown as their Automate source text. Editing one
 * replaces it with a string literal, which is what the app itself stores for a
 * plain text argument; fields left untouched keep their original nodes intact
 * so nothing is lost on save.
 */

import { editableFields, fieldLabel } from '../flo/blocks';
import {
  isExpression,
  isPrimitiveBox,
  primitiveText,
  renderExpression,
  stringLiteral,
  withPrimitiveText,
} from '../flo/expr';
import type { Block } from '../flo/model';

interface Props {
  block: Block | null;
  onChange: (block: Block, field: string, value: unknown) => void;
  onDelete: (block: Block) => void;
}

const DOC_BASE = 'https://llamalab.com/automate/doc/block/';

export function Inspector({ block, onChange, onDelete }: Props) {
  if (!block) {
    return (
      <div className="panel inspector">
        <h2>Block</h2>
        <div className="empty">
          Select a block to edit it.
          <br />
          <br />
          Drag from the palette to add one.
        </div>
      </div>
    );
  }

  const entry = block.entry;
  const fields = editableFields(block.typeId);

  return (
    <div className="panel inspector">
      <h2>Block</h2>

      <div className="block-head">
        <div className="name">{entry?.title ?? entry?.name ?? `Type ${block.typeId}`}</div>
        {entry?.summary && <div className="summary">{entry.summary}</div>}
        <div className="summary">
          id #{block.id} · cell {block.x},{block.y}
        </div>
        {entry?.doc && (
          <a href={DOC_BASE + entry.doc} target="_blank" rel="noreferrer">
            Documentation ↗
          </a>
        )}
      </div>

      <div className="scroll">
        {fields.length === 0 && <div className="empty">This block has no editable arguments.</div>}

        {fields.map((f) => {
          const value = block.raw[f.name];

          if (f.op === 'obj') {
            // Boxed primitives (flags, counts) edit as plain scalars.
            if (isPrimitiveBox(value)) {
              return (
                <div className="field" key={f.name}>
                  <label>{fieldLabel(f.name)}</label>
                  <input
                    type={value._type === 25 ? 'text' : 'number'}
                    value={primitiveText(value)}
                    onChange={(e) =>
                      onChange(block, f.name, withPrimitiveText(value, e.target.value))
                    }
                  />
                </div>
              );
            }

            const text = isExpression(value) ? renderExpression(value as never) : '';
            const unsupported = value != null && !isExpression(value);
            return (
              <div className="field" key={f.name}>
                <label>{fieldLabel(f.name)}</label>
                <textarea
                  value={text}
                  disabled={unsupported}
                  placeholder={unsupported ? '(complex value — edit in the app)' : 'expression'}
                  onChange={(e) => {
                    const next = e.target.value;
                    onChange(block, f.name, next === '' ? null : stringLiteral(next));
                  }}
                />
                <div className="note">
                  {unsupported
                    ? 'Preserved as-is on save.'
                    : 'Saved as a text value. Existing expressions are kept unless you edit them.'}
                </div>
              </div>
            );
          }

          if (f.op === 'utf' || f.op === 'utf_null') {
            return (
              <div className="field" key={f.name}>
                <label>{fieldLabel(f.name)}</label>
                <input
                  type="text"
                  value={(value as string) ?? ''}
                  onChange={(e) => onChange(block, f.name, e.target.value || null)}
                />
              </div>
            );
          }

          if (f.op === 'u8') {
            return (
              <div className="field" key={f.name}>
                <label>{fieldLabel(f.name)}</label>
                <select
                  value={String(Number(value ?? 0))}
                  onChange={(e) => onChange(block, f.name, Number(e.target.value))}
                >
                  <option value="0">No</option>
                  <option value="1">Yes</option>
                </select>
              </div>
            );
          }

          if (['svar32', 'uvar32', 'i16', 'i32', 'f32', 'f64'].includes(f.op)) {
            return (
              <div className="field" key={f.name}>
                <label>{fieldLabel(f.name)}</label>
                <input
                  type="number"
                  value={Number(value ?? 0)}
                  onChange={(e) => onChange(block, f.name, Number(e.target.value))}
                />
              </div>
            );
          }

          return null;
        })}

        <div className="field">
          <button className="btn" onClick={() => onDelete(block)}>
            Delete block
          </button>
        </div>
      </div>
    </div>
  );
}
