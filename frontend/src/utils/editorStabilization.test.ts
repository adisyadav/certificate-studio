import { describe, it, expect } from 'vitest'
import { clampNormalizedRect, clampCanvasRect } from './coordinates'

describe('editor stabilization & coordinate boundary guarantees', () => {
  it('prevents name placement rectangle from moving outside certificate bounds', () => {
    const invalidPlacement = { x: -0.1, y: 1.2, width: 0.5, height: 0.2 }
    const clamped = clampNormalizedRect(invalidPlacement)

    expect(clamped.x).toBeGreaterThanOrEqual(0)
    expect(clamped.y).toBeLessThanOrEqual(0.99)
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(1.0)
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(1.0)
  })

  it('guarantees canvas pixel coordinates remain within stage dimensions', () => {
    const stageWidth = 800
    const stageHeight = 600

    const clamped = clampCanvasRect(
      { x: 750, y: 550, width: 100, height: 80 },
      stageWidth,
      stageHeight
    )

    expect(clamped.x + clamped.width).toBeLessThanOrEqual(stageWidth)
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(stageHeight)
  })
})
