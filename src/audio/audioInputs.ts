import type { AudioInputDevice } from '../traktor/types';

/**
 * Lists capture devices the browser can actually open.
 * Output-only endpoints stay hidden: Chrome exposes a sound card here when it
 * has a microphone, line-in, Stereo Mix or a loopback input.
 */
export async function listAudioInputs(): Promise<AudioInputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  let probe: MediaStream | null = null;
  try {
    probe = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new Error('El navegador bloqueó el permiso de audio. Sin ese permiso no puede mostrar las placas.');
    }
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === 'audioinput')
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label.trim() || 'Entrada sin nombre',
      }));
  } finally {
    probe?.getTracks().forEach((track) => track.stop());
  }
}
