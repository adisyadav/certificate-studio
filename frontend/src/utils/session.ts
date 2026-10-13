const STORAGE_JOB_ID_KEY = 'certificate_studio_job_id'
const STORAGE_ACTIVE_TAB_KEY = 'certificate_studio_active_tab'

export type AppTab = 'upload' | 'editor' | 'export'

export function getStoredJobId(): string | null {
  try {
    return localStorage.getItem(STORAGE_JOB_ID_KEY)
  } catch {
    return null
  }
}

export function setStoredJobId(jobId: string): void {
  try {
    localStorage.setItem(STORAGE_JOB_ID_KEY, jobId)
  } catch {
    // Ignore localStorage write errors in private browsing/sandboxed environments
  }
}

export function clearStoredJobId(): void {
  try {
    localStorage.removeItem(STORAGE_JOB_ID_KEY)
  } catch {
    // Ignore
  }
}

export function getStoredActiveTab(): AppTab {
  try {
    const tab = localStorage.getItem(STORAGE_ACTIVE_TAB_KEY)
    if (tab === 'upload' || tab === 'editor' || tab === 'export') {
      return tab
    }
  } catch {
    // Ignore
  }
  return 'upload'
}


export function setStoredActiveTab(tab: AppTab): void {
  try {
    localStorage.setItem(STORAGE_ACTIVE_TAB_KEY, tab)
  } catch {
    // Ignore
  }
}
