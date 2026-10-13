import { describe, it, expect } from 'vitest'
import {
  BUNDLED_FONTS,
  getFontFamily,
  ensureFontLoaded,
  preloadAllFonts,
} from './fontLoader'

describe('fontLoader utility', () => {
  it('maps all 5 bundled font IDs to exact font family names', () => {
    expect(getFontFamily('great_vibes')).toBe('Great Vibes')
    expect(getFontFamily('allura')).toBe('Allura')
    expect(getFontFamily('alex_brush')).toBe('Alex Brush')
    expect(getFontFamily('cinzel')).toBe('Cinzel')
    expect(getFontFamily('eb_garamond')).toBe('EB Garamond')
    expect(getFontFamily('unknown_font')).toBe('sans-serif')
  })

  it('contains valid definitions for all bundled fonts', () => {
    expect(Object.keys(BUNDLED_FONTS).length).toBe(5)
    for (const [id, font] of Object.entries(BUNDLED_FONTS)) {
      expect(font.id).toBe(id)
      expect(font.name.length).toBeGreaterThan(0)
      expect(font.family.length).toBeGreaterThan(0)
      expect(font.filename.endsWith('.ttf')).toBe(true)
      expect(font.url.startsWith('/fonts/')).toBe(true)
    }
  })

  it('ensureFontLoaded resolves without errors', async () => {
    const result = await ensureFontLoaded('great_vibes')
    expect(result).toBe(true)
  })

  it('preloadAllFonts executes successfully', async () => {
    await expect(preloadAllFonts()).resolves.toBeUndefined()
  })
})
