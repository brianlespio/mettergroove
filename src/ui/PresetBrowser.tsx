import React, { useMemo, useState } from 'react';
import type { PresetManager } from '../presets/PresetManager';
import type { PresetCollectionId } from '../presets/types';

const COLLECTIONS: { id: PresetCollectionId; label: string }[] = [
  { id: 'original', label: 'MilkDrop Original' },
  { id: 'community', label: 'MilkDrop Community' },
  { id: 'generated', label: 'Generated' },
  { id: 'user', label: 'My Presets' },
];

const ROW = 32;

interface PresetBrowserProps {
  manager: PresetManager;
  revision: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export const PresetBrowser: React.FC<PresetBrowserProps> = ({
  manager,
  revision,
  selectedId,
  onSelect,
}) => {
  const [collection, setCollection] = useState<PresetCollectionId>('original');
  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const items = useMemo(
    () => manager.filter(collection, query),
    [manager, collection, query, revision]
  );
  const start = Math.max(0, Math.floor(scrollTop / ROW) - 2);
  const visible = items.slice(start, start + 14);

  return (
    <div id="preset-browser" className="space-y-2">
      <input
        id="preset-search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setScrollTop(0);
        }}
        placeholder="Buscar presets…"
        className="w-full px-2 py-1.5 rounded bg-black/40 border border-white/10 text-xs font-mono text-neutral-100 outline-none focus:border-cyan-400"
      />
      <div className="flex flex-wrap gap-1">
        {COLLECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setCollection(item.id);
              setScrollTop(0);
            }}
            className={`px-2 py-1 rounded border text-[10px] font-mono ${
              collection === item.id
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                : 'bg-white/5 border-white/10 text-neutral-400'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        id="preset-list"
        className="relative h-64 overflow-y-auto rounded border border-white/10 bg-black/30"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        {items.length === 0 ? (
          <div className="p-3 text-[11px] font-mono text-neutral-500">
            {collection === 'community'
              ? 'No hay un pack de comunidad en esta instalación.'
              : collection === 'original' && !manager.isCatalogLoaded()
                ? 'Cargando índice…'
                : 'No hay presets en esta colección.'}
          </div>
        ) : (
          <div style={{ height: items.length * ROW, position: 'relative' }}>
            {visible.map((preset, index) => {
              const incompatible = manager.isIncompatible(preset.id);
              const selected = preset.id === selectedId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelect(preset.id)}
                  className={`absolute left-0 right-0 px-2 flex items-center text-left text-[11px] font-mono truncate ${
                    selected ? 'bg-cyan-500/20 text-white' : 'text-neutral-300 hover:bg-white/5'
                  } ${incompatible ? 'opacity-40' : ''}`}
                  style={{ top: (start + index) * ROW, height: ROW }}
                  title={incompatible ? 'Preset incompatible' : (preset.path ?? preset.name)}
                >
                  <span className="truncate">{incompatible ? `Incompatible · ${preset.name}` : preset.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
