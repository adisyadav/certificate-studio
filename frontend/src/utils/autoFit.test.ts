import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchTextLayout, autoFitAllNames } from '../api/client'

describe('AutoFit and Request Cancellation', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('fetchTextLayout uses in-memory calculation endpoint when placement is provided', async () => {
    const mockResponse = {
      font_size: 48,
      fits: true,
      fitted_at_reduced_size: false,
      text_bounds: { x: 100, y: 200, width: 300, height: 50 },
      draw_position: { x: 100, y: 200 },
      warnings: [],
    }

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    })
    globalThis.fetch = fetchSpy

    const result = await fetchTextLayout('job-123', {
      sampleText: 'Ada Lovelace',
      placement: { x: 0.1, y: 0.2, width: 0.5, height: 0.1 },
      typography: {
        font_id: 'great_vibes',
        preferred_font_size: 52,
        min_font_size: 18,
        text_color: '#111827',
        alignment: 'center',
      },
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/jobs/job-123/layout/calculate'),
      expect.objectContaining({
        method: 'POST',
      })
    )
    expect(result.font_size).toBe(48)
    expect(result.fits).toBe(true)
  })

  it('fetchTextLayout passes signal to fetch for cancellation', async () => {
    const controller = new AbortController()

    const fetchSpy = vi.fn().mockImplementation((_url, options) => {
      if (options?.signal?.aborted) {
        const error = new Error('The user aborted a request.')
        error.name = 'AbortError'
        return Promise.reject(error)
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ font_size: 50, fits: true, fitted_at_reduced_size: false, text_bounds: { x: 0, y: 0, width: 10, height: 10 }, draw_position: { x: 0, y: 0 }, warnings: [] }),
      })
    })
    globalThis.fetch = fetchSpy

    controller.abort()

    await expect(
      fetchTextLayout('job-123', {
        sampleText: 'Ada Lovelace',
        placement: { x: 0.1, y: 0.2, width: 0.5, height: 0.1 },
        signal: controller.signal,
      })
    ).rejects.toThrow('The user aborted a request.')
  })

  it('autoFitAllNames sends POST to /auto-fit and returns response', async () => {
    const mockAutoFitResponse = {
      typography: {
        font_id: 'great_vibes',
        preferred_font_size: 46,
        min_font_size: 18,
        text_color: '#111827',
        alignment: 'center',
      },
      batch_analysis: {
        total_analyzed: 5,
        all_fit: true,
        overflow_count: 0,
        reduction_count: 1,
        unsupported_glyph_count: 0,
        shortest_name: 'Ada',
        longest_name_by_chars: 'Bartholomew',
        widest_name: 'Bartholomew',
        widest_visual_width: 250,
        participants_analysis: [],
        warnings: [],
      },
      summary: 'Successfully auto-fitted all 5 names! Preferred size set to 46px.',
      optimal_size: 46,
      all_fit: true,
      overflow_count: 0,
    }

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAutoFitResponse,
    })
    globalThis.fetch = fetchSpy

    const res = await autoFitAllNames('job-123')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/jobs/job-123/auto-fit'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(res.optimal_size).toBe(46)
    expect(res.all_fit).toBe(true)
  })
})

