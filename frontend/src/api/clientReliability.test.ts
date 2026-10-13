import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createJob,
  getJob,
  getTemplatePreviewUrl,
} from './client'

describe('Client Reliability & Error Handling Regression Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('createJob throws helpful ApiError when backend is offline or network fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Load failed'))

    await expect(createJob()).rejects.toThrow(
      'Cannot connect to the local backend service. Please check that the server is running.'
    )
  })

  it('createJob throws helpful ApiError on Failed to fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(createJob()).rejects.toThrow(
      'Cannot connect to the local backend service. Please check that the server is running.'
    )
  })

  it('createJob preserves API error detail on 4xx/5xx responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Custom validation error' }),
    } as Response)

    await expect(createJob()).rejects.toThrow('Custom validation error')
  })

  it('getJob throws helpful ApiError on network connection failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('NetworkError when attempting to fetch resource.'))

    await expect(getJob('test-job')).rejects.toThrow(
      'Cannot connect to the local backend service. Please check that the server is running.'
    )
  })

  it('getTemplatePreviewUrl correctly appends cache-busting version parameter', () => {
    const urlWithoutVersion = getTemplatePreviewUrl('/api/jobs/123/template/preview')
    expect(urlWithoutVersion).toBe('http://localhost:8000/api/jobs/123/template/preview')

    const urlWithVersion = getTemplatePreviewUrl('/api/jobs/123/template/preview', 2)
    expect(urlWithVersion).toBe('http://localhost:8000/api/jobs/123/template/preview?v=2')

    const urlWithExistingQuery = getTemplatePreviewUrl('/api/jobs/123/template/preview?foo=bar', 'abc')
    expect(urlWithExistingQuery).toBe('http://localhost:8000/api/jobs/123/template/preview?foo=bar&v=abc')
  })
})
