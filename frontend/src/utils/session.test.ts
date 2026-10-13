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
})
