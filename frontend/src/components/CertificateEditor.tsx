import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Rect,
  Transformer,
  Text as KonvaText,
  Group,
} from 'react-konva'
import type Konva from 'konva'
import {
  Save,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Move,
  Maximize2,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Sliders,
  Bookmark,
  Eye,
  EyeOff,
} from 'lucide-react'
import type {
  TemplateMetadata,
  PlacementRegion,
  ParticipantRecord,
  TypographyConfig,
  FontInfo,
  BatchTypographyReport,
} from '../api/client'
import {
  getTemplatePreviewUrl,
  fetchFonts,
  fetchTextLayout,
  autoFitAllNames,
  savePresetFromJob,
} from '../api/client'
import {
  normalizedToCanvas,
  canvasToNormalized,
  clampNormalizedRect,
  type CanvasRect,
} from '../utils/coordinates'
import {
  getFontFamily,
  ensureFontLoaded,
  preloadAllFonts,
} from '../utils/fontLoader'

interface CertificateEditorProps {
  jobId: string
  template: TemplateMetadata
  savedPlacement: PlacementRegion | null
  savedTypography: TypographyConfig | null
  savedBatchAnalysis: BatchTypographyReport | null
  participants: ParticipantRecord[]
  onSavePlacement: (placement: PlacementRegion) => Promise<void>
  onSaveTypography: (config: TypographyConfig) => Promise<void>
  onBatchAnalysisUpdated?: (report: BatchTypographyReport, typography?: TypographyConfig) => void
  onBackToUpload: () => void
  onContinue: () => void
  canContinue: boolean
}

