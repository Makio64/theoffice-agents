export const MAX_RENDER_DPR = 2

/** Preserve the display's detail while bounding the Retina render-target cost. */
export function renderResolution(width, height, deviceDpr = 1, pixelScale = 1) {
  const finiteSize = value => Math.max(1, Math.round(Number.isFinite(Number(value)) ? Number(value) : 1))
  const nativeDpr = Number.isFinite(Number(deviceDpr)) && Number(deviceDpr) > 0 ? Number(deviceDpr) : 1
  const dpr = Math.min(nativeDpr, MAX_RENDER_DPR)
  const scale = [1, 2, 3].includes(pixelScale) ? pixelScale : 1
  const cssWidth = finiteSize(width), cssHeight = finiteSize(height)
  // Even a hidden/minimized canvas must retain a non-zero physical buffer.
  const minLogicalSize = Math.ceil(1 / dpr)
  const renderWidth = Math.max(minLogicalSize, Math.round(cssWidth / scale))
  const renderHeight = Math.max(minLogicalSize, Math.round(cssHeight / scale))
  return {
    nativeDpr, dpr, pixelScale: scale, cssWidth, cssHeight, renderWidth, renderHeight,
    bufferWidth: Math.floor(renderWidth * dpr), bufferHeight: Math.floor(renderHeight * dpr),
  }
}
