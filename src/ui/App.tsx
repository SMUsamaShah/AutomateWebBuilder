/** Top-level editor: open/save `.flo`, edit the flow, export JSON for AI tools. */

import { useCallback, useRef, useState } from 'react';
import { Canvas } from './Canvas';
import { Inspector } from './Inspector';
import { Palette } from './Palette';
import {
  connect,
  createBlock,
  deleteBlock,
  disconnect,
  emptyModel,
  fromModel,
  toModel,
} from '../flo/model';
import { toJsonFlow, fromJsonFlow } from '../flo/json';
import type { Block, BlockId, FlowModel } from '../flo/model';

/** React state holds a version counter because the model is mutated in place. */
interface Doc {
  model: FlowModel;
  name: string;
  /** Bumped on every in-place mutation to trigger a re-render. */
  rev: number;
  /** Identity of the loaded document; changes only when a new flow is opened. */
  docId: number;
}

function download(name: string, data: Uint8Array | string, type: string) {
  const part: BlobPart = typeof data === 'string' ? data : new Uint8Array(data).buffer;
  const url = URL.createObjectURL(new Blob([part], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function App() {
  const [doc, setDoc] = useState<Doc>(() => ({ model: emptyModel(), name: 'New flow', rev: 0, docId: 1 }));
  const [selected, setSelected] = useState<BlockId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);

  const say = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200);
  }, []);

  /** Re-render after an in-place mutation of the model. */
  const touch = useCallback(() => setDoc((d) => ({ ...d, rev: d.rev + 1 })), []);

  const openFlo = async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const model = toModel(bytes);
      setDoc((d) => ({ model, name: file.name.replace(/\.flo$/i, ''), rev: 0, docId: d.docId + 1 }));
      setSelected(null);
      say(`Loaded ${model.blocks.length} blocks (format v${model.version}).`);
    } catch (err) {
      say(`Could not read that file: ${(err as Error).message}`);
    }
  };

  const openJson = async (file: File) => {
    try {
      const model = fromJsonFlow(JSON.parse(await file.text()));
      setDoc((d) => ({ model, name: file.name.replace(/\.json$/i, ''), rev: 0, docId: d.docId + 1 }));
      setSelected(null);
      say(`Loaded ${model.blocks.length} blocks from JSON.`);
    } catch (err) {
      say(`Could not read that JSON: ${(err as Error).message}`);
    }
  };

  const saveFlo = () => {
    try {
      download(`${doc.name || 'flow'}.flo`, fromModel(doc.model), 'application/octet-stream');
      say('Saved. Copy it to your device and open it with Automate to import.');
    } catch (err) {
      say(`Save failed: ${(err as Error).message}`);
    }
  };

  const saveJson = () => {
    download(
      `${doc.name || 'flow'}.json`,
      JSON.stringify(toJsonFlow(doc.model), null, 2),
      'application/json',
    );
    say('Exported JSON — hand this to an AI agent to read or rewrite the flow.');
  };

  const addBlock = (typeId: number, x?: number, y?: number) => {
    const model = doc.model;
    const nx = x ?? 4;
    const ny = y ?? Math.max(0, ...model.blocks.map((b) => b.y + 3));
    const block = createBlock(model, typeId, nx, ny);
    setSelected(block.id);
    touch();
  };

  const selectedBlock: Block | null =
    doc.model.blocks.find((b) => b.id === selected) ?? null;

  return (
    <div className="app">
      <div className="toolbar">
        <span className="title">Automate Web Builder</span>
        <span className="flow-name">{doc.name}</span>

        <button className="btn" onClick={() => fileRef.current?.click()}>
          Open .flo
        </button>
        <button className="btn primary" onClick={saveFlo}>
          Save .flo
        </button>
        <button
          className="btn"
          onClick={() => {
            setDoc((d) => ({ model: emptyModel(), name: 'New flow', rev: 0, docId: d.docId + 1 }));
            setSelected(null);
          }}
        >
          New
        </button>

        <span className="spacer" />

        <button className="btn" onClick={saveJson} title="Readable JSON for AI agents">
          Export JSON
        </button>
        <button className="btn" onClick={() => jsonRef.current?.click()}>
          Import JSON
        </button>

        <span className="hint">{doc.model.blocks.length} blocks</span>

        <input
          ref={fileRef}
          type="file"
          accept=".flo"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void openFlo(f);
            e.target.value = '';
          }}
        />
        <input
          ref={jsonRef}
          type="file"
          accept=".json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void openJson(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="body">
        <Palette onAdd={(typeId) => addBlock(typeId)} />

        <Canvas
          key={doc.docId}
          model={doc.model}
          selected={selected}
          onSelect={setSelected}
          onMoveBlock={(id, x, y) => {
            const b = doc.model.blocks.find((k) => k.id === id);
            if (b && (b.x !== x || b.y !== y)) {
              b.x = x;
              b.y = y;
              touch();
            }
          }}
          onConnect={(from, port, to) => {
            connect(doc.model, from, port, to);
            touch();
          }}
          onDisconnect={(from, port) => {
            disconnect(doc.model, from, port);
            touch();
          }}
          onDropBlock={(typeId, x, y) => addBlock(typeId, x, y)}
        />

        <Inspector
          block={selectedBlock}
          onChange={(block, field, value) => {
            block.raw[field] = value;
            touch();
          }}
          onDelete={(block) => {
            deleteBlock(doc.model, block.id);
            setSelected(null);
            touch();
          }}
        />
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
