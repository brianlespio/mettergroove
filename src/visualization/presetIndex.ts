/** Playlist navigation over preset ids. Folders, textures and blocked ids are never selected. */

export interface PresetCursor {
  ids: readonly string[];
  currentId: string | null;
  blocked: ReadonlySet<string>;
}

export function playableIds(ids: readonly string[], blocked: ReadonlySet<string>): string[] {
  const playable: string[] = [];
  for (const id of ids) {
    if (!id || blocked.has(id)) continue;
    if (!isPresetId(id)) continue;
    playable.push(id);
  }
  return playable;
}

export function isPresetId(id: string): boolean {
  return id.length > 0 && !id.endsWith('/') && !id.endsWith('.md');
}

export function nextPresetId(cursor: PresetCursor): string | null {
  const playable = playableIds(cursor.ids, cursor.blocked);
  if (playable.length === 0) return null;
  const index = cursor.currentId ? playable.indexOf(cursor.currentId) : -1;
  return playable[(index + 1) % playable.length];
}

export function previousPresetId(cursor: PresetCursor): string | null {
  const playable = playableIds(cursor.ids, cursor.blocked);
  if (playable.length === 0) return null;
  const index = cursor.currentId ? playable.indexOf(cursor.currentId) : 0;
  const previous = index <= 0 ? playable.length - 1 : index - 1;
  return playable[previous];
}

export function randomPresetId(cursor: PresetCursor, random: () => number = Math.random): string | null {
  const playable = playableIds(cursor.ids, cursor.blocked).filter((id) => id !== cursor.currentId);
  const pool = playable.length > 0 ? playable : playableIds(cursor.ids, cursor.blocked);
  if (pool.length === 0) return null;
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index];
}
