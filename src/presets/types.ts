import type { GenerativePreset } from '../visualization/generative/GenerativePreset';

export type PresetType = 'milkdrop' | 'generated';
export type PresetSource = 'original' | 'community' | 'generated' | 'user';
export type PresetCollectionId = 'original' | 'community' | 'generated' | 'user' | 'favorites';

export interface PresetRecord {
  id: string;
  name: string;
  type: PresetType;
  source: PresetSource;
  path?: string;
  thumbnail?: string;
  createdAt?: string;
  modifiedAt?: string;
  collection: Exclude<PresetCollectionId, 'favorites'>;
}

export interface UserPresetRecord extends PresetRecord {
  type: 'generated';
  source: 'user';
  collection: 'user';
  preset: GenerativePreset;
}

export interface MilkdropCatalog {
  version: 1;
  collections: {
    original: PresetRecord[];
    community: PresetRecord[];
  };
}