export const CertificateEditor: React.FC<CertificateEditorProps> = ({
  jobId,
  template,
  savedPlacement,
  savedTypography,
  savedBatchAnalysis,
  participants,
  onSavePlacement,
  onSaveTypography,
  onBatchAnalysisUpdated,
  onBackToUpload,
  onContinue,
  canContinue,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const rectRef = useRef<Konva.Rect>(null)
  const trRef = useRef<Konva.Transformer>(null)

  // 1. Certificate image element for Konva canvas (retained across participant/font changes)
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null)
  const [imageLoaded, setImageLoaded] = useState<boolean>(false)

  // 2. Stable Stage dimensions: computed only on actual window resize or initial mount
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>(() => {
    const initialWidth = Math.min(840, typeof window !== 'undefined' ? window.innerWidth - 400 : 800)
    const aspectRatio = template.aspect_ratio || 1.414
    return {
      width: Math.round(initialWidth),
      height: Math.round(initialWidth / aspectRatio),
    }
  })

  // 3. Placement region in normalized coordinates
  const [currentPlacement, setCurrentPlacement] = useState<PlacementRegion>(
    savedPlacement || { x: 0.2, y: 0.45, width: 0.6, height: 0.12 }
  )
  const [hasUnsavedPlacement, setHasUnsavedPlacement] = useState<boolean>(!savedPlacement)

  // 4. Typography configuration
  const [availableFonts, setAvailableFonts] = useState<FontInfo[]>([])
  const [typography, setTypography] = useState<TypographyConfig>(
    savedTypography || {
      font_id: 'great_vibes',
      preferred_font_size: 52,
      min_font_size: 18,
      text_color: '#111827',
      alignment: 'center',
      vertical_clearance_percent: 0.08,
      horizontal_clearance_percent: 0.04,
    }
  )
  const [hasUnsavedTypography, setHasUnsavedTypography] = useState<boolean>(false)

  // Font loading lifecycle & Konva invalidation
  const [fontLoadingState, setFontLoadingState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [fontRenderVersion, setFontRenderVersion] = useState<number>(0)

  // 5. Participants selection: default to first valid participant from CSV if available
  const validParticipants = useMemo(
    () => participants.filter((p) => p.is_valid && p.name.trim()),
    [participants]
  )

  const firstValidName = validParticipants[0]?.name || 'Jane Doe'
  const [selectedSample, setSelectedSample] = useState<string>(firstValidName)

  // 6. Authoritative backend fitted layout metadata (font size, fit status, warnings)
  const [backendFittedSize, setBackendFittedSize] = useState<number | null>(null)
  const [textFits, setTextFits] = useState<boolean>(true)
  const [layoutWarnings, setLayoutWarnings] = useState<string[]>([])
  const [isCalculatingLayout, setIsCalculatingLayout] = useState<boolean>(false)
  const [layoutError, setLayoutError] = useState<string | null>(null)
  const layoutRequestIdRef = useRef<number>(0)
  const activeAbortControllerRef = useRef<AbortController | null>(null)

  // 7. Perfect Fit primary action state
  const [isPerfectFitting, setIsPerfectFitting] = useState<boolean>(false)
  const [perfectFitSummary, setPerfectFitSummary] = useState<string | null>(null)

  // 8. Batch analysis state
  const [batchReport, setBatchReport] = useState<BatchTypographyReport | null>(savedBatchAnalysis)

  // 9. Advanced Settings Accordion (closed by default)
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false)

  // 10. Saving and status states
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false)

  // 11. Saved Preset Modal State
  const [showSavePresetModal, setShowSavePresetModal] = useState<boolean>(false)
  const [presetNameInput, setPresetNameInput] = useState<string>('')
  const [isSavingPreset, setIsSavingPreset] = useState<boolean>(false)
  const [presetSuccessMessage, setPresetSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // 12. Preview mode toggle (temporarily hides bounding rectangle and handles)
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false)

  // Debounced layout timer
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Preload all fonts on mount
  useEffect(() => {
    preloadAllFonts()
  }, [])

  // Programmatically load the selected font and invalidate Konva cache on success
  useEffect(() => {
    let active = true
    setFontLoadingState('loading')

    ensureFontLoaded(typography.font_id)
      .then((loaded) => {
        if (!active) return
        if (loaded) {
          setFontLoadingState('ready')
          setFontRenderVersion((v) => v + 1)
          rectRef.current?.getLayer()?.batchDraw()
        } else {
          setFontLoadingState('error')
        }
      })
      .catch(() => {
        if (!active) return
        setFontLoadingState('error')
      })

    return () => {
      active = false
    }
  }, [typography.font_id])

  // Load available fonts from backend
  useEffect(() => {
    fetchFonts()
      .then(setAvailableFonts)
      .catch(() => {
        setAvailableFonts([
          { id: 'great_vibes', name: 'Great Vibes', category: 'Calligraphic', filename: 'GreatVibes-Regular.ttf', sample_text: 'Jane Doe' },
          { id: 'allura', name: 'Allura', category: 'Formal Script', filename: 'Allura-Regular.ttf', sample_text: 'Jane Doe' },
          { id: 'alex_brush', name: 'Alex Brush', category: 'Classic Script', filename: 'AlexBrush-Regular.ttf', sample_text: 'Jane Doe' },
          { id: 'cinzel', name: 'Cinzel', category: 'Classic Serif', filename: 'Cinzel-Regular.ttf', sample_text: 'Jane Doe' },
          { id: 'eb_garamond', name: 'EB Garamond', category: 'Readable Serif', filename: 'EBGaramond-Regular.ttf', sample_text: 'Jane Doe' },
        ])
      })
  }, [])

  // Load template preview image once (preserves instance across name / typography switches)
  useEffect(() => {
    const img = new window.Image()
    img.src = getTemplatePreviewUrl(template.preview_url)
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      setImageObj(img)
      setImageLoaded(true)
    }
    img.onerror = () => {
      setErrorMessage('Failed to load certificate template preview.')
    }
  }, [template.preview_url])

  // Responsive stage dimensions preserving aspect ratio with stable boundaries
  const updateDimensions = useCallback(() => {
    if (!containerRef.current) return
    const containerWidth = containerRef.current.clientWidth - 24
    if (containerWidth <= 100) return

    const aspectRatio = template.aspect_ratio || 1.414
    const targetHeight = containerWidth / aspectRatio
    const maxHeight = Math.min(window.innerHeight * 0.7, 720)

    let finalWidth = containerWidth
    let finalHeight = targetHeight

    if (finalHeight > maxHeight) {
      finalHeight = maxHeight
      finalWidth = finalHeight * aspectRatio
    }

    const roundedW = Math.round(finalWidth)
    const roundedH = Math.round(finalHeight)

    setStageSize((prev) => {
      if (Math.abs(prev.width - roundedW) < 2 && Math.abs(prev.height - roundedH) < 2) {
        return prev
      }
      return { width: roundedW, height: roundedH }
    })
  }, [template.aspect_ratio])

  useEffect(() => {
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [updateDimensions])

  // Attach Transformer to the single name placement rectangle
  useEffect(() => {
    if (trRef.current && rectRef.current) {
      trRef.current.nodes([rectRef.current])
      trRef.current.getLayer()?.batchDraw()
    }
  }, [currentPlacement, stageSize])

  // Resilient debounced layout calculation using in-memory parameters and AbortController
  const requestAuthoritativeLayout = useCallback(() => {
    const currentReqId = ++layoutRequestIdRef.current
    setIsCalculatingLayout(true)
    setLayoutError(null)

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(async () => {
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort()
      }

      const controller = new AbortController()
      activeAbortControllerRef.current = controller

      const timeoutId = setTimeout(() => {
        controller.abort()
      }, 5000)

      try {
        const layout = await fetchTextLayout(jobId, {
          sampleText: selectedSample,
          placement: currentPlacement,
          typography: typography,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (currentReqId === layoutRequestIdRef.current) {
          setBackendFittedSize(layout.font_size)
          setTextFits(layout.fits)
          setLayoutWarnings(layout.warnings || [])
          setLayoutError(null)
        }
      } catch (err: unknown) {
        clearTimeout(timeoutId)
        if (err instanceof Error && err.name === 'AbortError') {
          if (currentReqId === layoutRequestIdRef.current) {
            setLayoutError('Layout calculation timed out. Click to retry.')
          }
        } else if (currentReqId === layoutRequestIdRef.current) {
          setLayoutError('Failed to calculate layout.')
        }
      } finally {
        if (currentReqId === layoutRequestIdRef.current) {
          setIsCalculatingLayout(false)
        }
      }
    }, 200)
  }, [jobId, currentPlacement, typography, selectedSample])

  // Trigger debounced layout when typography, participant, or placement changes
  useEffect(() => {
    requestAuthoritativeLayout()
  }, [requestAuthoritativeLayout])

  // Warn user before leaving page with unsaved changes
  const hasUnsavedChanges = hasUnsavedPlacement || hasUnsavedTypography
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  // Derived canvas pixel rect for Konva
  const canvasRect: CanvasRect = useMemo(
    () => normalizedToCanvas(currentPlacement, stageSize.width, stageSize.height),
    [currentPlacement, stageSize]
  )

  // Handle rect drag
  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target
    const newX = Math.max(0, Math.min(stageSize.width - canvasRect.width, node.x()))
    const newY = Math.max(0, Math.min(stageSize.height - canvasRect.height, node.y()))

    node.position({ x: newX, y: newY })

    const norm = canvasToNormalized(
      {
        x: newX,
        y: newY,
        width: canvasRect.width,
        height: canvasRect.height,
      },
      stageSize.width,
      stageSize.height
    )

    setCurrentPlacement(norm)
    setHasUnsavedPlacement(true)
    setSaveSuccess(false)
  }

  // Handle rect transform (resize)
  const handleTransformEnd = () => {
    const node = rectRef.current
    if (!node) return

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    node.scaleX(1)
    node.scaleY(1)

    const rawWidth = Math.max(20, node.width() * scaleX)
    const rawHeight = Math.max(15, node.height() * scaleY)
    const rawX = Math.max(0, Math.min(stageSize.width - rawWidth, node.x()))
    const rawY = Math.max(0, Math.min(stageSize.height - rawHeight, node.y()))

    const norm = canvasToNormalized(
      {
        x: rawX,
        y: rawY,
        width: rawWidth,
        height: rawHeight,
      },
      stageSize.width,
      stageSize.height
    )

    setCurrentPlacement(norm)
    setHasUnsavedPlacement(true)
    setSaveSuccess(false)
  }

  // Keyboard adjustment controls (nudge)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.02 : 0.005
    let { x, y, width, height } = currentPlacement

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      x -= step
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      x += step
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      y -= step
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      y += step
    } else {
      return
    }

    const clamped = clampNormalizedRect({ x, y, width, height })
    setCurrentPlacement(clamped)
    setHasUnsavedPlacement(true)
    setSaveSuccess(false)
  }

  // Explicit Save Action
  const handleSaveAll = async () => {
    setIsSaving(true)
    setErrorMessage(null)
    try {
      await onSavePlacement(currentPlacement)
      await onSaveTypography(typography)
      setHasUnsavedPlacement(false)
      setHasUnsavedTypography(false)
      setSaveSuccess(true)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage('Failed to save settings.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  // Save Configured Template Preset
  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = presetNameInput.trim()
    if (!trimmed) return

    setIsSavingPreset(true)
    setErrorMessage(null)
    setPresetSuccessMessage(null)

    try {
      // 1. Ensure latest placement & typography are persisted to job first
      await onSavePlacement(currentPlacement)
      await onSaveTypography(typography)
      setHasUnsavedPlacement(false)
      setHasUnsavedTypography(false)

      // 2. Save preset
      const savedPreset = await savePresetFromJob(jobId, trimmed)
      setPresetSuccessMessage(`Template saved as "${savedPreset.name}"!`)
      setShowSavePresetModal(false)
      setPresetNameInput('')
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(`Failed to save template preset: ${err.message}`)
      } else {
        setErrorMessage('Failed to save template preset.')
      }
    } finally {
      setIsSavingPreset(false)
    }
  }

  // Single Primary Action: "Perfect Fit"
  const handlePerfectFit = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsPerfectFitting(true)
    }
    setErrorMessage(null)

    try {
      // 1. Ensure active placement is saved to backend
      await onSavePlacement(currentPlacement)
      setHasUnsavedPlacement(false)

      // 2. Call backend auto-fit
      const result = await autoFitAllNames(jobId)

      // 3. Apply optimized typography & report
      setTypography(result.typography)
      setBatchReport(result.batch_analysis)
      setHasUnsavedTypography(false)
      setSaveSuccess(true)
      onBatchAnalysisUpdated?.(result.batch_analysis, result.typography)

      // 4. Concise human summary reflecting batch consistency
      const total = result.batch_analysis.total_analyzed
      const consistent = result.batch_analysis.consistent_count ?? (total - result.batch_analysis.reduction_count - result.batch_analysis.overflow_count)
      const adjusted = result.batch_analysis.adjusted_count ?? result.batch_analysis.reduction_count

      if (result.batch_analysis.all_fit) {
        if (adjusted > 0) {
          setPerfectFitSummary(
            `${total} names optimized. ${consistent} use the same size, ${adjusted} adjusted.`
          )
        } else {
          setPerfectFitSummary(
            `All ${total} names optimized to ${result.optimal_size}px.`
          )
        }
      } else {
        const overflow = result.batch_analysis.overflow_count
        setPerfectFitSummary(
          `${overflow} name${overflow > 1 ? 's' : ''} need more space. Widen the name area slightly.`
        )
      }
    } catch (err: unknown) {
      if (!options?.silent) {
        if (err instanceof Error) {
          setErrorMessage(err.message)
        } else {
          setErrorMessage('Failed to optimize typography.')
        }
      }
    } finally {
      if (!options?.silent) {
        setIsPerfectFitting(false)
      }
    }
  }, [jobId, currentPlacement, onSavePlacement, onBatchAnalysisUpdated])

  // Automatic Initial Fitting: run once on initial mount if not previously analyzed
  const initialFitTriggeredRef = useRef<boolean>(false)
  useEffect(() => {
    if (initialFitTriggeredRef.current) return
    if (!savedBatchAnalysis && validParticipants.length > 0) {
      initialFitTriggeredRef.current = true
      handlePerfectFit({ silent: true })
    }
  }, [savedBatchAnalysis, validParticipants.length, handlePerfectFit])

  // Scale factor from template original coordinate space to browser canvas pixels
  const scaleFactor = stageSize.height / (template.height || stageSize.height)

  // Use authoritative backend fitted font size if available, scaled to display canvas; otherwise approximate
  const effectiveFontSizeTemplate = backendFittedSize ?? typography.preferred_font_size
  const displayFontSize = Math.max(10, Math.round(effectiveFontSizeTemplate * scaleFactor))
  const displayFontFamily = getFontFamily(typography.font_id)

  // Quick preset samples for convenient preview
  const shortestName = batchReport?.shortest_name || 'Ava'
  const longestName = batchReport?.longest_name_by_chars || 'Dr. Alexander Montgomery-Cunningham III'

  // Internal safe margins calculation for canvas text positioning
  const vertClearance = typography.vertical_clearance_percent ?? 0.08
  const horizClearance = typography.horizontal_clearance_percent ?? 0.04
  const safePadX = canvasRect.width * horizClearance
  const safePadY = canvasRect.height * vertClearance
  const safeCanvasWidth = Math.max(10, canvasRect.width - 2 * safePadX)
  const safeCanvasHeight = Math.max(10, canvasRect.height - 2 * safePadY)

  return (
    <div className="space-y-6">
      {/* Top Header & Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToUpload}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Upload</span>
          </button>
          <span className="text-slate-300">|</span>
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">
            Certificate Name Placement
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Preview Toggle: Shows clean certificate without editing guides */}
          <button
            type="button"
            onClick={() => setIsPreviewMode(!isPreviewMode)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
              isPreviewMode
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            title={isPreviewMode ? 'Return to editing mode' : 'Preview certificate without rectangle'}
          >
            {isPreviewMode ? (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                <span>Exit Preview</span>
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5 text-slate-500" />
                <span>Preview</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowSavePresetModal(true)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors flex items-center gap-1.5"
            title="Save template, placement & font as a reusable template"
          >
            <Bookmark className="h-3.5 w-3.5 text-slate-500" />
            <span>Save Template</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {saveSuccess ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 text-slate-500" />
                <span>{isSaving ? 'Saving...' : 'Save'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
              canContinue
                ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
            }`}
          >
            <span>Continue to Export</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Primary Perfect Fit Result Banner */}
      {perfectFitSummary && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 animate-fadeIn ${
            batchReport?.all_fit
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              : 'bg-amber-50/80 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {batchReport?.all_fit ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            )}
            <span className="font-semibold">{perfectFitSummary}</span>
          </div>
          <button
            type="button"
            onClick={() => setPerfectFitSummary(null)}
            className="text-slate-400 hover:text-slate-700 text-xs px-1"
          >
            ✕
          </button>
        </div>
      )}

      {presetSuccessMessage && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="font-semibold">{presetSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setPresetSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-800 text-xs px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Save Preset Dialog Modal */}
      {showSavePresetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                <Bookmark className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Save Template Preset
                </h3>
                <p className="text-[11px] text-slate-500">
                  Save this template, placement, and font to reuse with future participant batches.
                </p>
              </div>
            </div>

            <form onSubmit={handleSavePreset} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Preset Name
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="e.g. Annual Honors Certificate"
                  value={presetNameInput}
                  onChange={(e) => setPresetNameInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  maxLength={100}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowSavePresetModal(false)
                    setPresetNameInput('')
                  }}
                  disabled={isSavingPreset}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPreset || !presetNameInput.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingPreset ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <span>Save Preset</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Editor Grid: Left 3 cols (Stationary Viewport) | Right 1 col (Simplified Controls) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Stable Certificate Viewport */}
        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="lg:col-span-3 rounded-xl border border-slate-200 bg-slate-900/5 p-4 flex flex-col items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 select-none"
        >
          {/* Top Status Bar: Static height to eliminate vertical jumping */}
          <div className="w-full h-8 flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <Move className="h-3.5 w-3.5 text-indigo-600" />
                <span>Recipient Name Placement Area</span>
              </span>

              {fontLoadingState === 'loading' ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 font-medium">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>Loading font...</span>
                </span>
              ) : fontLoadingState === 'error' ? (
                <button
                  type="button"
                  onClick={() => ensureFontLoaded(typography.font_id)}
                  className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-800 font-medium bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200"
                >
                  <AlertCircle className="h-3 w-3 text-rose-600" />
                  <span>Font unavailable. Click to retry</span>
                </button>
              ) : isCalculatingLayout ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 font-medium">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>Fitting text...</span>
                </span>
              ) : layoutError ? (
                <button
                  type="button"
                  onClick={requestAuthoritativeLayout}
                  className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-800 font-medium bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200"
                >
                  <AlertCircle className="h-3 w-3 text-rose-600" />
                  <span>{layoutError}</span>
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              {textFits ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  <span>Fits cleanly</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700 font-semibold bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                  <AlertTriangle className="h-3 w-3 text-amber-600" />
                  <span>Needs more space</span>
                </span>
              )}
            </div>
          </div>

          {/* Fixed-Aspect-Ratio Canvas Box (Completely stationary) */}
          <div
            className="relative shadow-md rounded-lg overflow-hidden bg-white border border-slate-300 shrink-0"
            style={{ width: stageSize.width, height: stageSize.height }}
          >
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-400 text-xs font-medium z-10">
                <RefreshCw className="h-4 w-4 animate-spin mr-2 text-indigo-600" />
                Loading certificate canvas...
              </div>
            )}

            <Stage
              width={stageSize.width}
              height={stageSize.height}
            >
              <Layer>
                {/* 1. Base Certificate Image (Stationary) */}
                {imageObj && (
                  <KonvaImage
                    image={imageObj}
                    width={stageSize.width}
                    height={stageSize.height}
                    name="background-image"
                    listening={false}
                  />
                )}

                {/* 2. Recipient Name Bounding Box & Live Text (EXACTLY ONE RECTANGLE) */}
                <Group>
                  {!isPreviewMode && (
                    <Rect
                      ref={rectRef}
                      x={canvasRect.x}
                      y={canvasRect.y}
                      width={canvasRect.width}
                      height={canvasRect.height}
                      fill="rgba(59, 130, 246, 0.05)"
                      stroke="#2563eb"
                      strokeWidth={1.5}
                      dash={[6, 4]}
                      draggable={true}
                      dragBoundFunc={(pos) => ({
                        x: Math.max(0, Math.min(stageSize.width - canvasRect.width, pos.x)),
                        y: Math.max(0, Math.min(stageSize.height - canvasRect.height, pos.y)),
                      })}
                      onDragEnd={handleDragEnd}
                      onTransformEnd={handleTransformEnd}
                    />
                  )}

                  {/* 3. Live Personalized Name with loaded font & live auto-fit sizing */}
                  <KonvaText
                    key={`${typography.font_id}-${fontRenderVersion}`}
                    x={canvasRect.x + safePadX}
                    y={canvasRect.y + safePadY}
                    width={safeCanvasWidth}
                    height={safeCanvasHeight}
                    text={selectedSample}
                    fontSize={displayFontSize}
                    fontFamily={displayFontFamily}
                    fill={typography.text_color}
                    align={typography.alignment}
                    verticalAlign="middle"
                    listening={false}
                  />

                  {/* 4. Konva Transformer with visible resize handles */}
                  {!isPreviewMode && (
                    <Transformer
                      ref={trRef}
                      rotateEnabled={false}
                      keepRatio={false}
                      enabledAnchors={[
                        'top-left',
                        'top-right',
                        'bottom-left',
                        'bottom-right',
                        'middle-left',
                        'middle-right',
                      ]}
                      boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 25 || newBox.height < 15) return oldBox
                        if (
                          newBox.x < 0 ||
                          newBox.y < 0 ||
                          newBox.x + newBox.width > stageSize.width ||
                          newBox.y + newBox.height > stageSize.height
                        ) {
                          return oldBox
                        }
                        return newBox
                      }}
                    />
                  )}
                </Group>
              </Layer>
            </Stage>
          </div>

          {/* Bottom Interaction Guide */}
          <div className="mt-3 h-5 text-[11px] text-slate-500 flex items-center justify-center gap-4">
            <span className="flex items-center gap-1">
              <Move className="h-3 w-3 text-indigo-500" /> Drag box to position
            </span>
            <span className="flex items-center gap-1">
              <Maximize2 className="h-3 w-3 text-indigo-500" /> Drag handles to resize
            </span>
            <span>⌨️ Arrow keys nudge</span>
          </div>

          {layoutWarnings.length > 0 && (
            <div className="mt-2 w-full p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>{layoutWarnings[0]}</span>
            </div>
          )}
        </div>

        {/* Right Column: Clean, Intuitive Controls Sidebar */}
        <div className="space-y-4">
          {/* Section 1: Name Fitting Action */}
          <div className="p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900">
                Fit All Names
              </span>
              {batchReport && (
                <span className={`text-[11px] font-medium flex items-center gap-1 ${
                  batchReport.all_fit ? 'text-emerald-700' : 'text-amber-700'
                }`}>
                  {batchReport.all_fit ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span>All {batchReport.total_analyzed} fit</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      <span>{batchReport.overflow_count} need space</span>
                    </>
                  )}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => handlePerfectFit()}
              disabled={isPerfectFitting || isSaving}
              className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-2xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isPerfectFitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Fitting names...</span>
                </>
              ) : (
                <span>Perfect Fit All Names</span>
              )}
            </button>
          </div>

          {/* Section 2: Participant Preview Selector */}
          <div className="p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-xs font-semibold text-slate-900">
                Preview Recipient
              </h3>
              <span className="text-[11px] text-slate-400">
                {validParticipants.length} total
              </span>
            </div>

            {/* Quick Presets: Short, Long */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelectedSample(shortestName)}
                className={`p-2 rounded-lg border text-left transition-colors ${
                  selectedSample === shortestName
                    ? 'border-slate-800 bg-slate-50 text-slate-900 font-medium'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <span className="text-[10px] text-slate-400 block">Short Name</span>
                <span className="truncate block">{shortestName}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedSample(longestName)}
                className={`p-2 rounded-lg border text-left transition-colors ${
                  selectedSample === longestName
                    ? 'border-slate-800 bg-slate-50 text-slate-900 font-medium'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <span className="text-[10px] text-slate-400 block">Long Name</span>
                <span className="truncate block">{longestName}</span>
              </button>
            </div>

            {/* Full CSV Participant Dropdown */}
            {validParticipants.length > 0 && (
              <div>
                <select
                  value={selectedSample}
                  onChange={(e) => setSelectedSample(e.target.value)}
                  className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-md py-1.5 px-2 text-xs text-slate-800 shadow-2xs focus:outline-none focus:ring-1 focus:ring-slate-800"
                >
                  {validParticipants.slice(0, 50).map((p) => (
                    <option key={p.row_number} value={p.name}>
                      #{p.row_number}: {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Section 3: Typography & Styling Card */}
          <div className="p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-xs font-semibold text-slate-900">
                Text Style
              </h3>
              {fontLoadingState === 'loading' && (
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                  <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Loading font
                </span>
              )}
            </div>

            {/* Font Family Selector */}
            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">
                Font Family
              </label>
              <select
                value={typography.font_id}
                onChange={(e) => {
                  setTypography({ ...typography, font_id: e.target.value })
                  setHasUnsavedTypography(true)
                  setSaveSuccess(false)
                }}
                className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-md py-1.5 px-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 shadow-2xs"
              >
                {availableFonts.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.category})
                  </option>
                ))}
              </select>
            </div>

            {/* Font Color & Alignment */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">
                  Color
                </label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-md p-1 bg-white">
                  <input
                    type="color"
                    value={typography.text_color}
                    onChange={(e) => {
                      setTypography({ ...typography, text_color: e.target.value })
                      setHasUnsavedTypography(true)
                      setSaveSuccess(false)
                    }}
                    className="h-5 w-7 rounded border-none cursor-pointer p-0 bg-transparent"
                  />
                  <span className="text-[10px] font-mono text-slate-700 uppercase">
                    {typography.text_color}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">
                  Align
                </label>
                <select
                  value={typography.alignment}
                  onChange={(e) => {
                    setTypography({
                      ...typography,
                      alignment: e.target.value as 'center' | 'left' | 'right',
                    })
                    setHasUnsavedTypography(true)
                    setSaveSuccess(false)
                  }}
                  className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-md py-1.5 px-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 shadow-2xs"
                >
                  <option value="center">Center</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 4: Collapsed Advanced Settings (Closed by default) */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full p-3.5 flex items-center justify-between text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-1.5 text-slate-600">
                <Sliders className="h-3.5 w-3.5 text-slate-500" />
                <span>Advanced Settings</span>
              </div>
              {showAdvanced ? (
                <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              )}
            </button>

            {showAdvanced && (
              <div className="p-4 pt-1 border-t border-slate-100 space-y-4 text-xs">
                <div>
                  <label className="font-medium text-slate-700 block mb-1">
                    Batch Sizing Mode
                  </label>
                  <select
                    value={typography.sizing_mode || 'smart_consistent'}
                    onChange={(e) => {
                      setTypography({
                        ...typography,
                        sizing_mode: e.target.value as 'smart_consistent' | 'individual_max',
                      })
                      setHasUnsavedTypography(true)
                      setSaveSuccess(false)
                    }}
                    className="w-full bg-white border border-slate-300 rounded-md py-1.5 px-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs"
                  >
                    <option value="smart_consistent">Smart / Consistent (Recommended)</option>
                    <option value="individual_max">Individually Maximized</option>
                  </select>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Consistent mode shares the target font size across all standard names.
                  </span>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-slate-700">Target Font Size</span>
                    <span className="font-mono text-slate-600">{typography.preferred_font_size}px</span>
                  </div>
                  <input
                    type="range"
                    min="24"
                    max="120"
                    step="2"
                    value={typography.preferred_font_size}
                    onChange={(e) => {
                      setTypography({
                        ...typography,
                        preferred_font_size: Number(e.target.value),
                      })
                      setHasUnsavedTypography(true)
                      setSaveSuccess(false)
                    }}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-slate-700">Minimum Readable Size</span>
                    <span className="font-mono text-slate-600">{typography.min_font_size}px</span>
                  </div>
                  <input
                    type="range"
                    min="12"
                    max="40"
                    step="2"
                    value={typography.min_font_size}
                    onChange={(e) => {
                      setTypography({
                        ...typography,
                        min_font_size: Number(e.target.value),
                      })
                      setHasUnsavedTypography(true)
                      setSaveSuccess(false)
                    }}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-slate-700">Safe Clearance Margin</span>
                    <span className="font-mono text-slate-600">
                      {Math.round((typography.vertical_clearance_percent ?? 0.08) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="25"
                    step="1"
                    value={Math.round((typography.vertical_clearance_percent ?? 0.08) * 100)}
                    onChange={(e) => {
                      setTypography({
                        ...typography,
                        vertical_clearance_percent: Number(e.target.value) / 100.0,
                      })
                      setHasUnsavedTypography(true)
                      setSaveSuccess(false)
                    }}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Internal margin protecting certificate lines from descenders.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
