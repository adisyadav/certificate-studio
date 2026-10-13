export interface HealthStatus {
  status: string
  app: string
  version: string
}

export type JobStatus = 'created' | 'template_uploaded' | 'csv_uploaded' | 'ready'
export type TemplateOrientation = 'landscape' | 'portrait' | 'square'
export type TextAlignment = 'center' | 'left' | 'right'
export type SizingMode = 'smart_consistent' | 'individual_max'

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
  sizing_mode?: SizingMode
  vertical_clearance_percent?: number
  horizontal_clearance_percent?: number
}

export interface LayoutBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface TypographyLayoutResult {
  font_size: number
  fits: boolean
  fitted_at_reduced_size: boolean
  text_bounds: LayoutBounds
  draw_position: { x: number; y: number }
  safe_bounds?: LayoutBounds
  baseline_y?: number
  warnings: string[]
}

export interface ParticipantTypographyAnalysis {
  row_number: number
  name: string
  fitted_font_size: number
  is_overflowing: boolean
  requires_reduction: boolean
  insufficient_clearance?: boolean
  status_label?: string
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
  insufficient_clearance_count?: number
  shared_target_font_size?: number | null
  consistent_count?: number
  adjusted_count?: number
  shortest_name: string | null
  longest_name_by_chars: string | null
  widest_name: string | null
  widest_visual_width: number
  participants_analysis: ParticipantTypographyAnalysis[]
  warnings: string[]
  config_fingerprint?: string | null
}


export interface AutoFitResponse {
  typography: TypographyConfig
  batch_analysis: BatchTypographyReport
  summary: string
  optimal_size: number
  all_fit: boolean
  overflow_count: number
}
export type ExportStatus =
  | 'pending'
  | 'validating'
  | 'generating'
  | 'packaging'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface ParticipantExportRecord {
  csv_row: number
  name: string
  filename: string
  fitted_font_size: number
  status: string
  error_message?: string | null
}

export interface GenerationReport {
  job_id: string
  export_id: string
  timestamp: string
  template_format: string
  template_dimensions: {
    width: number
    height: number
    aspect_ratio: number
    orientation: string
  }
  font: string
  text_color: string
  alignment: string
  auto_fit_enabled: boolean
  total_participants: number
  successful: number
  failed: number
  certificates: ParticipantExportRecord[]
  warnings: string[]
  errors: string[]
}

export interface ValidationFinding {
  level: 'passed' | 'warning' | 'blocking_error'
  category: string
  message: string
  details?: Record<string, unknown> | null
  row_number?: number | null
  participant_name?: string | null
}

export interface BatchValidationReport {
  is_ready_to_export: boolean
  total_participants: number
  blocking_error_count: number
  warning_count: number
  passed_count: number
  summary_message: string
  findings: ValidationFinding[]
}

export interface ExportJobResponse {
  export_id: string
  job_id: string
  status: ExportStatus
  created_at: string
  completed_at?: string | null
  total_count: number
  processed_count: number
  percent_complete: number
  report?: GenerationReport | null
  error_message?: string | null
  zip_size_bytes?: number | null
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

export interface JobResponse {
  job_id: string
  created_at: string
  status: JobStatus
  template: TemplateMetadata | null
  csv_summary: CsvSummary | null
  placement: PlacementRegion | null
  cleanup?: unknown
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

export async function fetchTextLayout(
  jobId: string,
  params?: {
    participantRow?: number
    sampleText?: string
    placement?: PlacementRegion
    typography?: TypographyConfig
    signal?: AbortSignal
  }
): Promise<TypographyLayoutResult> {
  // If in-memory placement or typography are provided, use the POST /layout/calculate endpoint
  if (params?.placement || params?.typography) {
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/layout/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sample_text: params?.sampleText,
        participant_row: params?.participantRow,
        placement: params?.placement,
        typography: params?.typography,
      }),
      signal: params?.signal,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new ApiError(errorData?.detail || `Failed to calculate layout (${response.status})`, response.status)
    }

    return response.json()
  }

  const url = new URL(`${API_BASE_URL}/api/jobs/${jobId}/layout`)
  if (params?.participantRow) {
    url.searchParams.set('participant_row', String(params.participantRow))
  }
  if (params?.sampleText) {
    url.searchParams.set('sample_text', params.sampleText)
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: params?.signal,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new ApiError(errorData?.detail || `Failed to calculate layout (${response.status})`, response.status)
  }

  return response.json()
}

export async function autoFitAllNames(jobId: string): Promise<AutoFitResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/auto-fit`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new ApiError(errorData?.detail || `Failed to auto-fit typography (${response.status})`, response.status)
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

export async function validateExport(jobId: string): Promise<BatchValidationReport> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/validate-export`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new ApiError(errorData?.detail || `Failed to validate export (${response.status})`, response.status)
  }

  return response.json()
}

export async function startBatchExport(jobId: string): Promise<ExportJobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/exports`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new ApiError(errorData?.detail || `Failed to start batch export (${response.status})`, response.status)
  }

  return response.json()
}

export async function getExportStatus(jobId: string, exportId: string): Promise<ExportJobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/exports/${exportId}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new ApiError(errorData?.detail || `Failed to get export status (${response.status})`, response.status)
  }

  return response.json()
}

export function getExportDownloadUrl(jobId: string, exportId: string): string {
  return `${API_BASE_URL}/api/jobs/${jobId}/exports/${exportId}/download`
}

