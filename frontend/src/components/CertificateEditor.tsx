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
  Sparkles,
} from 'lucide-react'
import type {
  TemplateMetadata,
  PlacementRegion,
  ParticipantRecord,
} from '../api/client'
import {
  getTemplatePreviewUrl,
} from '../api/client'
import {
  normalizedToCanvas,
  canvasToNormalized,
  clampNormalizedRect,
  type CanvasRect,
} from '../utils/coordinates'

interface CertificateEditorProps {
  template: TemplateMetadata
  savedPlacement: PlacementRegion | null
  participants: ParticipantRecord[]
  onSavePlacement: (placement: PlacementRegion) => Promise<void>
  onBackToUpload: () => void
  onContinue: () => void
  canContinue: boolean
}

export const CertificateEditor: React.FC<CertificateEditorProps> = ({
  template,
  savedPlacement,
  participants,
  onSavePlacement,
  onBackToUpload,
  onContinue,
  canContinue,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const rectRef = useRef<Konva.Rect>(null)
  const trRef = useRef<Konva.Transformer>(null)

  // Certificate image element
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null)
  const [imageLoaded, setImageLoaded] = useState<boolean>(false)

  // Responsive stage dimensions (rendered display size)
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  })

  // Selected region in normalized [0, 1] coordinates
  const [currentPlacement, setCurrentPlacement] = useState<PlacementRegion | null>(
    savedPlacement
  )
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Sample name previews
  const shortSample = 'Jane Doe'
  const longSample = 'Dr. Alexander Montgomery-Cunningham III'
  const firstCsvParticipant =
    participants.find((p) => p.is_valid && p.name)?.name || null

  const [sampleMode, setSampleMode] = useState<'short' | 'long' | 'first'>('short')
  const displaySampleName =
    sampleMode === 'short'
      ? shortSample
      : sampleMode === 'long'
      ? longSample
      : firstCsvParticipant || shortSample

  // Drawing state when user drags on canvas to create new rectangle
  const [isDrawing, setIsDrawing] = useState<boolean>(false)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)

  // 1. Load preview image
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
    const containerWidth = containerRef.current.clientWidth - 32 // padding
    if (containerWidth <= 0) return

    const aspectRatio = template.aspect_ratio || 1.414 // default fallback A4 landscape
    // Target display height based on container width
    const targetHeight = containerWidth / aspectRatio
    // Cap max height for comfortable desktop viewport
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
  }, [currentPlacement, stageSize])

  // 4. Default placement if none exists yet
  useEffect(() => {
    if (!currentPlacement && savedPlacement) {
      setCurrentPlacement(savedPlacement)
    } else if (!currentPlacement && !savedPlacement) {
      // Sensible initial placement in the center
      const defaultNorm: PlacementRegion = {
        x: 0.2,
        y: 0.45,
        width: 0.6,
        height: 0.12,
      }
      setCurrentPlacement(defaultNorm)
      setHasUnsavedChanges(true)
    }
  }, [savedPlacement])

  // Canvas coordinates for the current placement
  const canvasRect: CanvasRect = currentPlacement
    ? normalizedToCanvas(currentPlacement, stageSize.width, stageSize.height)
    : { x: 0, y: 0, width: 0, height: 0 }

  // Handlers for drawing a new box
  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    // Only start drawing if clicking directly on background stage / image, NOT on the rect or transformer handles
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
    setHasUnsavedChanges(true)
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
    setHasUnsavedChanges(true)
    setSaveSuccess(false)
  }

  // Handle resize via Transformer
  const handleTransformEnd = () => {
    const node = rectRef.current
    if (!node) return

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    // Reset scale to 1 and adjust width & height
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
    setHasUnsavedChanges(true)
    setSaveSuccess(false)
  }

  // Keyboard adjustment controls (accessible keyboard nudge & resize)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!currentPlacement) return

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
    setHasUnsavedChanges(true)
    setSaveSuccess(false)
  }

  // Save Placement Action
  const handleSave = async () => {
    if (!currentPlacement) return
    setIsSaving(true)
    setErrorMessage(null)
    try {
      await onSavePlacement(currentPlacement)
      setHasUnsavedChanges(false)
      setSaveSuccess(true)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage('Failed to save placement.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  // Reset to original saved placement or default
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
    setHasUnsavedChanges(false)
    setSaveSuccess(false)
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
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
            Recipient Name Placement Editor
          </h2>
          <p className="text-xs text-slate-500">
            Click, drag, or resize the placement boundary where participant names will be printed.
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
              <span>Placement Saved</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            title="Reset to saved or default placement"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !currentPlacement}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Placement'}</span>
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

      {/* Editor Main Stage & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Konva Interactive Canvas */}
        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="lg:col-span-3 rounded-xl border border-slate-200 bg-slate-900/5 p-4 flex flex-col items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 select-none"
        >
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
                {/* Background Certificate Image */}
                {imageObj && (
                  <KonvaImage
                    image={imageObj}
                    width={stageSize.width}
                    height={stageSize.height}
                    name="background-image"
                    listening={true}
                  />
                )}

                {/* Name Placement Box Group */}
                {currentPlacement && (
                  <Group>
                    <Rect
                      ref={rectRef}
                      x={canvasRect.x}
                      y={canvasRect.y}
                      width={canvasRect.width}
                      height={canvasRect.height}
                      fill="rgba(99, 102, 241, 0.15)"
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

                    {/* Visual Positioning Text Preview */}
                    <KonvaText
                      x={canvasRect.x}
                      y={canvasRect.y + canvasRect.height * 0.25}
                      width={canvasRect.width}
                      height={canvasRect.height * 0.5}
                      text={displaySampleName}
                      fontSize={Math.max(12, Math.min(36, canvasRect.height * 0.45))}
                      fontFamily="sans-serif"
                      fontStyle="bold"
                      fill="#1e1b4b"
                      align="center"
                      verticalAlign="middle"
                      listening={false}
                    />

                    {/* Transformer Handles */}
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
                        if (newBox.width < 20 || newBox.height < 15) {
                          return oldBox
                        }
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
          </div>

          <div className="mt-3 text-[11px] text-slate-500 flex flex-wrap items-center justify-center gap-4">
            <span className="flex items-center gap-1">
              <Move className="h-3 w-3" /> Drag box to position
            </span>
            <span className="flex items-center gap-1">
              <Maximize2 className="h-3 w-3" /> Drag handles to resize
            </span>
            <span>⌨️ Arrow keys nudge position (Shift for larger steps)</span>
          </div>
        </div>

        {/* Right: Sidebar Properties & Controls */}
        <div className="space-y-4">
          {/* Sample Participant Name Selector */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <UserCheck className="h-4 w-4 text-indigo-600" />
              <h3 className="text-xs font-semibold text-slate-900">
                Sample Text Preview
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
              Test how both short and long names fit inside your chosen bounding box.
            </p>

            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50 border border-slate-100">
                <input
                  type="radio"
                  name="sampleMode"
                  value="short"
                  checked={sampleMode === 'short'}
                  onChange={() => setSampleMode('short')}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <div className="truncate">
                  <span className="font-medium text-slate-800 block">Short Name</span>
                  <span className="text-[11px] text-slate-500 font-mono">Jane Doe</span>
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50 border border-slate-100">
                <input
                  type="radio"
                  name="sampleMode"
                  value="long"
                  checked={sampleMode === 'long'}
                  onChange={() => setSampleMode('long')}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <div className="truncate">
                  <span className="font-medium text-slate-800 block">Long Name</span>
                  <span className="text-[11px] text-slate-500 font-mono truncate block">
                    Dr. Alexander Montgomery...
                  </span>
                </div>
              </label>

              {firstCsvParticipant && (
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50 border border-slate-100">
                  <input
                    type="radio"
                    name="sampleMode"
                    value="first"
                    checked={sampleMode === 'first'}
                    onChange={() => setSampleMode('first')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="truncate">
                    <span className="font-medium text-slate-800 block">CSV Participant</span>
                    <span className="text-[11px] text-slate-500 font-mono truncate block">
                      {firstCsvParticipant}
                    </span>
                  </div>
                </label>
              )}
            </div>
          </div>

          {/* Coordinate Precision Card */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
            <h3 className="text-xs font-semibold text-slate-900 mb-2">
              Normalized Placement
            </h3>
            <p className="text-[11px] text-slate-500 mb-3">
              Stored relative to original {template.width}×{template.height} template.
            </p>

            {currentPlacement ? (
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] text-slate-400 block">X</span>
                  <span className="font-semibold text-slate-800">
                    {(currentPlacement.x * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="p-2 rounded bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] text-slate-400 block">Y</span>
                  <span className="font-semibold text-slate-800">
                    {(currentPlacement.y * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="p-2 rounded bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] text-slate-400 block">WIDTH</span>
                  <span className="font-semibold text-slate-800">
                    {(currentPlacement.width * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="p-2 rounded bg-slate-50 border border-slate-200/80">
                  <span className="text-[10px] text-slate-400 block">HEIGHT</span>
                  <span className="font-semibold text-slate-800">
                    {(currentPlacement.height * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ) : (
              <span className="text-xs text-slate-400">No area selected</span>
            )}
          </div>

          {/* Visual Fidelity Note */}
          <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/50 text-indigo-900 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-indigo-950">
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              <span>Milestone 3 Visual Guide</span>
            </div>
            <p className="text-[11px] text-indigo-700 leading-relaxed">
              Text shown on this canvas is a visual positioning guide. Precise vector font metrics,
              custom fonts, and auto-shrink scaling are calculated by the backend in Milestone 4.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
