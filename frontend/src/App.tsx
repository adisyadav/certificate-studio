import React, { useEffect, useState, useCallback } from 'react'
import {
  Layers,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  ServerCrash,
  Plus,
} from 'lucide-react'
import {
  fetchHealth,
  createJob,
  getJob,
  uploadTemplate,
  uploadCsv,
  selectNameColumn,
  savePlacement,
  saveTypography,
  ApiError,
  type HealthStatus,
  type JobResponse,
  type PlacementRegion,
  type TypographyConfig,
} from './api/client'
import { TemplateUploader } from './components/TemplateUploader'
import { CsvUploader } from './components/CsvUploader'
import { CertificateEditor } from './components/CertificateEditor'
import { ExportWorkspace } from './components/ExportWorkspace'
import { SavedTemplates } from './components/SavedTemplates'

import {
  getStoredJobId,
  setStoredJobId,
  clearStoredJobId,
  getStoredActiveTab,
  setStoredActiveTab,
  type AppTab,
} from './utils/session'

export const App: React.FC = () => {
  const [, setHealth] = useState<HealthStatus | null>(null)
  const [healthLoading, setHealthLoading] = useState<boolean>(true)

  const [currentJob, setCurrentJob] = useState<JobResponse | null>(null)
  const [activeTab, setActiveTab] = useState<AppTab>('upload')
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true)
  const [isTemplateUploading, setIsTemplateUploading] = useState<boolean>(false)
  const [isCsvUploading, setIsCsvUploading] = useState<boolean>(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [backendOffline, setBackendOffline] = useState<boolean>(false)
  const [isCreatingNewProject, setIsCreatingNewProject] = useState<boolean>(false)

  // Initialize or restore session
  const initApp = useCallback(async () => {
    setHealthLoading(true)
    setGlobalError(null)
    setBackendOffline(false)

    let isApiHealthy = false
    try {
      const h = await fetchHealth()
      setHealth(h)
      isApiHealthy = true
    } catch {
      setHealth(null)
      isApiHealthy = false
    } finally {
      setHealthLoading(false)
    }

    if (!isApiHealthy) {
      // Backend is unreachable; DO NOT delete stored job ID
      setBackendOffline(true)
      setIsRestoringSession(false)
      return
    }

    // Backend is reachable: attempt session recovery or creation
    const storedJobId = getStoredJobId()
    const storedTab = getStoredActiveTab()

    if (storedJobId) {
      try {
        const existingJob = await getJob(storedJobId)
        setCurrentJob(existingJob)
        setStoredJobId(existingJob.job_id)

        // Restore tab if requirements met
        if (storedTab === 'export' && existingJob.template && existingJob.placement) {
          setActiveTab('export')
        } else if (storedTab === 'editor' && existingJob.template) {
          setActiveTab('editor')
        } else {
          setActiveTab('upload')
          setStoredActiveTab('upload')
        }

      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 404) {
          // Job expired or not found on server -> safely clear and start fresh
          clearStoredJobId()
          try {
            const newJob = await createJob()
            setCurrentJob(newJob)
            setStoredJobId(newJob.job_id)
            setActiveTab('upload')
            setStoredActiveTab('upload')
          } catch (createErr: unknown) {
            if (createErr instanceof Error) {
              setGlobalError(`Failed to initialize session: ${createErr.message}`)
            }
          }
        } else {
          // Temporary error or connection issue -> do NOT clear stored job ID
          if (err instanceof Error) {
            setGlobalError(`Failed to restore session: ${err.message}`)
          }
        }
      } finally {
        setIsRestoringSession(false)
      }
    } else {
      // No stored job ID -> create a new job session
      try {
        const newJob = await createJob()
        setCurrentJob(newJob)
        setStoredJobId(newJob.job_id)
        setActiveTab('upload')
        setStoredActiveTab('upload')
      } catch (err: unknown) {
        if (err instanceof Error) {
          setGlobalError(`Failed to initialize session: ${err.message}`)
        }
      } finally {
        setIsRestoringSession(false)
      }
    }
  }, [])

  useEffect(() => {
    initApp()
  }, [initApp])

  const handleTabChange = async (tab: AppTab) => {
    setActiveTab(tab)
    setStoredActiveTab(tab)
    // When navigating to export, refresh job state to guarantee up-to-date analysis and placement
    if (tab === 'export' && currentJob) {
      try {
        const freshJob = await getJob(currentJob.job_id)
        setCurrentJob(freshJob)
      } catch {
        // If refresh fails, continue with currentJob
      }
    }
  }


  const handleNewProject = async () => {
    // Check if the current job has any uploaded files or configured settings
    const hasExistingData = !!(
      currentJob?.template ||
      (currentJob?.csv_summary && currentJob.csv_summary.total_rows > 0) ||
      currentJob?.placement
    )

    if (hasExistingData) {
      const confirmed = window.confirm(
        'Start a new certificate project?\n\nYour current certificate template, CSV data, and placement settings will be cleared from this workspace. Previous jobs remain saved on the server.'
      )
      if (!confirmed) {
        return
      }
    }

    setIsCreatingNewProject(true)
    setGlobalError(null)
    try {
      const newJob = await createJob()
      setCurrentJob(newJob)
      setStoredJobId(newJob.job_id)
      setActiveTab('upload')
      setStoredActiveTab('upload')
    } catch (err: unknown) {
      if (err instanceof Error) {
        setGlobalError(`Failed to create new project: ${err.message}`)
      } else {
        setGlobalError('Failed to create new project.')
      }
    } finally {
      setIsCreatingNewProject(false)
    }
  }

  const handleTemplateUpload = async (file: File) => {
    if (!currentJob) return
    setIsTemplateUploading(true)
    setGlobalError(null)
    try {
      const updatedJob = await uploadTemplate(currentJob.job_id, file)
      setCurrentJob(updatedJob)
      setStoredJobId(updatedJob.job_id)
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
      setStoredJobId(updatedJob.job_id)
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
      setStoredJobId(updatedJob.job_id)
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
      setStoredJobId(updatedJob.job_id)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setGlobalError(err.message)
      }
      throw err
    }
  }

  const handleSaveTypography = async (typography: TypographyConfig) => {
    if (!currentJob) return
    setGlobalError(null)
    try {
      const updatedJob = await saveTypography(currentJob.job_id, typography)
      setCurrentJob(updatedJob)
      setStoredJobId(updatedJob.job_id)
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

  // 1. Loading / Session restoration state (prevents flashing empty upload screen)
  if (isRestoringSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center select-none font-sans">
        <div className="h-12 w-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200 mb-4 animate-bounce">
          <Layers className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold text-slate-800 mb-1">
          Restoring Certificate Studio Session...
        </h2>
        <p className="text-xs text-slate-500 max-w-sm mb-4">
          Recovering your certificate template, participant data, and visual placement coordinates.
        </p>
        <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span>Synchronizing with local engine...</span>
        </div>
      </div>
    )
  }

  // 2. Offline / Server unreachable recovery screen (graceful resilience without erasing stored session)
  if (backendOffline && !currentJob) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 shadow-xs">
          <div className="h-12 w-12 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <ServerCrash className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">
            Backend Server Unreachable
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed mb-6">
            Unable to connect to the FastAPI backend at <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">http://localhost:8000</code>.
            Your local session and job ID are preserved safely.
          </p>
          <div className="space-y-3">
            <button
              type="button"
              onClick={initApp}
              disabled={healthLoading}
              className="w-full py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
              <span>Retry Connection</span>
            </button>
            <p className="text-[11px] text-slate-400">
              Ensure <code className="font-mono">uvicorn app.main:app</code> is running in your backend terminal.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fcfcfd] text-slate-900 font-sans antialiased flex flex-col selection:bg-slate-200">
      {/* Top Header */}
      <header className="border-b border-slate-200/80 bg-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md bg-slate-900 flex items-center justify-center text-white font-bold text-xs tracking-wider">
              CS
            </div>
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              Certificate Studio
            </span>
          </div>

          {/* Stepper Navigation: Minimal 3-step workflow */}
          <nav className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-lg text-xs" aria-label="Workflow Steps">
            <button
              type="button"
              onClick={() => handleTabChange('upload')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === 'upload'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>1. Upload</span>
              {hasTemplate && hasParticipants && (
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              )}
            </button>

            <button
              type="button"
              onClick={() => canOpenEditor && handleTabChange('editor')}
              disabled={!canOpenEditor}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === 'editor'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : canOpenEditor
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 cursor-not-allowed opacity-60'
              }`}
            >
              <span>2. Edit</span>
              {hasSavedPlacement && (
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              )}
            </button>

            <button
              type="button"
              onClick={() => canContinueToGeneration && handleTabChange('export')}
              disabled={!canContinueToGeneration}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === 'export'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : canContinueToGeneration
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 cursor-not-allowed opacity-60'
              }`}
            >
              <span>3. Export</span>
            </button>
          </nav>

          {/* Header Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleNewProject}
              disabled={isCreatingNewProject || backendOffline}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors disabled:opacity-50"
              title="Start a fresh project"
            >
              {isCreatingNewProject ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin text-slate-700" />
                  <span>Resetting...</span>
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3 text-slate-700" />
                  <span>New Project</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-6">
        <div>
          {/* Global Error Banner */}
          {globalError && (
            <div className="mb-6 p-3 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-800 text-xs flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{globalError}</span>
              </div>
              <button
                type="button"
                onClick={() => setGlobalError(null)}
                className="text-rose-500 hover:text-rose-800 font-medium text-xs px-1.5 py-0.5 rounded transition-colors"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          )}

          {activeTab === 'upload' ? (
            <div className="space-y-6">
              {/* Clean Upload Header & Primary Action */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                    Upload Certificate & Participants
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    PNG, JPG, or single-page PDF template, and participant CSV.
                  </p>
                </div>

                {canOpenEditor && (
                  <button
                    type="button"
                    onClick={() => handleTabChange('editor')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors shrink-0 shadow-2xs"
                  >
                    <span>Continue to Edit</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Upload Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

              {/* Reusable Saved Templates Gallery */}
              <SavedTemplates
                onSelectPreset={(newJob) => {
                  setCurrentJob(newJob)
                  setStoredJobId(newJob.job_id)
                  setGlobalError(null)
                }}
                disabled={isCreatingNewProject || backendOffline}
              />
            </div>
          ) : activeTab === 'editor' && currentJob?.template ? (
            <CertificateEditor
              jobId={currentJob.job_id}
              template={currentJob.template}
              savedPlacement={currentJob.placement}
              savedTypography={currentJob.typography}
              savedBatchAnalysis={currentJob.batch_analysis}
              participants={currentJob.participants_preview}
              onSavePlacement={handleSavePlacement}
              onSaveTypography={handleSaveTypography}
              onBatchAnalysisUpdated={(report, typography) => {
                setCurrentJob((prev) =>
                  prev
                    ? {
                        ...prev,
                        batch_analysis: report,
                        typography: typography || prev.typography,
                      }
                    : null
                )
              }}
              onBackToUpload={() => handleTabChange('upload')}
              onContinue={async () => {
                await handleTabChange('export')
              }}
              canContinue={canContinueToGeneration}
            />
          ) : activeTab === 'export' && currentJob ? (
            <ExportWorkspace
              job={currentJob}
              onBackToEditor={() => handleTabChange('editor')}
              onJobUpdated={(updated) => setCurrentJob(updated)}
            />
          ) : null}

        </div>
      </main>
    </div>
  )
}

export default App
