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
  getRenderedPreviewUrl,
  fetchFonts,
  analyzeTypography,
} from '../api/client'
import {
  normalizedToCanvas,
  canvasToNormalized,
  clampNormalizedRect,
  type CanvasRect,
} from '../utils/coordinates'

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

  // Certificate image element for Konva canvas
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null)
  const [imageLoaded, setImageLoaded] = useState<boolean>(false)

  // Responsive stage dimensions (rendered display size)
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  })

  // Selected region in normalized [0, 1] coordinates
  const [currentPlacement, setCurrentPlacement] = useState<PlacementRegion | null>(savedPlacement)
  const [hasUnsavedPlacement, setHasUnsavedPlacement] = useState<boolean>(false)

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

  // Preview Mode: 'overlay' (interactive Konva) vs 'rendered' (authoritative backend PNG)
  const [previewMode, setPreviewMode] = useState<'overlay' | 'rendered'>('overlay')
  const [previewVersion, setPreviewVersion] = useState<number>(1)

  // Batch analysis state
  const [batchReport, setBatchReport] = useState<BatchTypographyReport | null>(savedBatchAnalysis)
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false)

  // Saving states
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Sample name previews
  const shortSample = 'Jane Doe'
  const longSample = 'Dr. Alexander Montgomery-Cunningham III'
  const firstCsvParticipant = participants.find((p) => p.is_valid && p.name)?.name || null

  const [selectedSample, setSelectedSample] = useState<string>(firstCsvParticipant || shortSample)

  // Drawing state when user drags on canvas to create new rectangle
  const [isDrawing, setIsDrawing] = useState<boolean>(false)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)

  // Load available fonts from backend
  useEffect(() => {
    fetchFonts()
      .then(setAvailableFonts)
      .catch(() => {
        // Fallback font options if offline
        setAvailableFonts([
          { id: 'great_vibes', name: 'Great Vibes', category: 'Calligraphic', filename: 'GreatVibes-Regular.ttf', sample_text: 'Jane Doe' },
          { id: 'allura', name: 'Allura', category: 'Formal Script', filename: 'Allura-Regular.ttf', sample_text: 'Jane Doe' },
          { id: 'alex_brush', name: 'Alex Brush', category: 'Classic Script', filename: 'AlexBrush-Regular.ttf', sample_text: 'Jane Doe' },
          { id: 'cinzel', name: 'Cinzel', category: 'Classic Serif', filename: 'Cinzel-Regular.ttf', sample_text: 'Jane Doe' },
          { id: 'eb_garamond', name: 'EB Garamond', category: 'Readable Serif', filename: 'EBGaramond-Regular.ttf', sample_text: 'Jane Doe' },
        ])
      })
  }, [])

  // 1. Load preview image for Konva canvas
  useEffect(() => {
    setImageLoaded(false)
    const img = new window.Image()
    img.src = getTemplatePreviewUrl(template.preview_url)
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      setImageObj(img)
      setImageLoaded(true)
    }
    img.onerror = () => {
      setErrorMessage('Failed to load certificate preview image.')
    }
  }, [template.preview_url])

  // 2. Responsive container size calculation preserving exact aspect ratio
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

  // 3. Attach Konva transformer to rect whenever selection is present
  useEffect(() => {
    if (trRef.current && rectRef.current) {
      trRef.current.nodes([rectRef.current])
      trRef.current.getLayer()?.batchDraw()
    }
  }, [currentPlacement, stageSize, previewMode])

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

  // 4. Default placement if none exists yet
  useEffect(() => {
    if (savedPlacement) {
      setCurrentPlacement(savedPlacement)
      setHasUnsavedPlacement(false)
    } else if (!currentPlacement) {
      const defaultNorm: PlacementRegion = {
        x: 0.2,
        y: 0.45,
        width: 0.6,
        height: 0.12,
      }
      setCurrentPlacement(defaultNorm)
      setHasUnsavedPlacement(true)
    }
  }, [savedPlacement])

  // Canvas coordinates for the current placement
  const canvasRect: CanvasRect = currentPlacement
    ? normalizedToCanvas(currentPlacement, stageSize.width, stageSize.height)
    : { x: 0, y: 0, width: 0, height: 0 }

  // Handlers for drawing a new box
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
    setCurrentPlacement(norm)
    setHasUnsavedPlacement(true)
  }

  const handleStageMouseUp = () => {
    if (isDrawing) {
      setIsDrawing(false)
      setDrawStart(null)
    }
  }

  // Handle rect drag within boundaries
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

  // Handle resize via Transformer
  const handleTransformEnd = () => {
    const node = rectRef.current
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
  }

  // Keyboard adjustment controls
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!currentPlacement || previewMode === 'rendered') return

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

  // Save Placement & Typography Actions
  const handleSaveAll = async () => {
    if (!currentPlacement) return
    setIsSaving(true)
    setErrorMessage(null)
    try {
      await onSavePlacement(currentPlacement)
      await onSaveTypography(typography)
      setHasUnsavedPlacement(false)
      setHasUnsavedTypography(false)
      setSaveSuccess(true)
      setPreviewVersion((v) => v + 1)
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

  // Reset to original saved placement and typography
  const handleReset = () => {
    if (savedPlacement) {
      setCurrentPlacement(savedPlacement)
    } else {
      setCurrentPlacement({
        x: 0.2,
        y: 0.45,
        width: 0.6,
        height: 0.12,
      })
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
      // First ensure placement and typography are saved
      if (currentPlacement && hasUnsavedChanges) {
        await onSavePlacement(currentPlacement)
        await onSaveTypography(typography)
        setHasUnsavedPlacement(false)
        setHasUnsavedTypography(false)
      }
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

  const renderedPreviewUrl = getRenderedPreviewUrl(jobId, {
    sampleText: selectedSample,
    v: previewVersion,
  })

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
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
            Typography & Placement Studio
          </h2>
          <p className="text-xs text-slate-500">
            Configure calligraphy, font sizing, and preview authoritative backend rendering.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {hasUnsavedChanges && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>Unsaved Changes</span>
            </span>
          )}

          {saveSuccess && !hasUnsavedChanges && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Config Saved</span>
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
        {/* Left 3 cols: Canvas & Authoritative Preview */}
        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="lg:col-span-3 rounded-xl border border-slate-200 bg-slate-900/5 p-4 flex flex-col items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 select-none"
        >
          {/* Dual Mode Switcher Bar */}
          <div className="w-full flex items-center justify-between pb-3 mb-3 border-b border-slate-200/60">
            <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-xs">
              <button
                type="button"
                onClick={() => setPreviewMode('overlay')}
                className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                  previewMode === 'overlay'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Move className="h-3.5 w-3.5" />
                <span>1. Placement Canvas (Adjust Box)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPreviewMode('rendered')
                  setPreviewVersion((v) => v + 1)
                }}
                className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                  previewMode === 'rendered'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>2. Authoritative Backend Preview</span>
              </button>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              {previewMode === 'overlay' ? (
                <span className="flex items-center gap-1">
                  <Move className="h-3.5 w-3.5 text-indigo-500" /> Drag handles to size box
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Authoritative Backend Render
                </span>
              )}
            </div>
          </div>

          {/* Canvas or Rendered View */}
          <div
            className="relative shadow-md rounded-lg overflow-hidden bg-white border border-slate-300"
            style={{ width: stageSize.width, height: stageSize.height }}
          >
            {previewMode === 'overlay' ? (
              <>
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
                    {imageObj && (
                      <KonvaImage
                        image={imageObj}
                        width={stageSize.width}
                        height={stageSize.height}
                        name="background-image"
                        listening={true}
                      />
                    )}

                    {currentPlacement && (
                      <Group>
                        <Rect
                          ref={rectRef}
                          x={canvasRect.x}
                          y={canvasRect.y}
                          width={canvasRect.width}
                          height={canvasRect.height}
                          fill="rgba(99, 102, 241, 0.12)"
                          stroke="#4f46e5"
                          strokeWidth={2}
                          dash={[6, 4]}
                          draggable={true}
                          dragBoundFunc={(pos) => {
                            return {
                              x: Math.max(0, Math.min(stageSize.width - canvasRect.width, pos.x)),
                              y: Math.max(0, Math.min(stageSize.height - canvasRect.height, pos.y)),
                            }
                          }}
                          onDragEnd={handleDragEnd}
                          onTransformEnd={handleTransformEnd}
                        />

                        {/* Approximate text positioning guide */}
                        <KonvaText
                          x={canvasRect.x}
                          y={canvasRect.y + canvasRect.height * 0.25}
                          width={canvasRect.width}
                          height={canvasRect.height * 0.5}
                          text={selectedSample}
                          fontSize={Math.max(12, Math.min(42, canvasRect.height * 0.45))}
                          fontFamily="sans-serif"
                          fontStyle="bold"
                          fill={typography.text_color}
                          align={typography.alignment}
                          verticalAlign="middle"
                          listening={false}
                        />

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
                            if (newBox.width < 20 || newBox.height < 15) return oldBox
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
                    )}
                  </Layer>
                </Stage>
              </>
            ) : (
              /* Authoritative Rendered Image Preview */
              <div className="relative w-full h-full flex items-center justify-center bg-slate-900/5">
                <img
                  src={renderedPreviewUrl}
                  alt="Authoritative rendered certificate preview"
                  onError={() => {
                    setErrorMessage('Failed to generate backend preview. Please save placement first.')
                  }}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            )}
          </div>

          <div className="mt-3 text-[11px] text-slate-500 flex flex-wrap items-center justify-center gap-4">
            <span className="flex items-center gap-1">
              <Move className="h-3 w-3" /> Drag box to position
            </span>
            <span className="flex items-center gap-1">
              <Maximize2 className="h-3 w-3" /> Drag handles to resize
            </span>
            <span>⌨️ Arrow keys nudge (Shift for 2% steps)</span>
          </div>
        </div>

        {/* Right 1 col: Typography Controls & Batch Analysis */}
        <div className="space-y-4">
          {/* Typography Controls Card */}
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
                  }}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Text will never shrink below this limit.
                </span>
              </div>
            </div>
          </div>

          {/* Participant Sample Selection */}
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
                  setPreviewVersion((v) => v + 1)
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
                  setPreviewVersion((v) => v + 1)
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
                      setPreviewVersion((v) => v + 1)
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

          {/* Batch Typography Analysis Card */}
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
                        setPreviewMode('rendered')
                        setPreviewVersion((v) => v + 1)
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
