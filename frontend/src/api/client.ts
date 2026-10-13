export interface HealthStatus {
  status: string
  app: string
  version: string
}

export type JobStatus = 'created' | 'template_uploaded' | 'csv_uploaded' | 'ready'
export type TemplateOrientation = 'landscape' | 'portrait' | 'square'

export interface TemplateMetadata {
  filename: string
  format: string
  width: number
  height: number
  aspect_ratio: number
  orientation: TemplateOrientation
  file_size_bytes: number
  preview_url: string
}

export interface ParticipantRecord {
  row_number: number
  name: string
  extra_fields: Record<string, string>
  is_valid: boolean
  is_duplicate: boolean
  validation_errors: string[]
}

export interface CsvSummary {
  filename: string
  total_rows: number
  valid_count: number
  invalid_count: number
  duplicate_count: number
  headers: string[]
  candidate_name_columns: string[]
  selected_name_column: string | null
  warnings: string[]
  errors: string[]
}

export interface JobResponse {
  job_id: string
  created_at: string
  status: JobStatus
  template: TemplateMetadata | null
  csv_summary: CsvSummary | null
  participants_preview: ParticipantRecord[]
  warnings: string[]
  errors: string[]
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_BASE_URL}/api/health`, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Failed to check health: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export async function createJob(): Promise<JobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new Error(errorData?.detail || `Failed to create job (${response.status})`)
  }

  return response.json()
}

export async function getJob(jobId: string): Promise<JobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new Error(errorData?.detail || `Failed to fetch job (${response.status})`)
  }

  return response.json()
}

export async function uploadTemplate(jobId: string, file: File): Promise<JobResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/template`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new Error(errorData?.detail || `Failed to upload template (${response.status})`)
  }

  return response.json()
}

export async function uploadCsv(jobId: string, file: File): Promise<JobResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/csv`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new Error(errorData?.detail || `Failed to upload CSV (${response.status})`)
  }

  return response.json()
}

export async function selectNameColumn(jobId: string, columnName: string): Promise<JobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/select-name-column`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ column_name: columnName }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new Error(errorData?.detail || `Failed to select name column (${response.status})`)
  }

  return response.json()
}

export function getTemplatePreviewUrl(relativeUrl: string): string {
  if (relativeUrl.startsWith('http')) return relativeUrl
  return `${API_BASE_URL}${relativeUrl}`
}
