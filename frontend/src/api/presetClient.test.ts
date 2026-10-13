import { describe, it, expect, vi } from 'vitest'
import {
  fetchPresets,
  savePresetFromJob,
  usePreset,
  deletePreset,
} from './client'

describe('Preset Client API Utilities', () => {
  it('fetchPresets calls /api/presets and returns presets array', async () => {
    const mockPresets = [
      {
        preset_id: 'preset-123',
        name: 'Honors Award',
        template_meta: {
          filename: 'template.png',
          format: 'PNG',
          width: 1200,
          height: 800,
          aspect_ratio: 1.5,
          orientation: 'landscape',
          file_size_bytes: 4000,
          preview_url: '/preview',
        },
        placement: { x: 0.2, y: 0.4, width: 0.6, height: 0.2 },
        typography: {
          font_id: 'great_vibes',
          preferred_font_size: 52,
          min_font_size: 18,
          text_color: '#000000',
          alignment: 'center',
        },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        thumbnail_url: '/api/presets/preset-123/thumbnail',
      },
    ]

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ presets: mockPresets }),
    } as Response)

    const result = await fetchPresets()
    expect(result).toEqual(mockPresets)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Honors Award')
  })

  it('savePresetFromJob sends POST request with name body', async () => {
    const mockCreated = {
      preset_id: 'new-preset-456',
      name: 'Workshop Completion',
      template_meta: {
        filename: 'cert.png',
        format: 'PNG',
        width: 1200,
        height: 800,
        aspect_ratio: 1.5,
        orientation: 'landscape',
        file_size_bytes: 3000,
        preview_url: '/preview',
      },
      placement: { x: 0.1, y: 0.3, width: 0.8, height: 0.2 },
      typography: {
        font_id: 'allura',
        preferred_font_size: 48,
        min_font_size: 18,
        text_color: '#111827',
        alignment: 'center',
      },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      thumbnail_url: '/api/presets/new-preset-456/thumbnail',
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockCreated,
    } as Response)

    const result = await savePresetFromJob('job-1', 'Workshop Completion')
    expect(result.preset_id).toBe('new-preset-456')
    expect(result.name).toBe('Workshop Completion')
  })

  it('usePreset sends POST to /api/presets/:id/use and returns fresh job', async () => {
    const mockNewJob = {
      job_id: 'fresh-job-789',
      status: 'template_uploaded',
      created_at: '2026-01-01T00:00:00Z',
      template: {
        filename: 'cert.png',
        format: 'PNG',
        width: 1200,
        height: 800,
        aspect_ratio: 1.5,
        orientation: 'landscape',
        file_size_bytes: 3000,
        preview_url: '/preview',
      },
      placement: { x: 0.1, y: 0.3, width: 0.8, height: 0.2 },
      typography: {
        font_id: 'allura',
        preferred_font_size: 48,
        min_font_size: 18,
        text_color: '#111827',
        alignment: 'center',
      },
      csv_summary: null,
      participants_preview: [],
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockNewJob,
    } as Response)

    const result = await usePreset('preset-123')
    expect(result.job_id).toBe('fresh-job-789')
    expect(result.csv_summary).toBeNull()
  })
})
