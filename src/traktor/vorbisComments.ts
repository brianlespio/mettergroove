export interface VorbisTags {
  artist: string;
  title: string;
  album: string;
}

const MAX_BUFFER = 256 * 1024;

/**
 * Streaming reader for the Vorbis comment packets inside an Ogg bitstream.
 * Traktor's broadcast is that bitstream after an Icecast SOURCE header.
 * Audio packets are skipped without being copied.
 */
export class VorbisCommentReader {
  private buffer: Buffer = Buffer.alloc(0);
  private mode: 'idle' | 'ignore' | 'collect' = 'idle';
  private pending: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): VorbisTags | null {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > MAX_BUFFER) {
      const marker = this.buffer.lastIndexOf('OggS');
      this.buffer = marker >= 0 ? this.buffer.subarray(marker) : Buffer.alloc(0);
      this.mode = 'idle';
      this.pending = Buffer.alloc(0);
    }

    let latest: VorbisTags | null = null;
    while (this.buffer.length >= 27) {
      const start = this.buffer.indexOf('OggS');
      if (start < 0) {
        this.buffer = this.buffer.subarray(Math.max(0, this.buffer.length - 3));
        break;
      }
      if (start > 0) this.buffer = this.buffer.subarray(start);
      if (this.buffer.length < 27) break;
      if (this.buffer[4] !== 0) {
        this.buffer = this.buffer.subarray(1);
        continue;
      }
      const segments = this.buffer[26];
      const headerSize = 27 + segments;
      if (this.buffer.length < headerSize) break;
      let body = 0;
      for (let index = 0; index < segments; index += 1) body += this.buffer[27 + index];
      if (this.buffer.length < headerSize + body) break;
      const tags = this.consumePage(this.buffer, segments);
      if (tags) latest = tags;
      this.buffer = this.buffer.subarray(headerSize + body);
    }
    return latest;
  }

  private consumePage(page: Buffer, segments: number): VorbisTags | null {
    let offset = 27 + segments;
    let latest: VorbisTags | null = null;
    for (let index = 0; index < segments; index += 1) {
      const size = page[27 + index];
      const slice = page.subarray(offset, offset + size);
      offset += size;
      if (this.mode === 'idle') {
        if (size === 0) continue;
        if (slice.length >= 7 && slice[0] === 3 && slice.subarray(1, 7).toString('ascii') === 'vorbis') {
          this.mode = 'collect';
          this.pending = Buffer.from(slice);
        } else {
          this.mode = size === 255 ? 'ignore' : 'idle';
          continue;
        }
      } else if (this.mode === 'collect') {
        this.pending = Buffer.concat([this.pending, slice]);
      }

      if (size < 255) {
        if (this.mode === 'collect') {
          const tags = readCommentPacket(this.pending);
          if (tags) latest = tags;
        }
        this.mode = 'idle';
        this.pending = Buffer.alloc(0);
      }
    }
    return latest;
  }
}

export function readCommentPacket(packet: Buffer): VorbisTags | null {
  if (packet.length < 7 || packet[0] !== 3 || packet.subarray(1, 7).toString('ascii') !== 'vorbis') return null;
  let offset = 7;
  if (offset + 4 > packet.length) return null;
  const vendorLength = packet.readUInt32LE(offset);
  offset += 4;
  if (vendorLength > packet.length - offset) return null;
  offset += vendorLength;
  if (offset + 4 > packet.length) return null;
  const count = packet.readUInt32LE(offset);
  offset += 4;
  if (count > 64) return null;

  let artist = '';
  let title = '';
  let album = '';
  for (let index = 0; index < count; index += 1) {
    if (offset + 4 > packet.length) return null;
    const length = packet.readUInt32LE(offset);
    offset += 4;
    if (length > packet.length - offset) return null;
    const pair = packet.subarray(offset, offset + length).toString('utf8');
    offset += length;
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const key = pair.slice(0, separator).toLowerCase();
    const value = pair.slice(separator + 1).trim();
    if (key === 'artist') artist = value;
    else if (key === 'title') title = value;
    else if (key === 'album') album = value;
  }
  if (!artist && !title) return null;
  return { artist, title, album };
}

/** One Ogg page wrapping a single packet. Used by the bridge tests. */
export function oggPage(packet: Buffer): Buffer {
  const segments: number[] = [];
  let remaining = packet.length;
  if (remaining === 0) segments.push(0);
  while (remaining > 0) {
    const size = Math.min(255, remaining);
    segments.push(size);
    remaining -= size;
  }
  const header = Buffer.alloc(27 + segments.length);
  header.write('OggS', 0, 'ascii');
  header[4] = 0;
  header[26] = segments.length;
  segments.forEach((size, index) => {
    header[27 + index] = size;
  });
  return Buffer.concat([header, packet]);
}

export function commentPacket(tags: Record<string, string>, vendor = ''): Buffer {
  const comments = Object.entries(tags).map(([key, value]) => Buffer.from(`${key}=${value}`, 'utf8'));
  const vendorBytes = Buffer.from(vendor, 'utf8');
  const size = 7 + 4 + vendorBytes.length + 4 + comments.reduce((sum, comment) => sum + 4 + comment.length, 0);
  const packet = Buffer.alloc(size);
  packet[0] = 3;
  packet.write('vorbis', 1, 'ascii');
  let offset = 7;
  packet.writeUInt32LE(vendorBytes.length, offset);
  offset += 4;
  vendorBytes.copy(packet, offset);
  offset += vendorBytes.length;
  packet.writeUInt32LE(comments.length, offset);
  offset += 4;
  for (const comment of comments) {
    packet.writeUInt32LE(comment.length, offset);
    offset += 4;
    comment.copy(packet, offset);
    offset += comment.length;
  }
  return packet;
}
