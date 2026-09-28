declare module 'butterchurn' {
  export interface ButterchurnVisualizer {
    connectAudio(node: AudioNode): void;
    disconnectAudio(node: AudioNode): void;
    loadPreset(preset: ButterchurnPreset, blendTime?: number): void;
    setRendererSize(
      width: number,
      height: number,
      opts?: { pixelRatio?: number; textureRatio?: number }
    ): void;
    render(): void;
    loadExtraImages(images: Record<string, { data: string; width: number; height: number }>): void;
  }

  export interface ButterchurnPreset {
    baseVals: Record<string, number>;
    shapes: Array<{ baseVals?: Record<string, number>; init_eqs_str?: string; frame_eqs_str?: string }>;
    waves: Array<{ baseVals?: Record<string, number>; init_eqs_str?: string; frame_eqs_str?: string; point_eqs_str?: string }>;
    init_eqs_str?: string;
    frame_eqs_str?: string;
    pixel_eqs_str?: string;
    warp?: string;
    comp?: string;
    [key: string]: unknown;
  }

  interface ButterchurnApi {
    createVisualizer(
      context: AudioContext,
      canvas: HTMLCanvasElement,
      opts: { width: number; height: number; pixelRatio?: number; textureRatio?: number }
    ): ButterchurnVisualizer;
  }

  const butterchurn: ButterchurnApi;
  export default butterchurn;
}

declare module 'milkdrop-preset-converter' {
  import type { ButterchurnPreset } from 'butterchurn';

  export function convertPreset(text: string): Promise<ButterchurnPreset>;
}
