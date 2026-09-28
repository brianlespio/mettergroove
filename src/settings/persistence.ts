import type { AudioSourceType } from '../audio/AudioEngine';
import type { VisualizerConfig } from '../types/audio';
import type { VisualizationFamily } from '../visualization/types';

export interface PersistedVisualizationState {
  version: 1;
  family: VisualizationFamily;
  config: VisualizerConfig;
  milkdropPresetId: string | null;
  generatedPresetId: string | null;
  audioSource: AudioSourceType;
  fullscreen: boolean;
  favoriteIds: string[];
  audioInputId?: string | null;
  showTrackText?: boolean;
  trackFormat?: string;
  trackStyle?: 'pulse' | 'wave' | 'glitch';
  trackBlend?: 'normal' | 'screen' | 'multiply' | 'difference';
  djName?: string;
  djName2?: string;
}

const KEY = 'mettergroove.visualization.v1';

export function loadPreferences(storage: Storage | null = defaultStorage()): PersistedVisualizationState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedVisualizationState;
    if (parsed.version !== 1 || !parsed.config) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePreferences(
  state: PersistedVisualizationState,
  storage: Storage | null = defaultStorage()
): void {
  if (!storage) return;
  storage.setItem(KEY, JSON.stringify({ ...state, version: 1 }));
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
