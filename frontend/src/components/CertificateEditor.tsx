import React, { useState, useEffect, useRef, useCallback } from 'react'
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
  RotateCcw,
  Save,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  UserCheck,
  Move,
  Maximize2,
  Type,
  Eye,
  BarChart3,
  RefreshCw,
  AlertTriangle,
  Eraser,
  Sparkles,
} from 'lucide-react'
import type {
  TemplateMetadata,
  PlacementRegion,
  ParticipantRecord,
  TypographyConfig,
  FontInfo,
  BatchTypographyReport,
  CleanupConfig,
  CleanupMode,
} from '../api/client'
import {
  getTemplatePreviewUrl,
  getRenderedPreviewUrl,
  getCleanedPreviewUrl,
  fetchFonts,
  analyzeTypography,
} from '../api/client'
import {
  normalizedToCanvas,
  canvasToNormalized,
  clampNormalizedRect,
  type CanvasRect,
} from '../utils/coordinates'

// Map font IDs to exact loaded @font-face family names
const FONT_ID_TO_FAMILY: Record<string, string> = {
  great_vibes: 'Great Vibes',
  allura: 'Allura',
  alex_brush: 'Alex Brush',
  cinzel: 'Cinzel',
  eb_garamond: 'EB Garamond',
}

export type CanvasViewMode = 'personalized' | 'cleaned' | 'original'
export type ActiveBoxType = 'placement' | 'cleanup'

interface CertificateEditorProps {
  jobId: string
  template: TemplateMetadata
  savedPlacement: PlacementRegion | null
  savedCleanup: CleanupConfig | null
  savedTypography: TypographyConfig | null
  savedBatchAnalysis: BatchTypographyReport | null
  participants: ParticipantRecord[]
  onSavePlacement: (placement: PlacementRegion) => Promise<void>
  onSaveCleanup: (cleanup: CleanupConfig) => Promise<void>
  onSaveTypography: (config: TypographyConfig) => Promise<void>
  onBackToUpload: () => void
  onContinue: () => void
  canContinue: boolean
}

