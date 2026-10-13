/**
 * Font loader utility for Certificate Studio.
 * Guarantees reliable programmatic font loading for HTML5 Canvas / Konva rendering
 * without relying on lazy browser CSS triggers.
 */

export interface BundledFontDefinition {
  id: string
  name: string
  family: string
  filename: string
  url: string
}

export const BUNDLED_FONTS: Record<string, BundledFontDefinition> = {
  great_vibes: {
    id: 'great_vibes',
    name: 'Great Vibes',
    family: 'Great Vibes',
    filename: 'GreatVibes-Regular.ttf',
    url: '/fonts/GreatVibes-Regular.ttf',
  },
  allura: {
    id: 'allura',
    name: 'Allura',
    family: 'Allura',
    filename: 'Allura-Regular.ttf',
    url: '/fonts/Allura-Regular.ttf',
  },
  alex_brush: {
    id: 'alex_brush',
    name: 'Alex Brush',
    family: 'Alex Brush',
    filename: 'AlexBrush-Regular.ttf',
    url: '/fonts/AlexBrush-Regular.ttf',
  },
  cinzel: {
    id: 'cinzel',
    name: 'Cinzel',
    family: 'Cinzel',
    filename: 'Cinzel-Regular.ttf',
    url: '/fonts/Cinzel-Regular.ttf',
  },
  eb_garamond: {
    id: 'eb_garamond',
    name: 'EB Garamond',
    family: 'EB Garamond',
    filename: 'EBGaramond-Regular.ttf',
    url: '/fonts/EBGaramond-Regular.ttf',
  },
}

// Cache of loaded font family names
const loadedFontFamilies = new Set<string>()

/**
 * Maps font ID (e.g. 'great_vibes') to exact CSS font-family name.
 */
export function getFontFamily(fontId: string): string {
  const def = BUNDLED_FONTS[fontId]
  return def ? def.family : 'sans-serif'
}

/**
 * Programmatically loads a bundled font by ID into the browser document fonts cache.
 * Resolves with true if the font is available, or false if it failed.
 */
export async function ensureFontLoaded(fontId: string): Promise<boolean> {
  const def = BUNDLED_FONTS[fontId]
  if (!def) return false

  const { family, url } = def

  if (loadedFontFamilies.has(family)) {
    return true
  }

  if (typeof document === 'undefined' || !('fonts' in document)) {
    // Non-browser environment (e.g. testing)
    loadedFontFamilies.add(family)
    return true
  }

  try {
    // 1. Check if the browser already has the font loaded
    if (document.fonts.check(`16px "${family}"`)) {
      loadedFontFamilies.add(family)
      return true
    }

    // 2. Programmatically create and load FontFace
    if (typeof FontFace !== 'undefined') {
      const fontFace = new FontFace(family, `url(${url})`)
      const loadedFace = await fontFace.load()
      document.fonts.add(loadedFace)
      await document.fonts.ready
      loadedFontFamilies.add(family)
      return true
    }

    // 3. Fallback: document.fonts.load
    await document.fonts.load(`16px "${family}"`)
    const success = document.fonts.check(`16px "${family}"`)
    if (success) {
      loadedFontFamilies.add(family)
    }
    return success
  } catch (err) {
    console.error(`Failed to load font "${family}":`, err)
    return false
  }
}

/**
 * Preloads all 5 bundled certificate fonts in the background.
 */
export async function preloadAllFonts(): Promise<void> {
  const fontIds = Object.keys(BUNDLED_FONTS)
  await Promise.allSettled(fontIds.map((id) => ensureFontLoaded(id)))
}
