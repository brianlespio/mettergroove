import { describe, expect, it } from 'vitest';
import net from 'node:net';
import { createTraktorBridge } from '../bridge/traktorBridge';
import { trackCaption, trackLines } from '../src/traktor/formatTrack';
import { commentPacket, oggPage, VorbisCommentReader } from '../src/traktor/vorbisComments';

describe('traktor metadata', () => {
  function waitFor(ready: () => boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (ready()) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - started > 2000) {
          clearInterval(timer);
          reject(new Error('el puente no abrió'));
        }
      }, 15);
    });
  }

  it('answers the Icecast handshake so Traktor Pro stays connected', async () => {
    const bridge = createTraktorBridge(39219);
    try {
      await waitFor(() => bridge.snapshot().listening);
      const reply = await new Promise<string>((resolve, reject) => {
        const socket = net.connect(39219, '127.0.0.1', () => {
          socket.write('SOURCE /mount ICE/1.0\nContent-Type: application/ogg\n\n');
        });
        socket.setTimeout(2000, () => reject(new Error('sin respuesta')));
        socket.once('data', (chunk) => resolve(chunk.toString('utf8')));
        socket.once('error', reject);
      });
      expect(reply).toContain('200 OK');
      expect(bridge.snapshot().connected).toBe(true);
    } finally {
      bridge.close();
    }
  });

  it('reads artist and title from an ogg comment page', () => {
    const reader = new VorbisCommentReader();
    const page = oggPage(commentPacket({ ARTIST: 'Richie Hawtin', TITLE: 'Spastik', ALBUM: 'Decks' }));
    const tags = reader.push(Buffer.concat([Buffer.from('SOURCE / HTTP/1.0\r\n\r\n'), page]));
    expect(tags).toEqual({ artist: 'Richie Hawtin', title: 'Spastik', album: 'Decks' });
  });

  it('keeps the newest comment when the track changes in the same stream', () => {
    const reader = new VorbisCommentReader();
    reader.push(oggPage(commentPacket({ ARTIST: 'A', TITLE: 'One' })));
    const next = reader.push(oggPage(commentPacket({ artist: 'B', title: 'Two' })));
    expect(next).toEqual({ artist: 'B', title: 'Two', album: '' });
  });

  it('ignores malformed bytes and audio-like packets', () => {
    const reader = new VorbisCommentReader();
    expect(reader.push(Buffer.from('not ogg at all'))).toBeNull();
    const noise = Buffer.alloc(80);
    noise[0] = 0;
    expect(reader.push(oggPage(noise))).toBeNull();
  });

  it('formats artist and title without dropping either field', () => {
    expect(trackLines('{{artist}} — {{title}}', 'Plastikman', 'Spastik')).toEqual(['Plastikman', 'Spastik']);
    expect(trackLines('{{title}} — {{artist}}', 'Plastikman', 'Spastik')).toEqual(['Spastik', 'Plastikman']);
    expect(trackLines('{{artist}}', 'Plastikman', 'Spastik')).toEqual(['Plastikman']);
    expect(trackLines('{{title}}', 'Plastikman', 'Spastik')).toEqual(['Spastik']);
    expect(trackCaption('{{title}} — {{artist}}', 'Plastikman', 'Spastik')).toBe('Spastik — Plastikman');
    expect(trackCaption('{{artist}} — {{title}}', '', '')).toBe('');
  });
});