export const CertificateEditor: React.FC<CertificateEditorProps> = ({
  jobId,
  template,
  savedPlacement,
  savedCleanup,
  savedTypography,
  savedBatchAnalysis,
  participants,
  onSavePlacement,
  onSaveCleanup,
  onSaveTypography,
  onBackToUpload,
  onContinue,
  canContinue,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const placementRectRef = useRef<Konva.Rect>(null)
  const cleanupRectRef = useRef<Konva.Rect>(null)
  const trRef = useRef<Konva.Transformer>(null)

  // Canvas background images for Konva
  const [originalImageObj, setOriginalImageObj] = useState<HTMLImageElement | null>(null)
  const [cleanedImageObj, setCleanedImageObj] = useState<HTMLImageElement | null>(null)
  const [authoritativeImageObj, setAuthoritativeImageObj] = useState<HTMLImageElement | null>(null)
  const [imageLoaded, setImageLoaded] = useState<boolean>(false)

  // Stage display size preserving template aspect ratio
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  })

  // View toggle: Personalized | Cleaned | Original
  const [viewMode, setViewMode] = useState<CanvasViewMode>('personalized')
  // Active selected box for Konva transformer: 'placement' | 'cleanup'
  const [activeBox, setActiveBox] = useState<ActiveBoxType>('placement')

  // Placement region (recipient name placement)
  const [currentPlacement, setCurrentPlacement] = useState<PlacementRegion | null>(
    savedPlacement || { x: 0.2, y: 0.45, width: 0.6, height: 0.12 }
  )
  const [hasUnsavedPlacement, setHasUnsavedPlacement] = useState<boolean>(!savedPlacement)

  // Cleanup region and mode
  const [cleanupConfig, setCleanupConfig] = useState<CleanupConfig>(
    savedCleanup || {
      mode: 'solid',
      region: savedPlacement || { x: 0.2, y: 0.45, width: 0.6, height: 0.12 },
      sample_border_color: true,
      custom_color: '#ffffff',
      inpaint_radius: 3,
    }
  )
  const [hasUnsavedCleanup, setHasUnsavedCleanup] = useState<boolean>(false)

  // Typography state
  const [availableFonts, setAvailableFonts] = useState<FontInfo[]>([])
  const [typography, setTypography] = useState<TypographyConfig>(
    savedTypography || {
      font_id: 'great_vibes',
      preferred_font_size: 52,
      min_font_size: 18,
      text_color: '#111827',
      alignment: 'center',
    }
  )
  const [hasUnsavedTypography, setHasUnsavedTypography] = useState<boolean>(false)

  // Sample name previews
  const shortSample = 'Jane Doe'
  const longSample = 'Dr. Alexander Montgomery-Cunningham III'
  const firstCsvParticipant = participants.find((p) => p.is_valid && p.name)?.name || null
  const [selectedSample, setSelectedSample] = useState<string>(firstCsvParticipant || shortSample)

  // Debounced backend sync version counter & pending indicator
  const [backendSyncVersion, setBackendSyncVersion] = useState<number>(1)
  const [isBackendSyncing, setIsBackendSyncing] = useState<boolean>(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Batch analysis state
  const [batchReport, setBatchReport] = useState<BatchTypographyReport | null>(savedBatchAnalysis)
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false)

  // Saving states
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Drawing state when user drags to draw either box
  const [isDrawing, setIsDrawing] = useState<boolean>(false)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)

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

  // 1. Load original preview image
  useEffect(() => {
    setImageLoaded(false)
    const img = new window.Image()
    img.src = getTemplatePreviewUrl(template.preview_url)
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      setOriginalImageObj(img)
      setImageLoaded(true)
    }
    img.onerror = () => {
      setErrorMessage('Failed to load original template image.')
    }
  }, [template.preview_url])

  // 2. Fetch authoritative rendered image & cleaned image when backendSyncVersion changes
  useEffect(() => {
    setIsBackendSyncing(true)
    let isCancelled = false

    // Load cleaned template image
    const cleanedImg = new window.Image()
    cleanedImg.src = getCleanedPreviewUrl(jobId, backendSyncVersion)
    cleanedImg.crossOrigin = 'Anonymous'
    cleanedImg.onload = () => {
      if (!isCancelled) setCleanedImageObj(cleanedImg)
    }

    // Load authoritative personalized rendered image
    const authImg = new window.Image()
    authImg.src = getRenderedPreviewUrl(jobId, {
      sampleText: selectedSample,
      v: backendSyncVersion,
    })
    authImg.crossOrigin = 'Anonymous'
    authImg.onload = () => {
      if (!isCancelled) {
        setAuthoritativeImageObj(authImg)
        setIsBackendSyncing(false)
      }
    }
    authImg.onerror = () => {
      if (!isCancelled) {
        setIsBackendSyncing(false)
      }
    }

    return () => {
      isCancelled = true
    }
  }, [jobId, backendSyncVersion, selectedSample])

  // Debounced auto-save & sync trigger (250ms)
  const triggerDebouncedSync = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(async () => {
      try {
        if (currentPlacement) {
          await onSavePlacement(currentPlacement)
        }
        await onSaveCleanup(cleanupConfig)
        await onSaveTypography(typography)
        setBackendSyncVersion((v) => v + 1)
      } catch {
        // Silently ignore background sync errors; user can still click Save manually
      }
    }, 250)
  }, [currentPlacement, cleanupConfig, typography, onSavePlacement, onSaveCleanup, onSaveTypography])

  // 3. Responsive stage dimensions calculation
  const updateDimensions = useCallback(() => {
    if (!containerRef.current) return
    const containerWidth = containerRef.current.clientWidth - 32
    if (containerWidth <= 0) return

    const aspectRatio = template.aspect_ratio || 1.414
    const targetHeight = containerWidth / aspectRatio
    const maxHeight = Math.min(window.innerHeight * 0.65, 680)

    let finalWidth = containerWidth
    let finalHeight = targetHeight

    if (finalHeight > maxHeight) {
      finalHeight = maxHeight
      finalWidth = finalHeight * aspectRatio
    }

    setStageSize({
      width: Math.round(finalWidth),
      height: Math.round(finalHeight),
    })
  }, [template.aspect_ratio])

  useEffect(() => {
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [updateDimensions])

  // 4. Attach transformer to active box (placement or cleanup)
  useEffect(() => {
    if (!trRef.current) return

    if (activeBox === 'placement' && placementRectRef.current) {
      trRef.current.nodes([placementRectRef.current])
    } else if (activeBox === 'cleanup' && cleanupRectRef.current) {
      trRef.current.nodes([cleanupRectRef.current])
    } else {
      trRef.current.nodes([])
    }
    trRef.current.getLayer()?.batchDraw()
  }, [activeBox, currentPlacement, cleanupConfig.region, stageSize, viewMode])

  // Warn user before leaving page with unsaved changes
  const hasUnsavedChanges = hasUnsavedPlacement || hasUnsavedCleanup || hasUnsavedTypography
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

  // Derived canvas pixel boxes
  const placementCanvasRect: CanvasRect = currentPlacement
    ? normalizedToCanvas(currentPlacement, stageSize.width, stageSize.height)
    : { x: 0, y: 0, width: 0, height: 0 }

  const cleanupCanvasRect: CanvasRect = cleanupConfig.region
    ? normalizedToCanvas(cleanupConfig.region, stageSize.width, stageSize.height)
    : { x: 0, y: 0, width: 0, height: 0 }

  // Canvas Drawing Handlers
  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const clickedOnStage = e.target === e.target.getStage() || e.target.name() === 'background-image'
    if (!clickedOnStage) return

    const stage = e.target.getStage()
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return

    setIsDrawing(true)
    setDrawStart({ x: pos.x, y: pos.y })
    setSaveSuccess(false)
  }

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!isDrawing || !drawStart) return
    const stage = e.target.getStage()
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return

    const x = Math.min(drawStart.x, pos.x)
    const y = Math.min(drawStart.y, pos.y)
    const width = Math.max(10, Math.abs(pos.x - drawStart.x))
    const height = Math.max(10, Math.abs(pos.y - drawStart.y))

    const norm = canvasToNormalized({ x, y, width, height }, stageSize.width, stageSize.height)

    if (activeBox === 'placement') {
      setCurrentPlacement(norm)
      setHasUnsavedPlacement(true)
    } else {
      setCleanupConfig((prev) => ({ ...prev, region: norm }))
      setHasUnsavedCleanup(true)
    }
  }

  const handleStageMouseUp = () => {
    if (isDrawing) {
      setIsDrawing(false)
      setDrawStart(null)
      triggerDebouncedSync()
    }
  }

  // Handle Box Drag
  const handlePlacementDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target
    const newX = Math.max(0, Math.min(stageSize.width - placementCanvasRect.width, node.x()))
    const newY = Math.max(0, Math.min(stageSize.height - placementCanvasRect.height, node.y()))

    node.position({ x: newX, y: newY })

    const norm = canvasToNormalized(
      {
        x: newX,
        y: newY,
        width: placementCanvasRect.width,
        height: placementCanvasRect.height,
      },
      stageSize.width,
      stageSize.height
    )

    setCurrentPlacement(norm)
    setHasUnsavedPlacement(true)
    setSaveSuccess(false)
    triggerDebouncedSync()
  }

  const handleCleanupDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target
    const newX = Math.max(0, Math.min(stageSize.width - cleanupCanvasRect.width, node.x()))
    const newY = Math.max(0, Math.min(stageSize.height - cleanupCanvasRect.height, node.y()))

    node.position({ x: newX, y: newY })

    const norm = canvasToNormalized(
      {
        x: newX,
        y: newY,
        width: cleanupCanvasRect.width,
        height: cleanupCanvasRect.height,
      },
      stageSize.width,
      stageSize.height
    )

    setCleanupConfig((prev) => ({ ...prev, region: norm }))
    setHasUnsavedCleanup(true)
    setSaveSuccess(false)
    triggerDebouncedSync()
  }

  // Handle Box Transform
  const handlePlacementTransformEnd = () => {
    const node = placementRectRef.current
    if (!node) return

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    node.scaleX(1)
    node.scaleY(1)

    const rawWidth = Math.max(15, node.width() * scaleX)
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
    triggerDebouncedSync()
  }

  const handleCleanupTransformEnd = () => {
    const node = cleanupRectRef.current
    if (!node) return

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    node.scaleX(1)
    node.scaleY(1)

    const rawWidth = Math.max(15, node.width() * scaleX)
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

    setCleanupConfig((prev) => ({ ...prev, region: norm }))
    setHasUnsavedCleanup(true)
    setSaveSuccess(false)
    triggerDebouncedSync()
  }

  // Keyboard adjustment controls
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const targetRegion = activeBox === 'placement' ? currentPlacement : cleanupConfig.region
    if (!targetRegion) return

    const step = e.shiftKey ? 0.02 : 0.005
    let { x, y, width, height } = targetRegion

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

    if (activeBox === 'placement') {
      setCurrentPlacement(clamped)
      setHasUnsavedPlacement(true)
    } else {
      setCleanupConfig((prev) => ({ ...prev, region: clamped }))
      setHasUnsavedCleanup(true)
    }
    setSaveSuccess(false)
    triggerDebouncedSync()
  }

  // Explicit Save Action
  const handleSaveAll = async () => {
    if (!currentPlacement) return
    setIsSaving(true)
    setErrorMessage(null)
    try {
      await onSavePlacement(currentPlacement)
      await onSaveCleanup(cleanupConfig)
      await onSaveTypography(typography)
      setHasUnsavedPlacement(false)
      setHasUnsavedCleanup(false)
      setHasUnsavedTypography(false)
      setSaveSuccess(true)
      setBackendSyncVersion((v) => v + 1)
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

  // Reset to original saved state
  const handleReset = () => {
    if (savedPlacement) {
      setCurrentPlacement(savedPlacement)
    } else {
      setCurrentPlacement({ x: 0.2, y: 0.45, width: 0.6, height: 0.12 })
    }

    if (savedCleanup) {
      setCleanupConfig(savedCleanup)
    } else {
      setCleanupConfig({
        mode: 'solid',
        region: savedPlacement || { x: 0.2, y: 0.45, width: 0.6, height: 0.12 },
        sample_border_color: true,
        custom_color: '#ffffff',
        inpaint_radius: 3,
      })
    }

    if (savedTypography) {
      setTypography(savedTypography)
    }

    setHasUnsavedPlacement(false)
    setHasUnsavedCleanup(false)
    setHasUnsavedTypography(false)
    setSaveSuccess(false)
    triggerDebouncedSync()
  }

  // Batch analysis
  const handleRunBatchAnalysis = async () => {
    setIsAnalyzing(true)
    setErrorMessage(null)
    try {
      if (currentPlacement) {
        await onSavePlacement(currentPlacement)
      }
      await onSaveCleanup(cleanupConfig)
      await onSaveTypography(typography)
      setHasUnsavedPlacement(false)
      setHasUnsavedCleanup(false)
      setHasUnsavedTypography(false)

      const report = await analyzeTypography(jobId)
      setBatchReport(report)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage('Failed to run batch typography analysis.')
      }
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Calculate live Konva font size proportional to canvas vs template height
  const scaleFactor = stageSize.height / (template.height || stageSize.height)
  const clientFontSize = Math.max(12, Math.round(typography.preferred_font_size * scaleFactor))
  const clientFontFamily = FONT_ID_TO_FAMILY[typography.font_id] || 'sans-serif'

  // Determine which background image to show on canvas
  let currentBgImage: HTMLImageElement | null = originalImageObj
  if (viewMode === 'cleaned' && cleanedImageObj) {
    currentBgImage = cleanedImageObj
  } else if (viewMode === 'personalized') {
    // Show cleaned background beneath live personalized text overlay, or fallback to authoritative render
    currentBgImage = cleanedImageObj || authoritativeImageObj || originalImageObj
  }

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <button
            type="button"
            onClick={onBackToUpload}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors mb-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Ingestion</span>
          </button>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Live WYSIWYG Certificate Studio</span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              Milestone 4.1
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            Erase existing template names, position the new recipient area, and preview typography in real time.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {hasUnsavedChanges && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>Unsaved Edits</span>
            </span>
          )}

          {saveSuccess && !hasUnsavedChanges && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Saved</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            title="Reset to saved settings"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving || !currentPlacement}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
          </button>

          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
              canContinue
                ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
            }`}
          >
            <span>Continue</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Editor Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left 3 cols: Unified Live Canvas */}
        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="lg:col-span-3 rounded-xl border border-slate-200 bg-slate-900/5 p-4 flex flex-col items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 select-none"
        >
          {/* Top Control Bar: View Switcher & Region Selector */}
          <div className="w-full flex flex-wrap items-center justify-between pb-3 mb-3 border-b border-slate-200/60 gap-3">
            {/* View Mode Pills */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 px-2 uppercase tracking-wider">
                View:
              </span>
              <button
                type="button"
                onClick={() => setViewMode('personalized')}
                className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                  viewMode === 'personalized'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Personalized</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('cleaned')}
                className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                  viewMode === 'cleaned'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eraser className="h-3.5 w-3.5" />
                <span>Cleaned</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('original')}
                className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                  viewMode === 'original'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Original</span>
              </button>
            </div>

            {/* Active Box Selector (Placement vs Cleanup) */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-xs">
                <span className="text-[11px] font-semibold text-slate-400 px-2 uppercase tracking-wider">
                  Target Box:
                </span>
                <button
                  type="button"
                  onClick={() => setActiveBox('placement')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                    activeBox === 'placement'
                      ? 'bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-indigo-600" />
                  <span>Name Region</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveBox('cleanup')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                    activeBox === 'cleanup'
                      ? 'bg-rose-50 text-rose-700 font-semibold border border-rose-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  <span>Cleanup Region</span>
                </button>
              </div>

              {isBackendSyncing && (
                <span className="text-[11px] text-indigo-600 flex items-center gap-1 animate-pulse">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>Syncing...</span>
                </span>
              )}
            </div>
          </div>

          {/* Unified Live Canvas */}
          <div
            className="relative shadow-md rounded-lg overflow-hidden bg-white border border-slate-300"
            style={{ width: stageSize.width, height: stageSize.height }}
          >
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-400 text-xs font-medium">
                Loading certificate canvas...
              </div>
            )}

            <Stage
              width={stageSize.width}
              height={stageSize.height}
              onMouseDown={handleStageMouseDown}
              onMouseMove={handleStageMouseMove}
              onMouseUp={handleStageMouseUp}
              onTouchStart={handleStageMouseDown}
              onTouchMove={handleStageMouseMove}
              onTouchEnd={handleStageMouseUp}
            >
              <Layer>
                {/* 1. Background Image: Cleaned, Original, or Rendered Authoritative */}
                {currentBgImage && (
                  <KonvaImage
                    image={currentBgImage}
                    width={stageSize.width}
                    height={stageSize.height}
                    name="background-image"
                    listening={true}
                  />
                )}

                {/* 2. Cleanup Box (Red/Amber dashed outline) */}
                {cleanupConfig.region && cleanupConfig.mode !== 'none' && (
                  <Group>
                    <Rect
                      ref={cleanupRectRef}
                      x={cleanupCanvasRect.x}
                      y={cleanupCanvasRect.y}
                      width={cleanupCanvasRect.width}
                      height={cleanupCanvasRect.height}
                      fill={activeBox === 'cleanup' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.04)'}
                      stroke="#ef4444"
                      strokeWidth={activeBox === 'cleanup' ? 2 : 1.5}
                      dash={[4, 4]}
                      draggable={activeBox === 'cleanup'}
                      dragBoundFunc={(pos) => ({
                        x: Math.max(0, Math.min(stageSize.width - cleanupCanvasRect.width, pos.x)),
                        y: Math.max(0, Math.min(stageSize.height - cleanupCanvasRect.height, pos.y)),
                      })}
                      onClick={() => setActiveBox('cleanup')}
                      onTap={() => setActiveBox('cleanup')}
                      onDragEnd={handleCleanupDragEnd}
                      onTransformEnd={handleCleanupTransformEnd}
                    />
                  </Group>
                )}

                {/* 3. Name Placement Box (Indigo outline) */}
                {currentPlacement && (
                  <Group>
                    <Rect
                      ref={placementRectRef}
                      x={placementCanvasRect.x}
                      y={placementCanvasRect.y}
                      width={placementCanvasRect.width}
                      height={placementCanvasRect.height}
                      fill={activeBox === 'placement' ? 'rgba(99, 102, 241, 0.10)' : 'transparent'}
                      stroke="#4f46e5"
                      strokeWidth={activeBox === 'placement' ? 2 : 1}
                      dash={[6, 4]}
                      draggable={activeBox === 'placement'}
                      dragBoundFunc={(pos) => ({
                        x: Math.max(0, Math.min(stageSize.width - placementCanvasRect.width, pos.x)),
                        y: Math.max(0, Math.min(stageSize.height - placementCanvasRect.height, pos.y)),
                      })}
                      onClick={() => setActiveBox('placement')}
                      onTap={() => setActiveBox('placement')}
                      onDragEnd={handlePlacementDragEnd}
                      onTransformEnd={handlePlacementTransformEnd}
                    />

                    {/* 4. Live WYSIWYG Personalized Text with loaded @font-face font */}
                    {viewMode === 'personalized' && (
                      <KonvaText
                        x={placementCanvasRect.x}
                        y={placementCanvasRect.y}
                        width={placementCanvasRect.width}
                        height={placementCanvasRect.height}
                        text={selectedSample}
                        fontSize={clientFontSize}
                        fontFamily={clientFontFamily}
                        fill={typography.text_color}
                        align={typography.alignment}
                        verticalAlign="middle"
                        listening={false}
                      />
                    )}
                  </Group>
                )}

                {/* 5. Transformer for Active Box */}
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
                    if (newBox.width < 15 || newBox.height < 15) return oldBox
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
              </Layer>
            </Stage>
          </div>

          {/* Interaction Guide */}
          <div className="mt-3 text-[11px] text-slate-500 flex flex-wrap items-center justify-center gap-4">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-indigo-600 inline-block" /> Indigo: Recipient Name Box
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-500 inline-block" /> Red: Placeholder Cleanup Box
            </span>
            <span className="flex items-center gap-1">
              <Move className="h-3 w-3" /> Drag active box to move
            </span>
            <span className="flex items-center gap-1">
              <Maximize2 className="h-3 w-3" /> Handles to resize
            </span>
            <span>⌨️ Arrow keys nudge</span>
          </div>
        </div>

        {/* Right 1 col: Controls Sidebar */}
        <div className="space-y-4">
          {/* Section 1: Placeholder Removal Controls */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Eraser className="h-4 w-4 text-rose-600" />
              <h3 className="text-xs font-semibold text-slate-900">
                Placeholder Removal
              </h3>
            </div>

            {/* Cleanup Mode Selector */}
            <div>
              <label className="text-xs font-semibold text-slate-800 block mb-1">
                Erase Mode
              </label>
              <select
                value={cleanupConfig.mode}
                onChange={(e) => {
                  setCleanupConfig((prev) => ({
                    ...prev,
                    mode: e.target.value as CleanupMode,
                  }))
                  setHasUnsavedCleanup(true)
                  setSaveSuccess(false)
                  triggerDebouncedSync()
                }}
                className="w-full bg-white border border-slate-300 rounded-md py-1.5 px-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs"
              >
                <option value="solid">Solid Background Fill</option>
                <option value="inpaint">OpenCV Telea Inpaint (Textures)</option>
                <option value="pdf_redact">PyMuPDF Vector Text Redact (PDF)</option>
                <option value="none">None (Keep Original)</option>
              </select>
            </div>

            {/* Cleanup Mode Detailed Settings */}
            {cleanupConfig.mode === 'solid' && (
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cleanupConfig.sample_border_color}
                    onChange={(e) => {
                      setCleanupConfig((prev) => ({
                        ...prev,
                        sample_border_color: e.target.checked,
                      }))
                      setHasUnsavedCleanup(true)
                      setSaveSuccess(false)
                      triggerDebouncedSync()
                    }}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Auto-sample border background color</span>
                </label>

                {!cleanupConfig.sample_border_color && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Custom Fill Color
                    </label>
                    <div className="flex items-center gap-2 border border-slate-300 rounded-md p-1 bg-white">
                      <input
                        type="color"
                        value={cleanupConfig.custom_color || '#ffffff'}
                        onChange={(e) => {
                          setCleanupConfig((prev) => ({
                            ...prev,
                            custom_color: e.target.value,
                          }))
                          setHasUnsavedCleanup(true)
                          setSaveSuccess(false)
                          triggerDebouncedSync()
                        }}
                        className="h-6 w-8 rounded border-none cursor-pointer p-0 bg-transparent"
                      />
                      <span className="text-[11px] font-mono text-slate-700 uppercase">
                        {cleanupConfig.custom_color || '#ffffff'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {cleanupConfig.mode === 'inpaint' && (
              <div className="space-y-1.5 pt-1 border-t border-slate-100">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-800">Inpaint Radius</span>
                  <span className="font-mono text-slate-600">{cleanupConfig.inpaint_radius}px</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={cleanupConfig.inpaint_radius}
                  onChange={(e) => {
                    setCleanupConfig((prev) => ({
                      ...prev,
                      inpaint_radius: Number(e.target.value),
                    }))
                    setHasUnsavedCleanup(true)
                    setSaveSuccess(false)
                    triggerDebouncedSync()
                  }}
                  className="w-full accent-rose-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400 block">
                  Telea algorithm reconstructs underlying parchment texture.
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setActiveBox('cleanup')}
              className={`w-full py-1.5 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 transition-colors ${
                activeBox === 'cleanup'
                  ? 'bg-rose-50 border-rose-300 text-rose-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Eraser className="h-3.5 w-3.5" />
              <span>{activeBox === 'cleanup' ? 'Editing Cleanup Box' : 'Select Cleanup Box'}</span>
            </button>
          </div>

          {/* Section 2: Typography Controls Card */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Type className="h-4 w-4 text-indigo-600" />
              <h3 className="text-xs font-semibold text-slate-900">
                Typography Controls
              </h3>
            </div>

            {/* Font Family Selector */}
            <div>
              <label className="text-xs font-semibold text-slate-800 block mb-1">
                Certificate Font
              </label>
              <select
                value={typography.font_id}
                onChange={(e) => {
                  setTypography({ ...typography, font_id: e.target.value })
                  setHasUnsavedTypography(true)
                  setSaveSuccess(false)
                  triggerDebouncedSync()
                }}
                className="w-full bg-white border border-slate-300 rounded-md py-1.5 px-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs"
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
                <label className="text-xs font-semibold text-slate-800 block mb-1">
                  Text Color
                </label>
                <div className="flex items-center gap-2 border border-slate-300 rounded-md p-1 bg-white">
                  <input
                    type="color"
                    value={typography.text_color}
                    onChange={(e) => {
                      setTypography({ ...typography, text_color: e.target.value })
                      setHasUnsavedTypography(true)
                      setSaveSuccess(false)
                      triggerDebouncedSync()
                    }}
                    className="h-6 w-8 rounded border-none cursor-pointer p-0 bg-transparent"
                  />
                  <span className="text-[11px] font-mono text-slate-700 uppercase">
                    {typography.text_color}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-800 block mb-1">
                  Alignment
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
                    triggerDebouncedSync()
                  }}
                  className="w-full bg-white border border-slate-300 rounded-md py-1.5 px-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs"
                >
                  <option value="center">Center</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>

            {/* Sizing Controls */}
            <div className="space-y-3 pt-1">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-800">Preferred Size</span>
                  <span className="font-mono text-slate-600">{typography.preferred_font_size}px</span>
                </div>
                <input
                  type="range"
                  min="20"
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
                    triggerDebouncedSync()
                  }}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-800">Minimum Readable</span>
                  <span className="font-mono text-slate-600">{typography.min_font_size}px</span>
                </div>
                <input
                  type="range"
                  min="10"
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
                    triggerDebouncedSync()
                  }}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Text will never shrink below this limit.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveBox('placement')}
              className={`w-full py-1.5 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 transition-colors ${
                activeBox === 'placement'
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Move className="h-3.5 w-3.5" />
              <span>{activeBox === 'placement' ? 'Editing Name Box' : 'Select Name Box'}</span>
            </button>
          </div>

          {/* Section 3: Participant Sample Selection */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-indigo-600" />
              <h3 className="text-xs font-semibold text-slate-900">
                Preview Participant
              </h3>
            </div>

            <div className="space-y-1.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setSelectedSample(shortSample)
                  setBackendSyncVersion((v) => v + 1)
                }}
                className={`w-full text-left p-2 rounded-lg border transition-colors flex items-center justify-between ${
                  selectedSample === shortSample
                    ? 'border-indigo-500 bg-indigo-50/50 text-indigo-900'
                    : 'border-slate-100 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="font-medium">Short Name</span>
                <span className="font-mono text-[11px] text-slate-500">{shortSample}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedSample(longSample)
                  setBackendSyncVersion((v) => v + 1)
                }}
                className={`w-full text-left p-2 rounded-lg border transition-colors flex items-center justify-between ${
                  selectedSample === longSample
                    ? 'border-indigo-500 bg-indigo-50/50 text-indigo-900'
                    : 'border-slate-100 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="font-medium">Long Name</span>
                <span className="font-mono text-[11px] text-slate-500 truncate max-w-[140px]">
                  {longSample}
                </span>
              </button>

              {participants.length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mt-2 mb-1">
                    Select from CSV ({participants.length} total):
                  </label>
                  <select
                    value={selectedSample}
                    onChange={(e) => {
                      setSelectedSample(e.target.value)
                      setBackendSyncVersion((v) => v + 1)
                    }}
                    className="w-full bg-white border border-slate-300 rounded-md py-1.5 px-2 text-xs text-slate-800 shadow-xs"
                  >
                    {participants
                      .filter((p) => p.is_valid && p.name)
                      .slice(0, 30)
                      .map((p) => (
                        <option key={p.row_number} value={p.name}>
                          #{p.row_number}: {p.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Batch Typography Analysis Card */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-indigo-600" />
                <h3 className="text-xs font-semibold text-slate-900">
                  Batch Fitting Analysis
                </h3>
              </div>
              <button
                type="button"
                onClick={handleRunBatchAnalysis}
                disabled={isAnalyzing}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${isAnalyzing ? 'animate-spin' : ''}`} />
                <span>Analyze</span>
              </button>
            </div>

            {batchReport ? (
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded bg-slate-50 border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Total Analyzed</span>
                    <span className="font-semibold text-slate-900 font-mono">
                      {batchReport.total_analyzed}
                    </span>
                  </div>
                  <div
                    className={`p-2 rounded border ${
                      batchReport.overflow_count === 0
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    <span className="text-[10px] block">Overflows</span>
                    <span className="font-semibold font-mono">
                      {batchReport.overflow_count}
                    </span>
                  </div>
                </div>

                {batchReport.widest_name && (
                  <div className="p-2 rounded bg-slate-50 border border-slate-200/80 text-[11px]">
                    <span className="text-slate-500 block">Widest Name:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSample(batchReport.widest_name || '')
                        setBackendSyncVersion((v) => v + 1)
                      }}
                      className="font-medium text-indigo-600 hover:underline truncate block w-full text-left mt-0.5"
                    >
                      {batchReport.widest_name} →
                    </button>
                  </div>
                )}

                {batchReport.warnings.length > 0 && (
                  <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[11px] space-y-1">
                    {batchReport.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-600" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Run batch analysis to verify that all participant names in your CSV fit comfortably
                and check for any unsupported glyphs.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
