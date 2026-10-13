import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startBatchExport, getExportStatus, getExportDownloadUrl } from '../api/client'

describe('Milestone 5 Export Client', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('startBatchExport sends POST to /exports and returns ExportJobResponse', async () => {
    const mockExportResponse = {
      export_id: 'exp-123',
      job_id: 'job-abc',
      status: 'pending',
      created_at: new Date().toISOString(),
      total_count: 20,
      processed_count: 0,
      percent_complete: 0,
    }

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockExportResponse,
    })
    globalThis.fetch = fetchSpy

    const result = await startBatchExport('job-abc')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/jobs/job-abc/exports'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(result.export_id).toBe('exp-123')
    expect(result.status).toBe('pending')
  })

  it('getExportStatus polls export status and details', async () => {
    const mockStatusResponse = {
      export_id: 'exp-123',
      job_id: 'job-abc',
      status: 'completed',
      created_at: new Date().toISOString(),
      total_count: 20,
      processed_count: 20,
      percent_complete: 100,
      zip_size_bytes: 1048576,
    }

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStatusResponse,
    })
    globalThis.fetch = fetchSpy

    const result = await getExportStatus('job-abc', 'exp-123')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/jobs/job-abc/exports/exp-123'),
      expect.objectContaining({ headers: expect.anything() })
    )
    expect(result.status).toBe('completed')
    expect(result.percent_complete).toBe(100)
  })

  it('getExportDownloadUrl generates clean download URL', () => {
    const url = getExportDownloadUrl('job-abc', 'exp-123')
    expect(url).toContain('/api/jobs/job-abc/exports/exp-123/download')
  })
})
