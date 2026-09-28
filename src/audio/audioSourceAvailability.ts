export interface AudioSourceAvailability {
  microphone: boolean;
  displayCapture: boolean;
  file: boolean;
}

export function detectAudioSourceAvailability(): AudioSourceAvailability {
  const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  return {
    microphone: typeof media?.getUserMedia === 'function',
    displayCapture: typeof media?.getDisplayMedia === 'function',
    file: typeof Audio !== 'undefined' || typeof File !== 'undefined',
  };
}

export function displayCaptureErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Permiso de captura denegado. El navegador no entregó audio de la pestaña o del sistema.';
  }
  if (name === 'NotFoundError' || name === 'NotSupportedError') {
    return 'Este navegador no permite capturar audio del sistema o de una pestaña.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'No se pudo abrir la fuente de audio.';
}
