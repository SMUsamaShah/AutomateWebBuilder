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

  const commit = () => {
    if (!dirty) return;
    try {
      const parsed = parseExpression(text);
      setError(null);
      setDirty(false);
      // Reformatting only (whitespace, layout) must not touch the flow at all:
      // keeping the original node preserves anything the parser cannot express,
      // and keeps the saved file byte-identical.
      if (renderExpression(parsed) !== rendered) onCommit(parsed);
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
