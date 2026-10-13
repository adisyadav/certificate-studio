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

  it('accurately derives inner safe clearance guides', () => {
    const canvasRect = { x: 100, y: 200, width: 400, height: 100 }
    const vertClearance = 0.08
    const horizClearance = 0.04
    const padX = canvasRect.width * horizClearance
    const padY = canvasRect.height * vertClearance

    const safeGuide = {
      x: canvasRect.x + padX,
      y: canvasRect.y + padY,
      width: canvasRect.width - 2 * padX,
      height: canvasRect.height - 2 * padY,
    }

    expect(safeGuide).toEqual({
      x: 116,
      y: 208,
      width: 368,
      height: 84,
    })
    expect(safeGuide.height).toBeLessThan(canvasRect.height)
    expect(safeGuide.y + safeGuide.height).toBeLessThan(canvasRect.y + canvasRect.height)
  })
})
