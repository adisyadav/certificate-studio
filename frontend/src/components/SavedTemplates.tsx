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
  applyPreset,
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

const PresetThumbnail: React.FC<{ url: string; alt: string; format: string }> = ({
  url,
  alt,
  format,
}) => {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  return (
    <>
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-300">
          <LayoutTemplate className="h-5 w-5" />
        </div>
      )}
      {error ? (
        <div className="flex flex-col items-center justify-center text-slate-400 gap-1 text-[10px]">
          <LayoutTemplate className="h-5 w-5 text-slate-300" />
          <span>No preview</span>
        </div>
      ) : (
        <img
          src={url}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`w-full h-full object-contain transition-opacity duration-150 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading="lazy"
        />
      )}
      <div className="absolute top-1.5 right-1.5">
        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-900/75 text-white">
          {format}
        </span>
      </div>
    </>
  )
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
      const newJob = await applyPreset(presetId)
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
    <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs mb-6">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
        <h2 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
          <LayoutTemplate className="h-3.5 w-3.5 text-slate-700" />
          <span>Saved Templates</span>
          <span className="text-slate-400 font-normal">({presets.length})</span>
        </h2>
        <button
          type="button"
          onClick={loadPresets}
          className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors"
          title="Refresh templates"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {errorMessage && (
        <div className="mb-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {presets.map((preset) => {
          const isCurrentUsing = usingPresetId === preset.preset_id
          const isCurrentDeleting = deletingPresetId === preset.preset_id

          return (
            <div
              key={preset.preset_id}
              className="p-3 rounded-lg border border-slate-200/90 bg-slate-50/40 hover:bg-white hover:border-slate-300 transition-all flex flex-col justify-between group shadow-2xs"
            >
              <div className="space-y-2.5">
                {/* Thumbnail Preview */}
                <div className="h-28 rounded-md bg-white overflow-hidden relative border border-slate-200/70 flex items-center justify-center">
                  <PresetThumbnail
                    url={getPresetThumbnailUrl(preset.thumbnail_url)}
                    alt={preset.name}
                    format={preset.template_meta.format}
                  />
                </div>

                {/* Preset Metadata */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 truncate" title={preset.name}>
                    {preset.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                    <span className="capitalize">{preset.typography.font_id.replace('_', ' ')}</span>
                    <span>•</span>
                    <span>{preset.template_meta.width}×{preset.template_meta.height}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-slate-200/60">
                <button
                  type="button"
                  onClick={() => handleDeletePreset(preset)}
                  disabled={disabled || isCurrentDeleting || isCurrentUsing}
                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
                  title="Delete template"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleUsePreset(preset.preset_id)}
                  disabled={disabled || isCurrentUsing || isCurrentDeleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors disabled:opacity-50 shadow-2xs"
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
