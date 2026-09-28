import { nextPresetId, previousPresetId, randomPresetId } from '../visualization/presetIndex';
import type { GenerativePreset } from '../visualization/generative/GenerativePreset';
import type { PresetStore } from './LocalPresetStore';
import type {
  MilkdropCatalog,
  PresetCollectionId,
  PresetRecord,
  UserPresetRecord,
} from './types';

export type CatalogLoader = () => Promise<MilkdropCatalog>;

export class PresetManager {
  private original: PresetRecord[] = [];
  private community: PresetRecord[] = [];
  private user: UserPresetRecord[] = [];
  private readonly favorites = new Set<string>();
  private readonly incompatible = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private catalogLoaded = false;
  private loading: Promise<void> | null = null;

  constructor(
    private readonly store: PresetStore,
    favoriteIds: readonly string[] = [],
    private readonly loadCatalog: CatalogLoader = fetchMilkdropCatalog
  ) {
    for (const id of favoriteIds) this.favorites.add(id);
    this.user = this.store.load();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  ensureCatalog(): Promise<void> {
    if (this.catalogLoaded) return Promise.resolve();
    if (!this.loading) {
      this.loading = this.loadCatalog()
        .then((catalog) => {
          this.original = catalog.collections.original;
          this.community = catalog.collections.community;
          this.catalogLoaded = true;
          this.emit();
        })
        .finally(() => {
          this.loading = null;
        });
    }
    return this.loading;
  }

  isCatalogLoaded(): boolean {
    return this.catalogLoaded;
  }

  markIncompatible(id: string): void {
    if (this.incompatible.has(id)) return;
    this.incompatible.add(id);
    this.emit();
  }

  isIncompatible(id: string): boolean {
    return this.incompatible.has(id);
  }

  isFavorite(id: string): boolean {
    return this.favorites.has(id);
  }

  toggleFavorite(id: string): boolean {
    if (this.favorites.has(id)) this.favorites.delete(id);
    else this.favorites.add(id);
    this.emit();
    return this.favorites.has(id);
  }

  favoriteIds(): string[] {
    return [...this.favorites];
  }

  get(id: string): PresetRecord | UserPresetRecord | null {
    return (
      this.user.find((preset) => preset.id === id) ||
      this.original.find((preset) => preset.id === id) ||
      this.community.find((preset) => preset.id === id) ||
      null
    );
  }

  collectionIds(collection: PresetCollectionId): string[] {
    return this.collectionRecords(collection).map((preset) => preset.id);
  }

  /** First playable preset, preferring ones that are not fade/transition helpers. */
  startupId(collection: PresetCollectionId): string | null {
    const usable = this.collectionRecords(collection).filter((preset) => !this.incompatible.has(preset.id));
    const steady = usable.find((preset) => !/transition/i.test(`${preset.path ?? ''}\n${preset.name}`));
    return (steady ?? usable[0])?.id ?? null;
  }

  filter(collection: PresetCollectionId, query: string): PresetRecord[] {
    const needle = query.trim().toLowerCase();
    const records = this.collectionRecords(collection);
    if (!needle) return records;
    return records.filter((preset) => {
      const haystack = `${preset.name} ${preset.path ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }

  nextId(collection: PresetCollectionId, currentId: string | null): string | null {
    return nextPresetId({
      ids: this.navigableIds(collection),
      currentId,
      blocked: this.incompatible,
    });
  }

  previousId(collection: PresetCollectionId, currentId: string | null): string | null {
    return previousPresetId({
      ids: this.navigableIds(collection),
      currentId,
      blocked: this.incompatible,
    });
  }

  randomId(collection: PresetCollectionId, currentId: string | null, random?: () => number): string | null {
    return randomPresetId(
      { ids: this.navigableIds(collection), currentId, blocked: this.incompatible },
      random
    );
  }

  private navigableIds(collection: PresetCollectionId): string[] {
    return this.collectionIds(collection).filter((id) => !this.isTransition(id));
  }

  private isTransition(id: string): boolean {
    const record = this.get(id);
    if (!record) return false;
    return /transition/i.test(`${record.path ?? ''}\n${record.name}`);
  }

  saveGenerated(preset: GenerativePreset): UserPresetRecord {
    const now = new Date().toISOString();
    const id = `user:${preset.seed}`;
    const existing = this.user.find((record) => record.id === id);
    const record: UserPresetRecord = {
      id,
      name: preset.name,
      type: 'generated',
      source: 'user',
      collection: 'user',
      createdAt: existing?.createdAt ?? preset.createdAt ?? now,
      modifiedAt: now,
      preset: { ...preset, modifiedAt: now },
    };
    this.user = [record, ...this.user.filter((item) => item.id !== id)];
    this.store.save(this.user);
    this.emit();
    return record;
  }

  userPresets(): UserPresetRecord[] {
    return this.user;
  }

  private collectionRecords(collection: PresetCollectionId): PresetRecord[] {
    if (collection === 'original') return this.original;
    if (collection === 'community') return this.community;
    if (collection === 'generated' || collection === 'user') return this.user;
    const favorite = new Set(this.favorites);
    return [...this.user, ...this.original, ...this.community].filter((preset) => favorite.has(preset.id));
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export async function fetchMilkdropCatalog(): Promise<MilkdropCatalog> {
  const response = await fetch('/milkdrop/manifest.json');
  if (!response.ok) {
    throw new Error('No se pudo leer el índice de presets MilkDrop');
  }
  const catalog = (await response.json()) as MilkdropCatalog;
  if (catalog.version !== 1 || !catalog.collections) {
    throw new Error('Índice de presets incompatible');
  }
  catalog.collections.original ??= [];
  catalog.collections.community ??= [];
  return catalog;
}

export function milkdropPresetUrl(relativePath: string): string {
  return `/milkdrop/presets/${relativePath.split('/').map(encodeURIComponent).join('/')}`;
}

export function textureCandidateUrls(samplerName: string): string[] {
  const bare = samplerName.replace(/^sampler_/, '');
  const names = bare === samplerName ? [samplerName] : [bare, samplerName];
  const extensions = ['jpg', 'jpeg', 'png', 'webp'];
  const urls: string[] = [];
  for (const name of names) {
    for (const extension of extensions) {
      urls.push(`/milkdrop/textures/${encodeURIComponent(name)}.${extension}`);
    }
  }
  return urls;
}
