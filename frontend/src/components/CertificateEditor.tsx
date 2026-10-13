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
  BarChart3,
  RefreshCw,
  AlertTriangle,
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
  analyzeTypography,
  fetchTextLayout,
} from '../api/client'
import {
  normalizedToCanvas,
  canvasToNormalized,
  clampNormalizedRect,
  type CanvasRect,
} from '../utils/coordinates'

// Map font IDs to exact loaded @font-face family names in index.css
const FONT_ID_TO_FAMILY: Record<string, string> = {
  great_vibes: 'Great Vibes',
  allura: 'Allura',
  alex_brush: 'Alex Brush',
  cinzel: 'Cinzel',
  eb_garamond: 'EB Garamond',
}

interface CertificateEditorProps {
  jobId: string
  template: TemplateMetadata
  savedPlacement: PlacementRegion | null
  savedTypography: TypographyConfig | null
  savedBatchAnalysis: BatchTypographyReport | null
  participants: ParticipantRecord[]
  onSavePlacement: (placement: PlacementRegion) => Promise<void>
  onSaveTypography: (config: TypographyConfig) => Promise<void>
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
      preferred_font_size: 56,
      min_font_size: 18,
      text_color: '#111827',
      alignment: 'center',
    }
  )
  const [hasUnsavedTypography, setHasUnsavedTypography] = useState<boolean>(false)

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
  const layoutRequestIdRef = useRef<number>(0)

  // 7. Batch analysis state
  const [batchReport, setBatchReport] = useState<BatchTypographyReport | null>(savedBatchAnalysis)
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false)

  // 8. Saving and status states
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Debounced auto-save timer
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Debounced authoritative backend layout calculation
  const requestAuthoritativeLayout = useCallback(() => {
    const currentReqId = ++layoutRequestIdRef.current
    setIsCalculatingLayout(true)

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        // First sync placement and typography so backend calculate_layout uses current values
        await onSavePlacement(currentPlacement)
        await onSaveTypography(typography)

        const layout = await fetchTextLayout(jobId, { sampleText: selectedSample })
        if (currentReqId === layoutRequestIdRef.current) {
          setBackendFittedSize(layout.font_size)
          setTextFits(layout.fits)
          setLayoutWarnings(layout.warnings || [])
          setIsCalculatingLayout(false)
        }
      } catch {
        if (currentReqId === layoutRequestIdRef.current) {
          setIsCalculatingLayout(false)
        }
      }
    }, 250)
  }, [jobId, currentPlacement, typography, selectedSample, onSavePlacement, onSaveTypography])

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

  // Reset to original saved state
  const handleReset = () => {
    if (savedPlacement) {
      setCurrentPlacement(savedPlacement)
    } else {
      setCurrentPlacement({ x: 0.2, y: 0.45, width: 0.6, height: 0.12 })
    }

    if (savedTypography) {
      setTypography(savedTypography)
    }

    setHasUnsavedPlacement(false)
    setHasUnsavedTypography(false)
    setSaveSuccess(false)
  }

  // Trigger batch analysis
  const handleRunBatchAnalysis = async () => {
    setIsAnalyzing(true)
    setErrorMessage(null)
    try {
      await onSavePlacement(currentPlacement)
      await onSaveTypography(typography)
      setHasUnsavedPlacement(false)
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

  // Scale factor from template original coordinate space to browser canvas pixels
  const scaleFactor = stageSize.height / (template.height || stageSize.height)

  // Use authoritative backend fitted font size if available, scaled to display canvas; otherwise approximate
  const effectiveFontSizeTemplate = backendFittedSize ?? typography.preferred_font_size
  const displayFontSize = Math.max(10, Math.round(effectiveFontSizeTemplate * scaleFactor))
  const displayFontFamily = FONT_ID_TO_FAMILY[typography.font_id] || 'sans-serif'

  // Quick preset samples for convenient preview
  const shortestName = batchReport?.shortest_name || 'Ava'
  const longestName = batchReport?.longest_name_by_chars || 'Dr. Alexander Montgomery-Cunningham III'
  const widestName = batchReport?.widest_name || null

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
            <span>Certificate Placement & Typography Studio</span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Auto-Fit Active
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            Position the recipient name region. Text auto-fits dynamically to prevent clipping on long names.
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
            disabled={isSaving}
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

      {/* Editor Grid: Left 3 cols (Stationary Viewport) | Right 1 col (Controls) */}
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

              {isCalculatingLayout && (
                <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 font-medium">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>Auto-fitting...</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              {backendFittedSize && (
                <span className="font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                  Fitted: <strong>{backendFittedSize}px</strong>
                  {backendFittedSize < typography.preferred_font_size && (
                    <span className="text-amber-600 ml-1">
                      (scaled from {typography.preferred_font_size}px)
                    </span>
                  )}
                </span>
              )}

              {!textFits && (
                <span className="inline-flex items-center gap-1 text-rose-600 font-semibold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  <AlertTriangle className="h-3 w-3" />
                  <span>Overflow Warning</span>
                </span>
              )}
            </div>
          </div>

          {/* Fixed-Aspect-Ratio Canvas Box (Completely stationary) */}
          <div
            className="relative shadow-md rounded-lg overflow-hidden bg-white border border-slate-300 shrink-0"
            style={{ width: stageSize.width, height: stageSize.height }}
          >
            {/* Loading Overlay (Absolute, zero layout shift) */}
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

                {/* 2. Recipient Name Bounding Box & Live Text */}
                <Group>
                  <Rect
                    ref={rectRef}
                    x={canvasRect.x}
                    y={canvasRect.y}
                    width={canvasRect.width}
                    height={canvasRect.height}
                    fill="rgba(99, 102, 241, 0.08)"
                    stroke="#4f46e5"
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

                  {/* 3. Personalized Name with loaded font & live auto-fit sizing */}
                  <KonvaText
                    x={canvasRect.x}
                    y={canvasRect.y}
                    width={canvasRect.width}
                    height={canvasRect.height}
                    text={selectedSample}
                    fontSize={displayFontSize}
                    fontFamily={displayFontFamily}
                    fill={typography.text_color}
                    align={typography.alignment}
                    verticalAlign="middle"
                    listening={false}
                  />

                  {/* 4. Konva Transformer with visible resize handles */}
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
                </Group>
              </Layer>
            </Stage>
          </div>

          {/* Bottom Interaction Guide: Static height */}
          <div className="mt-3 h-5 text-[11px] text-slate-500 flex items-center justify-center gap-4">
            <span className="flex items-center gap-1">
              <Move className="h-3 w-3 text-indigo-500" /> Drag box to position
            </span>
            <span className="flex items-center gap-1">
              <Maximize2 className="h-3 w-3 text-indigo-500" /> Drag handles to resize
            </span>
            <span>⌨️ Arrow keys nudge (Shift for larger steps)</span>
          </div>

          {/* Inline Auto-Fit Warnings (fixed min-height to prevent jumping) */}
          {layoutWarnings.length > 0 && (
            <div className="mt-2 w-full p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>{layoutWarnings[0]}</span>
            </div>
          )}
        </div>

        {/* Right Column: Clean, Intuitive Controls Sidebar */}
        <div className="space-y-4">
          {/* Section 1: Typography Controls Card */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Type className="h-4 w-4 text-indigo-600" />
              <h3 className="text-xs font-semibold text-slate-900">
                Typography & Fitting
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
                  <span className="font-semibold text-slate-800">Preferred Font Size</span>
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
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Target size for normal names; long names will auto-shrink smoothly.
                </span>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-800">Minimum Readable Size</span>
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
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Text will never shrink below this limit.
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Real Participant Preview Selector */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <UserCheck className="h-4 w-4 text-indigo-600" />
              <h3 className="text-xs font-semibold text-slate-900">
                Participant Preview
              </h3>
            </div>

            {/* Quick Presets: Short, Long, Widest */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelectedSample(shortestName)}
                className={`p-2 rounded-lg border text-left transition-colors ${
                  selectedSample === shortestName
                    ? 'border-indigo-500 bg-indigo-50/50 text-indigo-900'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-[10px] text-slate-500 block">Short Name</span>
                <span className="font-medium truncate block">{shortestName}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedSample(longestName)}
                className={`p-2 rounded-lg border text-left transition-colors ${
                  selectedSample === longestName
                    ? 'border-indigo-500 bg-indigo-50/50 text-indigo-900'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-[10px] text-slate-500 block">Long Name</span>
                <span className="font-medium truncate block">{longestName}</span>
              </button>
            </div>

            {widestName && widestName !== longestName && (
              <button
                type="button"
                onClick={() => setSelectedSample(widestName)}
                className={`w-full p-2 rounded-lg border text-left text-xs transition-colors ${
                  selectedSample === widestName
                    ? 'border-indigo-500 bg-indigo-50/50 text-indigo-900'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-[10px] text-slate-500 block">Widest Rendered Name</span>
                <span className="font-medium truncate block">{widestName}</span>
              </button>
            )}

            {/* Full CSV Participant Dropdown */}
            {validParticipants.length > 0 && (
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  All CSV Participants ({validParticipants.length}):
                </label>
                <select
                  value={selectedSample}
                  onChange={(e) => setSelectedSample(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-md py-1.5 px-2 text-xs text-slate-800 shadow-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
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

          {/* Section 3: Batch Typography Fitting Analysis */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-indigo-600" />
                <h3 className="text-xs font-semibold text-slate-900">
                  Batch Auto-Fit Analysis
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
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="p-2 rounded bg-slate-50 border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 block">Total</span>
                    <span className="font-semibold text-slate-900 font-mono">
                      {batchReport.total_analyzed}
                    </span>
                  </div>

                  <div className="p-2 rounded bg-indigo-50/60 border border-indigo-100 text-indigo-900">
                    <span className="text-[10px] text-indigo-600 block">Resized</span>
                    <span className="font-semibold font-mono">
                      {batchReport.reduction_count}
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

                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Fit status:</span>
                    <strong className={batchReport.all_fit ? 'text-emerald-700' : 'text-rose-700'}>
                      {batchReport.all_fit ? 'All names fit safely' : `${batchReport.overflow_count} names overflow`}
                    </strong>
                  </div>
                </div>

                {batchReport.warnings.length > 0 && (
                  <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[11px] space-y-1">
                    {batchReport.warnings.slice(0, 3).map((w, i) => (
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
                Click <strong>Analyze</strong> to verify that every participant name in your CSV fits
                comfortably without exceeding boundaries.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
