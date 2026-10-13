export interface HealthStatus {
  status: string
  app: string
  version: string
}

export type JobStatus = 'created' | 'template_uploaded' | 'csv_uploaded' | 'ready'
export type TemplateOrientation = 'landscape' | 'portrait' | 'square'
export type TextAlignment = 'center' | 'left' | 'right'

export interface FontInfo {
  id: string
  name: string
  category: string
  filename: string
  sample_text: string
}

export interface TypographyConfig {
  font_id: string
  preferred_font_size: number
  min_font_size: number
  text_color: string
  alignment: TextAlignment
}

export interface ParticipantTypographyAnalysis {
  row_number: number
  name: string
  fitted_font_size: number
  is_overflowing: boolean
  requires_reduction: boolean
  has_unsupported_glyphs: boolean
  unsupported_glyphs: string[]
  visual_width: number
}

export interface BatchTypographyReport {
  total_analyzed: number
  all_fit: boolean
  overflow_count: number
  reduction_count: number
  unsupported_glyph_count: number
  shortest_name: string | null
  longest_name_by_chars: string | null
  widest_name: string | null
  widest_visual_width: number
  participants_analysis: ParticipantTypographyAnalysis[]
  warnings: string[]
}

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

export interface PlacementRegion {
  x: number
  y: number
  width: number
  height: number
}

export type CleanupMode = 'none' | 'solid' | 'inpaint' | 'pdf_redact'

export interface CleanupConfig {
  mode: CleanupMode
  region: PlacementRegion | null
  sample_border_color: boolean
  custom_color: string | null
  inpaint_radius: number
}

export interface JobResponse {
  job_id: string
  created_at: string
  status: JobStatus
  template: TemplateMetadata | null
  csv_summary: CsvSummary | null
  placement: PlacementRegion | null
  cleanup: CleanupConfig | null
  typography: TypographyConfig | null
  batch_analysis: BatchTypographyReport | null
  participants_preview: ParticipantRecord[]
  warnings: string[]
  errors: string[]
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_BASE_URL}/api/health`, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new ApiError(`Health check failed: ${response.status}`, response.status)
  }

  return response.json()
}

export async function fetchFonts(): Promise<FontInfo[]> {
  const response = await fetch(`${API_BASE_URL}/api/fonts`, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new ApiError(`Failed to fetch fonts (${response.status})`, response.status)
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
    throw new ApiError(errorData?.detail || `Failed to create job (${response.status})`, response.status)
  }

  return response.json()
}

export async function getJob(jobId: string): Promise<JobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new ApiError(errorData?.detail || `Failed to fetch job (${response.status})`, response.status)
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
    throw new ApiError(errorData?.detail || `Failed to upload template (${response.status})`, response.status)
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
    throw new ApiError(errorData?.detail || `Failed to upload CSV (${response.status})`, response.status)
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
    throw new ApiError(errorData?.detail || `Failed to select name column (${response.status})`, response.status)
  }

  return response.json()
}

export async function savePlacement(
  jobId: string,
  placement: PlacementRegion
): Promise<JobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/placement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ placement }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new ApiError(errorData?.detail || `Failed to save placement (${response.status})`, response.status)
  }

  return response.json()
}

export async function saveTypography(
  jobId: string,
  typography: TypographyConfig
): Promise<JobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/typography`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(typography),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new ApiError(errorData?.detail || `Failed to save typography (${response.status})`, response.status)
  }

  return response.json()
}

export async function analyzeTypography(jobId: string): Promise<BatchTypographyReport> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/analyze-typography`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new ApiError(errorData?.detail || `Failed to analyze typography (${response.status})`, response.status)
  }

  return response.json()
}

export async function saveCleanup(
  jobId: string,
  cleanup: CleanupConfig
): Promise<JobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/cleanup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(cleanup),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new ApiError(errorData?.detail || `Failed to save cleanup (${response.status})`, response.status)
  }

  return response.json()
}

export function getCleanedPreviewUrl(jobId: string, v?: number): string {
  const url = new URL(`${API_BASE_URL}/api/jobs/${jobId}/preview/cleaned`)
  if (v) {
    url.searchParams.set('v', String(v))
  }
  return url.toString()
}

export function getRenderedPreviewUrl(
  jobId: string,
  params?: { participantRow?: number; sampleText?: string; v?: number }
): string {
  const url = new URL(`${API_BASE_URL}/api/jobs/${jobId}/preview`)
  if (params?.participantRow) {
    url.searchParams.set('participant_row', String(params.participantRow))
  }
  if (params?.sampleText) {
    url.searchParams.set('sample_text', params.sampleText)
  }
  if (params?.v) {
    url.searchParams.set('v', String(params.v))
  }
  return url.toString()
}

export function getTemplatePreviewUrl(relativeUrl: string): string {
  if (relativeUrl.startsWith('http')) return relativeUrl
  return `${API_BASE_URL}${relativeUrl}`
}

