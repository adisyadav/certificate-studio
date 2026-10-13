import { describe, it, expect } from 'vitest'
import {
  normalizedToCanvas,
  canvasToNormalized,
  clampNormalizedRect,
} from './coordinates'

describe('coordinate conversion utilities', () => {
  it('converts normalized coordinates to canvas pixel dimensions accurately', () => {
    const norm = { x: 0.25, y: 0.5, width: 0.5, height: 0.2 }
    const canvas = normalizedToCanvas(norm, 800, 600)
    expect(canvas).toEqual({
      x: 200,
      y: 300,
      width: 400,
      height: 120,
    })
  })

  it('converts canvas pixel coordinates back to normalized coordinates accurately', () => {
    const canvas = { x: 200, y: 300, width: 400, height: 120 }
    const norm = canvasToNormalized(canvas, 800, 600)
    expect(norm.x).toBe(0.25)
    expect(norm.y).toBe(0.5)
    expect(norm.width).toBe(0.5)
    expect(norm.height).toBe(0.2)
  })

  it('clamps normalized regions that exceed outer boundaries', () => {
    const overflown = { x: 0.8, y: 0.7, width: 0.4, height: 0.5 }
    const clamped = clampNormalizedRect(overflown)
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(1.0001)
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(1.0001)
  })
})
