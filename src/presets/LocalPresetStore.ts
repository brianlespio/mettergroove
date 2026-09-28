import type { UserPresetRecord } from './types';

/**
 * User presets are JSON documents, not screenshots.
 * The store is intentionally small so it can move to IndexedDB later
 * without changing PresetManager.
 */
export interface PresetStore {
  load(): UserPresetRecord[];
  save(records: UserPresetRecord[]): void;
}

const KEY = 'mettergroove.userPresets.v1';

export class LocalPresetStore implements PresetStore {
  constructor(private readonly storage: Storage | null = browserStorage()) {}

  load(): UserPresetRecord[] {
    if (!this.storage) return [];
    try {
      const raw = this.storage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { version?: number; presets?: UserPresetRecord[] };
      if (parsed.version !== 1 || !Array.isArray(parsed.presets)) return [];
      return parsed.presets.filter((preset) => preset && preset.type === 'generated' && preset.preset);
    } catch {
      return [];
    }
  }

  save(records: UserPresetRecord[]): void {
    if (!this.storage) throw new Error('Almacenamiento local no disponible');
    this.storage.setItem(KEY, JSON.stringify({ version: 1, presets: records }));
  }
}

export class MemoryPresetStore implements PresetStore {
  records: UserPresetRecord[] = [];

  load(): UserPresetRecord[] {
    return this.records.map((record) => structuredClone(record));
  }

  save(records: UserPresetRecord[]): void {
    this.records = records.map((record) => structuredClone(record));
  }
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
