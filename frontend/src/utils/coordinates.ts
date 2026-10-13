import type { PlacementRegion } from '../api/client'

export interface CanvasRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Converts normalized [0, 1] placement coordinates into canvas pixel coordinates.
 */
export function normalizedToCanvas(
  norm: PlacementRegion,
  canvasWidth: number,
  canvasHeight: number
): CanvasRect {
  return {
    x: Math.round(norm.x * canvasWidth),
    y: Math.round(norm.y * canvasHeight),
    width: Math.round(norm.width * canvasWidth),
    height: Math.round(norm.height * canvasHeight),
  }
}

/**
 * Converts canvas pixel coordinates into normalized [0, 1] coordinates, clamped within bounds.
 */
export function canvasToNormalized(
  rect: CanvasRect,
  canvasWidth: number,
  canvasHeight: number
): PlacementRegion {
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return { x: 0, y: 0, width: 0.1, height: 0.1 }
  }

  const rawX = rect.x / canvasWidth
  const rawY = rect.y / canvasHeight
  const rawW = rect.width / canvasWidth
  const rawH = rect.height / canvasHeight

  return clampNormalizedRect({
    x: rawX,
    y: rawY,
    width: rawW,
    height: rawH,
  })
}

/**
 * Ensures normalized coordinates are strictly within [0.0, 1.0] and width/height > 0.
 */
export function clampNormalizedRect(rect: PlacementRegion): PlacementRegion {
  const minDimension = 0.01 // minimum 1% dimension

  let x = Math.max(0, Math.min(1 - minDimension, rect.x))
  let y = Math.max(0, Math.min(1 - minDimension, rect.y))
  let width = Math.max(minDimension, Math.min(1 - x, rect.width))
  let height = Math.max(minDimension, Math.min(1 - y, rect.height))

  // Prevent exceeding outer bounds
  if (x + width > 1.0) {
    width = 1.0 - x
  }
  if (y + height > 1.0) {
    height = 1.0 - y
  }

  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    width: Number(width.toFixed(4)),
    height: Number(height.toFixed(4)),
  }
}

/**
 * Clamps canvas pixel coordinates strictly inside the canvas boundaries.
 */
export function clampCanvasRect(
  rect: CanvasRect,
  canvasWidth: number,
  canvasHeight: number
): CanvasRect {
  const minSize = 10
  const x = Math.max(0, Math.min(canvasWidth - minSize, rect.x))
  const y = Math.max(0, Math.min(canvasHeight - minSize, rect.y))
  const width = Math.max(minSize, Math.min(canvasWidth - x, rect.width))
  const height = Math.max(minSize, Math.min(canvasHeight - y, rect.height))

  return { x, y, width, height }
}
