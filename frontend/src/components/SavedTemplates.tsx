import React, { useState, useEffect } from 'react'
import {
  Trash2,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  LayoutTemplate,
} from 'lucide-react'
import {
  fetchPresets,
  usePreset,
  deletePreset,
  getPresetThumbnailUrl,
  type PresetMetadata,
  type JobResponse,
  ApiError,
} from '../api/client'

interface SavedTemplatesProps {
  onSelectPreset: (job: JobResponse) => void
  disabled?: boolean
}

export const SavedTemplates: React.FC<SavedTemplatesProps> = ({
  onSelectPreset,
  disabled = false,
}) => {
  const [presets, setPresets] = useState<PresetMetadata[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [usingPresetId, setUsingPresetId] = useState<string | null>(null)
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadPresets = async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const list = await fetchPresets()
      setPresets(list)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage('Failed to load saved templates.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPresets()
  }, [])

  const handleUsePreset = async (presetId: string) => {
    setUsingPresetId(presetId)
    setErrorMessage(null)
    try {
      const newJob = await usePreset(presetId)
      onSelectPreset(newJob)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage('Failed to initialize project from saved template.')
      }
    } finally {
      setUsingPresetId(null)
    }
  }

  const handleDeletePreset = async (preset: PresetMetadata) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete preset "${preset.name}"? This cannot be undone.`
    )
    if (!confirmed) return

    setDeletingPresetId(preset.preset_id)
    setErrorMessage(null)
    try {
      await deletePreset(preset.preset_id)
      setPresets((prev) => prev.filter((p) => p.preset_id !== preset.preset_id))
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage('Failed to delete template preset.')
      }
    } finally {
      setDeletingPresetId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 rounded-xl border border-slate-200 bg-white/60 flex items-center justify-center gap-2 text-xs text-slate-500">
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-600" />
        <span>Loading saved templates...</span>
      </div>
    )
  }

  if (presets.length === 0) {
    return null // Only show section when saved templates exist
  }

  return (
    <section className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/40 via-white to-slate-50 p-5 shadow-xs mb-8">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-indigo-100/60">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4 text-indigo-600" />
          <h2 className="text-xs font-semibold text-slate-900">
            Saved Certificate Templates ({presets.length})
          </h2>
          <span className="text-[10px] font-medium text-indigo-700 bg-indigo-100/60 px-2 py-0.5 rounded-full">
            Ready to Reuse
          </span>
        </div>
        <button
          type="button"
          onClick={loadPresets}
          className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors"
          title="Refresh presets"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {errorMessage && (
        <div className="mb-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {presets.map((preset) => {
          const isCurrentUsing = usingPresetId === preset.preset_id
          const isCurrentDeleting = deletingPresetId === preset.preset_id

          return (
            <div
              key={preset.preset_id}
              className="p-3 rounded-lg border border-slate-200 bg-white hover:border-indigo-300 transition-all flex flex-col justify-between shadow-2xs group"
            >
              <div className="space-y-2">
                {/* Thumbnail Preview */}
                <div className="h-28 rounded-md bg-slate-100 overflow-hidden relative border border-slate-100 flex items-center justify-center">
                  <img
                    src={getPresetThumbnailUrl(preset.thumbnail_url)}
                    alt={preset.name}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-black/60 text-white backdrop-blur-xs">
                      {preset.template_meta.format}
                    </span>
                  </div>
                </div>

                {/* Preset Metadata */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 truncate" title={preset.name}>
                    {preset.name}
                  </h3>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                    <span className="capitalize">{preset.typography.font_id.replace('_', ' ')}</span>
                    <span>•</span>
                    <span>{preset.template_meta.width}×{preset.template_meta.height}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleDeletePreset(preset)}
                  disabled={disabled || isCurrentDeleting || isCurrentUsing}
                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
                  title="Delete preset"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleUsePreset(preset.preset_id)}
                  disabled={disabled || isCurrentUsing || isCurrentDeleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold transition-colors disabled:opacity-50 shadow-2xs"
                >
                  {isCurrentUsing ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <>
                      <span>Use Template</span>
                      <ArrowRight className="h-3 w-3" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
