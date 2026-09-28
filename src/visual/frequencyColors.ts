// Professional DJ Software Waveform Color & Sound Identification Engine
// Accurately classifies and colors each individual audio element along the timeline:
// - Kicks, Sub-bass, 808s: Fiery Hot Red (#FF1E27)
// - Vocals, Synths, Melodies, Piano: Warm Tangerine / Amber Orange (#F97316)
// - Snares, Claps, Rimshots, Crisp Percussion: Warm Bright Lime (#84CC16)
// - Hi-Hats, Cymbals, Shakers, Air, Sibilance: Electric Ice Cyan (#00E5FF)
// - Layered Impact (Kick + Cymbal): Fiery Red core with Ice Cyan crest (#D946EF blend)

export type SoundCategory = 'kick_bass' | 'mid_vocal' | 'snare_perc' | 'hihat_treble' | 'hybrid';

export interface SoundClassification {
  category: SoundCategory;
  color: string;       // Primary saturated color identifying this specific sound
  coreColor: string;   // Baseline color (red for bass, orange for mids, cyan for hats)
  tipColor: string;    // Peak tip color (cyan for hats, lime for snares, red for pure kicks)
  label: string;       // Human readable sound description for DJ display
  hasBass: boolean;
  hasMid: boolean;
  hasTreble: boolean;
}

/**
 * Classifies an audio slice into its distinct sound element with high color contrast,
 * matching how Serato DJ Pro, Rekordbox 3-Band, and Pioneer CDJ-3000 waveforms operate.
 */
export function classifySoundElement(
  low: number,
  mid: number,
  midHigh: number,
  high: number,
  isTransient: boolean = false
): SoundClassification {
  // Normalize & non-linear scaling to heighten contrast between distinct instruments
  const eLow = Math.max(0, low);
  const eMid = Math.max(0, mid);
  const eMidHigh = Math.max(0, midHigh);
  const eHigh = Math.max(0, high);

  const hasBass = eLow > 0.12;
  const hasTreble = eHigh > 0.10 || (isTransient && eHigh > 0.08);
  const hasMid = eMid > 0.12 || eMidHigh > 0.14;

  // 1. PURE HI-HAT / CYMBAL / SHAKER / CRASH (Agudos Claros Fríos - Electric Ice Cyan)
  // Characterized by strong high frequency energy with negligible bass
  if (eHigh > 0.12 && eHigh > eLow * 1.35 && eHigh >= eMid * 0.85) {
    return {
      category: 'hihat_treble',
      color: '#00E5FF',
      coreColor: '#00D0F0',
      tipColor: '#67E8F9',
      label: 'Hi-Hat / Cymbal',
      hasBass: false,
      hasMid: eMid > 0.15,
      hasTreble: true,
    };
  }

  // 2. PURE KICK DRUM / SUB-BASS / 808 (Bajos Rojos Caliente - Fiery Hot Red)
  // Characterized by strong low-end punch with minimal treble
  if (eLow > 0.14 && eLow > eHigh * 1.30 && eLow >= eMid * 0.90) {
    return {
      category: 'kick_bass',
      color: '#FF1E27',
      coreColor: '#FF1E27',
      tipColor: '#FF3838',
      label: 'Kick / Bass',
      hasBass: true,
      hasMid: eMid > 0.18,
      hasTreble: false,
    };
  }

  // 3. SNARE / CLAP / RIMSHOT / BRIGHT PERCUSSION (Medios Agudos Tibios Claros - Warm Bright Lime)
  // Strong presence in 2kHz - 6kHz range
  if (eMidHigh > 0.15 && eMidHigh >= eLow * 0.95 && eMidHigh >= eHigh * 0.90) {
    return {
      category: 'snare_perc',
      color: '#84CC16',
      coreColor: '#F97316',
      tipColor: '#A3E635',
      label: 'Snare / Clap',
      hasBass: hasBass,
      hasMid: true,
      hasTreble: hasTreble,
    };
  }

  // 4. VOCALS / SYNTH / GUITAR / KEYBOARD (Medios Intermedios Tibios - Warm Tangerine Orange)
  // Strong energy in 250Hz - 2.2kHz range
  if (eMid > 0.14 && eMid >= eHigh * 0.95) {
    return {
      category: 'mid_vocal',
      color: '#F97316',
      coreColor: '#F97316',
      tipColor: '#FB923C',
      label: 'Vocal / Synth',
      hasBass: hasBass,
      hasMid: true,
      hasTreble: hasTreble,
    };
  }

  // 5. HYBRID DROP / FULL-SPECTRUM HIT (Kick + Crash hit simultaneously)
  if (hasBass && hasTreble) {
    return {
      category: 'hybrid',
      color: '#D946EF', // Rich vibrant magenta in Serato RGB mode
      coreColor: '#FF1E27', // Bass heart
      tipColor: '#00E5FF',  // Treble crest
      label: 'Impact / Drop',
      hasBass: true,
      hasMid: hasMid,
      hasTreble: true,
    };
  }

  // Fallback default according to relative dominance
  if (eLow >= eMid && eLow >= eHigh) {
    return {
      category: 'kick_bass',
      color: '#FF1E27',
      coreColor: '#FF1E27',
      tipColor: '#FF3838',
      label: 'Bass',
      hasBass: true,
      hasMid: false,
      hasTreble: false,
    };
  } else if (eHigh >= eMid && eHigh >= eLow) {
    return {
      category: 'hihat_treble',
      color: '#00E5FF',
      coreColor: '#00D0F0',
      tipColor: '#67E8F9',
      label: 'Treble',
      hasBass: false,
      hasMid: false,
      hasTreble: true,
    };
  }

  return {
    category: 'mid_vocal',
    color: '#F97316',
    coreColor: '#F97316',
    tipColor: '#FB923C',
    label: 'Mids',
    hasBass: false,
    hasMid: true,
    hasTreble: false,
  };
}
