/**
 * Editor for one expression-valued argument.
 *
 * Two rules make editing safe:
 *
 *  1. While you type, the text is local state. The value in the flow is not
 *     touched, so re-rendering can never rewrite what you are typing.
 *  2. On commit (blur, or Ctrl/Cmd+Enter) the text is compiled by the real
 *     expression parser. If it does not parse, the flow keeps its previous
 *     value and the error is shown instead.
 *
 * The editor used to wrap whatever you typed in a string literal, which
 * destroyed structured values and re-escaped the text on every keystroke.
 */

import { useEffect, useRef, useState } from 'react';
import { isExpression, renderExpression } from '../flo/expr';
import { ExpressionError, parseExpression } from '../flo/exprparse';
import type { FloValue } from '../flo/types';

interface Props {
  label: string;
  value: unknown;
  onCommit: (value: FloValue) => void;
}

export function ExpressionField({ label, value, onCommit }: Props) {
  const canEdit = value === null || value === undefined || isExpression(value);
  const rendered = canEdit ? renderExpression(value as FloValue) : '';

  const [text, setText] = useState(rendered);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Adopt external changes (a different block selected, or an undone edit),
  // but never while the user has uncommitted text in the box.
  useEffect(() => {
    if (!dirty) {
      setText(rendered);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendered]);

  // Grow to fit the value so long expressions are readable without scrolling.
  // Capped so one field cannot fill the panel; the resize handle still works,
  // and a manual height survives until the text changes again.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const cap = Math.max(120, Math.round(window.innerHeight * 0.45));
    el.style.height = `${Math.min(el.scrollHeight + 2, cap)}px`;
  }, [text]);

  // Clicking the canvas changes the selection, and React flushes that on
  // pointerdown — before the browser moves focus. The field is unmounted by the
  // time `blur` fires, so blur alone would silently drop the edit. Commit from
  // an unmount cleanup as well, reading the latest values through a ref.
  const pending = useRef({ text, dirty, rendered, onCommit });
  pending.current = { text, dirty, rendered, onCommit };

  useEffect(
    () => () => {
      const p = pending.current;
      if (!p.dirty) return;
      try {
        const parsed = parseExpression(p.text);
        if (renderExpression(parsed) !== p.rendered) p.onCommit(parsed);
      } catch {
        // Invalid and no longer on screen: leave the stored value untouched.
      }
    },
    [],
  );

  // Both paths read `pending`, never the render closure: Esc and blur can happen
  // in the same tick, before React has applied the state, and a stale closure
  // would then re-commit text the user just discarded.
  const commit = () => {
    const p = pending.current;
    if (!p.dirty) return;
    try {
      const parsed = parseExpression(p.text);
      pending.current = { ...p, dirty: false };
      setError(null);
      setDirty(false);
      // Reformatting only (whitespace, layout) must not touch the flow at all:
      // keeping the original node preserves anything the parser cannot express,
      // and keeps the saved file byte-identical.
      if (renderExpression(parsed) !== p.rendered) p.onCommit(parsed);
    } catch (err) {
      // Keep the text so the mistake can be corrected; the flow is unchanged.
      setError(
        err instanceof ExpressionError
          ? `${err.message} (at character ${err.at + 1})`
          : (err as Error).message,
      );
    }
  };

  const revert = () => {
    pending.current = { ...pending.current, text: rendered, dirty: false };
    setText(rendered);
    setError(null);
    setDirty(false);
  };

  if (!canEdit) {
    return (
      <div className="field">
        <label>{label}</label>
        <textarea value="" disabled placeholder="(complex value — edit in the app)" />
        <div className="note">Preserved unchanged on save.</div>
      </div>
    );
  }

  return (
    <div className="field">
      <label>{label}</label>
      <textarea
        ref={areaRef}
        className={error ? 'invalid' : undefined}
        value={text}
        spellCheck={false}
        placeholder="expression"
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            revert();
            areaRef.current?.blur();
          }
        }}
      />
      {error ? (
        <div className="note error">{error}</div>
      ) : dirty ? (
        <div className="note">Unsaved — click away or press Ctrl+Enter to apply, Esc to revert.</div>
      ) : (
        <div className="note">
          Automate expression. Line breaks and spacing between tokens are ignored, so
          long values can be laid out to read.
        </div>
      )}
    </div>
  );
}
