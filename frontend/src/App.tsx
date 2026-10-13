import React, { useEffect, useState } from 'react'
import {
  Layers,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  FileCheck2,
  SlidersHorizontal,
  UploadCloud,
} from 'lucide-react'
import {
  fetchHealth,
  createJob,
  getJob,
  uploadTemplate,
  uploadCsv,
  selectNameColumn,
  savePlacement,
  type HealthStatus,
  type JobResponse,
  type PlacementRegion,
} from './api/client'
import { TemplateUploader } from './components/TemplateUploader'
import { CsvUploader } from './components/CsvUploader'
import { CertificateEditor } from './components/CertificateEditor'

export const App: React.FC = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [healthLoading, setHealthLoading] = useState<boolean>(true)

  const [currentJob, setCurrentJob] = useState<JobResponse | null>(null)
  const [activeTab, setActiveTab] = useState<'upload' | 'editor'>('upload')
  const [isTemplateUploading, setIsTemplateUploading] = useState<boolean>(false)
  const [isCsvUploading, setIsCsvUploading] = useState<boolean>(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  // Check health and initialize session job
  const initApp = async () => {
    setHealthLoading(true)
    try {
      const h = await fetchHealth()
      setHealth(h)
    } catch {
      setHealth(null)
    } finally {
      setHealthLoading(false)
    }

    // Initialize job session if not present, or reload if already present
    if (!currentJob) {
      try {
        const job = await createJob()
        setCurrentJob(job)
      } catch (err: unknown) {
        if (err instanceof Error) {
          setGlobalError(`Failed to initialize session: ${err.message}`)
        }
      }
    } else {
      try {
        const refreshed = await getJob(currentJob.job_id)
        setCurrentJob(refreshed)
      } catch {
        // keep currentJob
      }
    }
  }

  useEffect(() => {
    initApp()
  }, [])

  const handleTemplateUpload = async (file: File) => {
    if (!currentJob) return
    setIsTemplateUploading(true)
    setGlobalError(null)
    try {
      const updatedJob = await uploadTemplate(currentJob.job_id, file)
      setCurrentJob(updatedJob)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setGlobalError(err.message)
      }
      throw err
    } finally {
      setIsTemplateUploading(false)
    }
  }

  const handleCsvUpload = async (file: File) => {
    if (!currentJob) return
    setIsCsvUploading(true)
    setGlobalError(null)
    try {
      const updatedJob = await uploadCsv(currentJob.job_id, file)
      setCurrentJob(updatedJob)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setGlobalError(err.message)
      }
      throw err
    } finally {
      setIsCsvUploading(false)
    }
  }

  const handleSelectNameColumn = async (columnName: string) => {
    if (!currentJob) return
    setGlobalError(null)
    try {
      const updatedJob = await selectNameColumn(currentJob.job_id, columnName)
      setCurrentJob(updatedJob)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setGlobalError(err.message)
      }
      throw err
    }
  }

  const handleSavePlacement = async (placement: PlacementRegion) => {
    if (!currentJob) return
    setGlobalError(null)
    try {
      const updatedJob = await savePlacement(currentJob.job_id, placement)
      setCurrentJob(updatedJob)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setGlobalError(err.message)
      }
      throw err
    }
  }

  const hasTemplate = !!currentJob?.template
  const hasParticipants = !!currentJob?.csv_summary && currentJob.csv_summary.valid_count > 0
  const hasSavedPlacement = !!currentJob?.placement

  const canOpenEditor = hasTemplate
  const canContinueToGeneration = hasTemplate && hasParticipants && hasSavedPlacement

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-200">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-semibold tracking-tight text-slate-900 block leading-tight">
                Certificate Studio
              </span>
              <span className="text-[11px] font-medium tracking-wide text-slate-500 uppercase block">
                Local-First PDF Generator
              </span>
            </div>
          </div>

          {/* Stepper Tabs */}
          <div className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                activeTab === 'upload'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UploadCloud className="h-3.5 w-3.5" />
              <span>1. Ingestion</span>
              {hasTemplate && hasParticipants && (
                <CheckCircle2 className="h-3 w-3 text-emerald-600 ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => canOpenEditor && setActiveTab('editor')}
              disabled={!canOpenEditor}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                activeTab === 'editor'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : canOpenEditor
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 cursor-not-allowed opacity-60'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>2. Visual Editor</span>
              {hasSavedPlacement && (
                <CheckCircle2 className="h-3 w-3 text-emerald-600 ml-0.5" />
              )}
            </button>
          </div>

          {/* Status & Session ID */}
          <div className="flex items-center gap-3">
            {currentJob && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-mono">
                <span>Job:</span>
                <span className="font-semibold">{currentJob.job_id.slice(0, 8)}...</span>
              </div>
            )}

            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                healthLoading
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : health
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              {healthLoading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-500" />
                  <span>Checking...</span>
                </>
              ) : health ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>API Connected</span>
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5 text-rose-500" />
                  <span>Backend Offline</span>
                </>
              )}
            </div>

            <button
              onClick={initApp}
              disabled={healthLoading}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors disabled:opacity-50"
              title="Refresh connection"
              aria-label="Refresh connection"
            >
              <RefreshCw className={`h-4 w-4 ${healthLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 flex flex-col justify-between">
        <div>
          {/* Global Error Banner */}
          {globalError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3 shadow-xs">
              <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-semibold">Action could not be completed</p>
                <p className="text-xs text-rose-700 mt-0.5">{globalError}</p>
              </div>
            </div>
          )}

          {activeTab === 'upload' ? (
            <div>
              {/* Headline & Overview */}
              <section className="mb-8">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-medium mb-3">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Milestone 2 & 3 — File Ingestion & Placement Calibration</span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 leading-tight">
                      Upload Certificate Assets
                    </h1>
                    <p className="text-sm text-slate-600 font-normal mt-1 max-w-2xl">
                      Upload your certificate template (PNG, JPG, PDF) and participant CSV.
                      All processing remains 100% local on your machine.
                    </p>
                  </div>

                  {canOpenEditor && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('editor')}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors shrink-0"
                    >
                      <span>Open Visual Editor</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </section>

              {/* Upload Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <TemplateUploader
                  template={currentJob?.template || null}
                  onUpload={handleTemplateUpload}
                  isUploading={isTemplateUploading}
                />

                <CsvUploader
                  csvSummary={currentJob?.csv_summary || null}
                  participants={currentJob?.participants_preview || []}
                  onUpload={handleCsvUpload}
                  onSelectColumn={handleSelectNameColumn}
                  isUploading={isCsvUploading}
                />
              </div>

              {/* Milestone Readiness Status Card */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <FileCheck2 className="h-5 w-5 text-indigo-600" />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Workflow Status
                      </h3>
                      <p className="text-xs text-slate-500">
                        Readiness progression towards bulk PDF certificate generation
                      </p>
                    </div>
                  </div>

                  <div>
                    {canContinueToGeneration ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Ready for Generation (Milestone 4)</span>
                      </span>
                    ) : hasTemplate ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <span>Template Loaded — Position Name Area</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        <span>Awaiting files</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-slate-500 block mb-0.5">Template File</span>
                      <span className="font-semibold text-slate-800">
                        {currentJob?.template
                          ? `${currentJob.template.format} (${currentJob.template.width}×${currentJob.template.height})`
                          : 'Not uploaded'}
                      </span>
                    </div>
                    {currentJob?.template && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-slate-500 block mb-0.5">Participant List</span>
                      <span className="font-semibold text-slate-800">
                        {currentJob?.csv_summary
                          ? `${currentJob.csv_summary.valid_count} valid / ${currentJob.csv_summary.total_rows} total`
                          : 'Not uploaded'}
                      </span>
                    </div>
                    {currentJob?.csv_summary && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    )}
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-slate-500 block mb-0.5">Name Placement</span>
                      <span className="font-semibold text-slate-800">
                        {currentJob?.placement ? 'Calibrated & Saved' : 'Not configured'}
                      </span>
                    </div>
                    {currentJob?.placement ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => canOpenEditor && setActiveTab('editor')}
                        disabled={!canOpenEditor}
                        className="text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
                      >
                        Edit →
                      </button>
                    )}
                  </div>
                </div>
              </section>
            </div>
          ) : (
            currentJob?.template && (
              <CertificateEditor
                template={currentJob.template}
                savedPlacement={currentJob.placement}
                participants={currentJob.participants_preview}
                onSavePlacement={handleSavePlacement}
                onBackToUpload={() => setActiveTab('upload')}
                onContinue={() => {
                  alert(
                    'Milestone 3 complete! The name placement is saved. Authoritative rendering and batch generation will be unlocked in Milestone 4.'
                  )
                }}
                canContinue={canContinueToGeneration}
              />
            )
          )}
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            <span>Certificate Studio — Local-First Data Privacy (Zero Cloud Uploads)</span>
          </div>
          <span>React Konva • FastAPI • Pillow • PyMuPDF • Vite</span>
        </footer>
      </main>
    </div>
  )
}

export default App
