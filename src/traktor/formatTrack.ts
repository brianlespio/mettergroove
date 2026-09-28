export const TRACK_FORMATS = [
  '{{title}}',
  '{{artist}} — {{title}}',
  '{{artist}}',
  '{{artist}} / {{title}}',
  '{{title}} — {{artist}}',
  '{{artist}} • {{title}}',
] as const;

export type TrackFormat = (typeof TRACK_FORMATS)[number];

export function isTrackFormat(value: string): value is TrackFormat {
  return (TRACK_FORMATS as readonly string[]).includes(value);
}

/** Two visual lines when both fields exist. Order follows the chosen format. */
export function trackLines(format: string, artist: string, title: string): string[] {
  const safeFormat = isTrackFormat(format) ? format : TRACK_FORMATS[0];
  const name = artist.trim();
  const song = title.trim();
  const hasArtist = safeFormat.includes('{{artist}}');
  const hasTitle = safeFormat.includes('{{title}}');
  if (hasArtist && hasTitle) {
    if (!name && !song) return [];
    if (!name) return [song];
    if (!song) return [name];
    const artistFirst = safeFormat.indexOf('{{artist}}') < safeFormat.indexOf('{{title}}');
    return artistFirst ? [name, song] : [song, name];
  }
  if (hasArtist) return name ? [name] : [];
  if (hasTitle) return song ? [song] : [];
  return [];
}

export function trackCaption(format: string, artist: string, title: string): string {
  const safeFormat = isTrackFormat(format) ? format : TRACK_FORMATS[0];
  return safeFormat
    .replaceAll('{{artist}}', artist.trim())
    .replaceAll('{{title}}', title.trim())
    .replace(/\s+[—/•]\s+$/u, '')
    .replace(/^\s+[—/•]\s+/u, '')
    .trim();
}
