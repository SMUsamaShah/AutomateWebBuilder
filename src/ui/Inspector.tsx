/**
 * Property editor for the selected block.
 *
 * Expression-valued fields are shown as their Automate source text and compiled
 * back by the expression parser when committed, so structured values survive a
 * round trip through the editor. Fields left untouched keep their original nodes
 * byte-for-byte.
 */

import { editableFields, fieldLabel } from '../flo/blocks';
import { isPrimitiveBox, primitiveText, withPrimitiveText } from '../flo/expr';
import { ExpressionField } from './ExpressionField';
import type { Block } from '../flo/model';
import type { LintFinding } from '../flo/lint';

interface Props {
  block: Block | null;
  /** Findings for this block, shown against the field each concerns. */
  findings?: LintFinding[];
  onChange: (block: Block, field: string, value: unknown) => void;
  onDelete: (block: Block) => void;
}

/**
 * A warning under the field it is about.
 *
 * The message carries its own evidence — "300 of 300 real blocks of this type
 * set it" — because the alternative is asking to be believed about a field
 * whose absence is legal, and which the app will happily save either way.
 */
function Finding({ finding }: { finding: LintFinding }) {
  return (
    <div className={`finding ${finding.severity}`}>
      {finding.severity === 'error' ? '⚠' : 'ⓘ'} {finding.message}
    </div>
  );
}

const DOC_BASE = 'https://llamalab.com/automate/doc/block/';

export function Inspector({ block, findings = [], onChange, onDelete }: Props) {
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
  const byField = new Map(findings.map((f) => [f.field, f]));
  const note = (name: string) => {
    const f = byField.get(name);
    return f ? <Finding finding={f} /> : null;
  };

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
        {findings
          .filter((f) => !fields.some((x) => x.name === f.field))
          .map((f) => (
            <Finding key={f.field} finding={f} />
          ))}

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
                  {note(f.name)}
                </div>
              );
            }
            return (
              <div key={f.name}>
                <ExpressionField
                  key={`${block.id}:${f.name}`}
                  label={fieldLabel(f.name)}
                  value={value}
                  onCommit={(next) => onChange(block, f.name, next)}
                />
                {note(f.name)}
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
                {note(f.name)}
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
                {note(f.name)}
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
                {note(f.name)}
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
