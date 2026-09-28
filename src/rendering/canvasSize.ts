/** Backing-store size that keeps the CSS aspect ratio and respects a DPR cap. */
export function canvasBackingSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  maxDevicePixelRatio = 2
): { width: number; height: number; ratio: number } {
  const ratio = Math.min(maxDevicePixelRatio, Math.max(1, devicePixelRatio || 1));
  const width = Math.max(1, Math.floor(cssWidth * ratio));
  const height = Math.max(1, Math.floor(cssHeight * ratio));
  return { width, height, ratio };
}
