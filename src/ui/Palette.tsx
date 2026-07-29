/** Searchable list of every block type the app supports, grouped by category. */

import { useMemo, useState } from 'react';
import { catalog } from '../flo/model';
import { blockCategory, categories } from '../flo/blocks';
import { initials, useIconFont } from './iconFont';
import type { CatalogEntry } from '../flo/types';

interface Props {
  onAdd: (typeId: number) => void;
}

export function Palette({ onAdd }: Props) {
  const [query, setQuery] = useState('');
  const hasFont = useIconFont();

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groups = new Map<string, CatalogEntry[]>();
    for (const entry of Object.values(catalog) as CatalogEntry[]) {
      const haystack = `${entry.title ?? ''} ${entry.name} ${entry.summary ?? ''}`.toLowerCase();
      if (q && !haystack.includes(q)) continue;
      const cat = blockCategory(entry);
      const list = groups.get(cat) ?? [];
      list.push(entry);
      groups.set(cat, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (a.title ?? a.name).localeCompare(b.title ?? b.name));
    }
    return groups;
  }, [query]);

  const order = categories().filter((c) => grouped.has(c));
  const total = [...grouped.values()].reduce((n, l) => n + l.length, 0);

  return (
    <div className="panel">
      <h2>Blocks ({total})</h2>
      <input
        className="search"
        placeholder="Search blocks…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="scroll">
        {order.map((cat) => (
          <div key={cat}>
            <div className="cat">{cat}</div>
            {grouped.get(cat)!.map((entry) => (
              <button
                key={entry.id}
                className="palette-item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-automate-block', String(entry.id));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onAdd(entry.id)}
                title={entry.summary ?? ''}
              >
                <span
                  className={hasFont ? 'icon' : 'icon fallback'}
                  style={{
                    fontFamily: hasFont ? 'AutomateIcons' : 'inherit',
                    fontSize: hasFont ? 16 : 10,
                    fontWeight: hasFont ? 400 : 700,
                    width: 22,
                    flex: '0 0 22px',
                    textAlign: 'center',
                    color: 'var(--muted)',
                  }}
                >
                  {hasFont && entry.icon ? String.fromCharCode(entry.icon) : initials(entry.name)}
                </span>
                <span className="label">{entry.title ?? entry.name}</span>
              </button>
            ))}
          </div>
        ))}
        {total === 0 && <div className="empty">No blocks match “{query}”.</div>}
      </div>
    </div>
  );
}
