export interface TrackMetadata {
  artist: string;
  title: string;
  album: string;
  deck: string;
  timestamp: number;
  source: 'traktor';
  status: 'playing' | 'stopped' | 'unknown';
}

export interface TraktorLinkState extends TrackMetadata {
  listening: boolean;
  connected: boolean;
  port: number;
  error: string;
}

export const TRAKTOR_PORT = 39217;

export const EMPTY_TRACK: TrackMetadata = {
  artist: '',
  title: '',
  album: '',
  deck: '',
  timestamp: 0,
  source: 'traktor',
  status: 'unknown',
};

export type TrackTextStyle = 'pulse' | 'wave' | 'glitch';
export type TrackBlendMode = 'normal' | 'screen' | 'multiply' | 'difference';

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}
