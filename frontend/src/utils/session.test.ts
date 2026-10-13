import { describe, it, expect, beforeEach } from 'vitest'
import {
  getStoredJobId,
  setStoredJobId,
  clearStoredJobId,
  getStoredActiveTab,
  setStoredActiveTab,
} from './session'

describe('session persistence utilities', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores, retrieves, and clears job ID', () => {
    expect(getStoredJobId()).toBeNull()
    setStoredJobId('job-1234-abcd')
    expect(getStoredJobId()).toBe('job-1234-abcd')
    clearStoredJobId()
    expect(getStoredJobId()).toBeNull()
  })

  it('defaults active tab to upload when nothing is stored', () => {
    expect(getStoredActiveTab()).toBe('upload')
  })

  it('stores and retrieves editor tab', () => {
    setStoredActiveTab('editor')
    expect(getStoredActiveTab()).toBe('editor')
    setStoredActiveTab('upload')
    expect(getStoredActiveTab()).toBe('upload')
  })

  it('replaces old job ID with distinct new job ID and resets active tab', () => {
    // Initial project session
    setStoredJobId('job-first-1111')
    setStoredActiveTab('editor')
    expect(getStoredJobId()).toBe('job-first-1111')
    expect(getStoredActiveTab()).toBe('editor')

    // Start New Project: creates distinct job ID, resets tab to upload
    setStoredJobId('job-second-2222')
    setStoredActiveTab('upload')
    expect(getStoredJobId()).toBe('job-second-2222')
    expect(getStoredActiveTab()).not.toBe('job-first-1111')
    expect(getStoredActiveTab()).toBe('upload')
  })
})
