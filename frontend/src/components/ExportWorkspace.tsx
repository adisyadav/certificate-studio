import React, { useState, useEffect, useRef } from 'react'
import {
  Download,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Layers,
  FileText,
  AlertTriangle,
  Archive,
} from 'lucide-react'
import type {
  JobResponse,
  ExportJobResponse,
  BatchTypographyReport,
} from '../api/client'

import {
  startBatchExport,
  getExportStatus,
  getExportDownloadUrl,
  getTemplatePreviewUrl,
  analyzeTypography,
  ApiError,
} from '../api/client'

interface ExportWorkspaceProps {
  job: JobResponse
  onBackToEditor: () => void
  onJobUpdated?: (updated: JobResponse) => void
}

export const ExportWorkspace: React.FC<ExportWorkspaceProps> = ({
  job,
  onBackToEditor,
  onJobUpdated,
}) => {

  const [activeExport, setActiveExport] = useState<ExportJobResponse | null>(null)
  const [isStarting, setIsStarting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState<boolean>(false)
  const [latestReport, setLatestReport] = useState<BatchTypographyReport | null>(
    job.batch_analysis
  )
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const template = job.template
  const typography = job.typography
  const placement = job.placement
  const csvSummary = job.csv_summary

  const totalValid = csvSummary?.valid_count || 0
  const totalInvalid = csvSummary?.invalid_count || 0

  const hasPlacement = !!placement
  const hasTypography = !!typography

  // Update latestReport when job.batch_analysis changes
  useEffect(() => {
    if (job.batch_analysis) {
      setLatestReport(job.batch_analysis)
    }
  }, [job.batch_analysis])

  // Self-sufficient Pre-Flight Validation function
  const runPreFlightValidation = async () => {
    if (!hasPlacement || !hasTypography || totalValid === 0) return
    setIsValidating(true)
    setErrorMessage(null)

    try {
      const report = await analyzeTypography(job.job_id)
      setLatestReport(report)
      onJobUpdated?.({
        ...job,
        batch_analysis: report,
      })
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(`Readiness check failed: ${err.message}`)
      } else {
        setErrorMessage('Readiness check failed.')
      }
    } finally {
      setIsValidating(false)
    }
  }

  // Automatically run pre-flight readiness check if analysis is missing or stale
  useEffect(() => {
    if (!latestReport && hasPlacement && hasTypography && totalValid > 0 && !isValidating) {
      runPreFlightValidation()
    }
  }, [job.job_id, latestReport, hasPlacement, hasTypography, totalValid])

  const allFit = latestReport?.all_fit ?? false
  const hasAnalysis = !!latestReport

  // Can start only if template, placement, typography, and clean validation exist
  const canStartExport =
    hasPlacement &&
    hasTypography &&
    totalValid > 0 &&
    hasAnalysis &&
    allFit &&
    !isValidating &&
    !isStarting &&
    (!activeExport || activeExport.status === 'completed' || activeExport.status === 'failed')


  // Poll active export status
  useEffect(() => {
    if (!activeExport) return
    const status = activeExport.status
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      return
    }

    pollTimerRef.current = setTimeout(async () => {
      try {
        const updated = await getExportStatus(job.job_id, activeExport.export_id)
        setActiveExport(updated)
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          setErrorMessage(err.message)
        }
      }
    }, 600)

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
      }
    }
  }, [activeExport, job.job_id])

  const handleStartExport = async () => {
    setIsStarting(true)
    setErrorMessage(null)
    try {
      const exp = await startBatchExport(job.job_id)
      setActiveExport(exp)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage('Failed to start certificate export.')
      }
    } finally {
      setIsStarting(false)
    }
  }

  const isGenerating =
    activeExport &&
    ['pending', 'validating', 'generating', 'packaging', 'verifying'].includes(
      activeExport.status
    )
  const isCompleted = activeExport?.status === 'completed'
  const isFailed = activeExport?.status === 'failed'

  const downloadUrl =
    isCompleted && activeExport
      ? getExportDownloadUrl(job.job_id, activeExport.export_id)
      : null

  const formatBytes = (bytes?: number | null) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <button
            type="button"
            onClick={onBackToEditor}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors mb-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Visual Editor</span>
          </button>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Production Batch Export & Download</span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              Step 3 of 3
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            Generate individual, verified personalized PDFs for every valid participant and download as a ZIP archive.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToEditor}
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors flex items-center gap-1.5"
          >
            <span>Adjust Typography</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5 shadow-xs">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
          <div className="space-y-1">
            <p className="font-semibold">Batch Export Halted</p>
            <p className="whitespace-pre-line leading-relaxed">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Generation Card & Progress */}
        <div className="lg:col-span-2 space-y-6">
          {/* Export Action Card */}
          <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Archive className="h-4 w-4 text-indigo-600" />
                  <span>Batch PDF Generator</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Processes all valid participants individually with authoritative font auto-fitting.
                </p>
              </div>

              {isCompleted ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Ready for Download</span>
                </span>
              ) : isGenerating ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                  <span className="capitalize">{activeExport?.status}...</span>
                </span>
              ) : null}
            </div>

            {/* Progress Section */}
            {activeExport && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 flex items-center gap-2">
                    {isGenerating && <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-600" />}
                    {isCompleted && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                    {isFailed && <AlertCircle className="h-3.5 w-3.5 text-rose-600" />}
                    <span>
                      {isCompleted
                        ? `${activeExport.processed_count} of ${activeExport.total_count} certificates generated successfully`
                        : isFailed
                        ? `Export failed: ${activeExport.error_message}`
                        : `Processing: ${activeExport.processed_count} of ${activeExport.total_count} certificates completed`}
                    </span>
                  </span>
                  <span className="font-mono font-semibold text-slate-900">
                    {activeExport.percent_complete}%
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      isCompleted
                        ? 'bg-emerald-500'
                        : isFailed
                        ? 'bg-rose-500'
                        : 'bg-indigo-600'
                    }`}
                    style={{ width: `${activeExport.percent_complete}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>Current Stage: <strong className="text-slate-700 capitalize">{activeExport.status}</strong></span>
                  {activeExport.zip_size_bytes && (
                    <span>Archive Size: <strong>{formatBytes(activeExport.zip_size_bytes)}</strong></span>
                  )}
                </div>
              </div>
            )}

            {/* Readiness and Validation States */}
            {isValidating && (
              <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <RefreshCw className="h-4 w-4 animate-spin text-indigo-600 shrink-0" />
                  <span>Checking certificate readiness and verifying all participant layouts...</span>
                </div>
              </div>
            )}

            {!isValidating && !hasAnalysis && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>Certificate configuration has not been validated yet.</span>
                </div>
                <button
                  type="button"
                  onClick={runPreFlightValidation}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium text-[11px]"
                >
                  Run Readiness Check
                </button>
              </div>
            )}

            {!isValidating && hasAnalysis && allFit && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    Ready to generate! All <strong>{latestReport?.total_analyzed}</strong> participants fit safely without boundary overflows.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={runPreFlightValidation}
                  className="text-emerald-700 hover:text-emerald-900 underline text-[11px]"
                >
                  Re-check
                </button>
              </div>
            )}

            {!isValidating && hasAnalysis && !allFit && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-2.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                  <div>
                    <span className="font-semibold block">Validation Failed</span>
                    <span>
                      {latestReport?.overflow_count || 0} participant name(s) cannot fit within the designated placement area even at minimum font size ({typography?.min_font_size}px).
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onBackToEditor}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-medium text-[11px] shrink-0"
                >
                  Adjust in Editor
                </button>
              </div>
            )}


            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleStartExport}
                disabled={!canStartExport}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-amber-300" />
                )}
                <span>
                  {isGenerating
                    ? 'Generating Batch...'
                    : activeExport?.status === 'completed'
                    ? 'Regenerate Batch'
                    : 'Generate Certificates'}
                </span>
              </button>

              {isCompleted && downloadUrl && (
                <a
                  href={downloadUrl}
                  download="certificates.zip"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  <span>Download certificates.zip</span>
                </a>
              )}
            </div>
          </div>

          {/* Detailed Participant Export Report */}
          {activeExport?.report && (
            <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  <h4 className="text-xs font-semibold text-slate-900">
                    Generated Participant Archive ({activeExport.report.certificates.length} PDFs)
                  </h4>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  Export ID: {activeExport.export_id.slice(0, 8)}
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 text-xs">
                {activeExport.report.certificates.map((cert) => (
                  <div
                    key={cert.csv_row}
                    className="py-2 px-2 flex items-center justify-between hover:bg-slate-50 rounded"
                  >
                    <div className="flex items-center gap-2 truncate pr-4">
                      <span className="font-mono text-[10px] text-slate-400">
                        #{cert.csv_row}
                      </span>
                      <span className="font-medium text-slate-800 truncate">
                        {cert.name}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 truncate">
                        ({cert.filename})
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-[11px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                        {cert.fitted_font_size}px
                      </span>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right 1 Col: Batch Snapshot & Specification */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
            <h4 className="text-xs font-semibold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-600" />
              <span>Export Configuration Snapshot</span>
            </h4>

            {/* Template Card */}
            {template && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center gap-3">
                <img
                  src={getTemplatePreviewUrl(template.preview_url)}
                  alt="Template"
                  className="w-14 h-10 object-contain rounded border border-slate-200 bg-white"
                />
                <div className="text-xs truncate">
                  <span className="font-medium text-slate-900 block truncate">
                    {template.filename}
                  </span>
                  <span className="text-[11px] text-slate-500 capitalize">
                    {template.format} • {template.width}×{template.height}px
                  </span>
                </div>
              </div>
            )}

            {/* Typography Summary */}
            {typography && (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Selected Font:</span>
                  <strong className="text-slate-900 capitalize">{typography.font_id.replace('_', ' ')}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Preferred Font Size:</span>
                  <strong className="text-slate-900 font-mono">{typography.preferred_font_size}px</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Minimum Font Size:</span>
                  <strong className="text-slate-900 font-mono">{typography.min_font_size}px</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Alignment:</span>
                  <strong className="text-slate-900 capitalize">{typography.alignment}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Text Color:</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-full border border-slate-300"
                      style={{ backgroundColor: typography.text_color }}
                    />
                    <strong className="font-mono text-slate-900">{typography.text_color}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Participant Counts */}
            <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Valid CSV Participants:</span>
                <strong className="text-emerald-700 font-mono">{totalValid}</strong>
              </div>
              {totalInvalid > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Invalid/Empty Rows:</span>
                  <span className="text-rose-600 font-mono">{totalInvalid}</span>
                </div>
              )}
              {latestReport && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Dynamically Resized:</span>
                  <span className="text-indigo-600 font-mono">{latestReport.reduction_count}</span>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
