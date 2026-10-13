import React, { useRef, useState } from 'react'
import {
  FileUp,
  Image as ImageIcon,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { type TemplateMetadata, getTemplatePreviewUrl } from '../api/client'

interface TemplateUploaderProps {
  template: TemplateMetadata | null
  onUpload: (file: File) => Promise<void>
  isUploading: boolean
}

export const TemplateUploader: React.FC<TemplateUploaderProps> = ({
  template,
  onUpload,
  isUploading,
}) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    setError(null)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      await processFile(file)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      await processFile(file)
    }
  }

  const processFile = async (file: File) => {
    const validExtensions = ['.png', '.jpg', '.jpeg', '.pdf']
    const hasValidExt = validExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    )

    if (!hasValidExt) {
      setError('Please provide a PNG, JPG, or single-page PDF certificate.')
      return
    }

    try {
      await onUpload(file)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to upload template file.')
      }
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <ImageIcon className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 leading-tight">
                Certificate Template
              </h3>
              <p className="text-xs text-slate-500">
                PNG, JPG, or single-page PDF (up to 20MB)
              </p>
            </div>
          </div>

          {template && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-3 w-3" />
              <span>Loaded</span>
            </span>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        {template ? (
          <div className="space-y-4">
            {/* Visual Preview Container */}
            <div className="relative aspect-video rounded-lg border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center group">
              <img
                src={getTemplatePreviewUrl(template.preview_url)}
                alt="Certificate template preview"
                className="max-h-full max-w-full object-contain shadow-xs"
              />
              <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-md bg-white text-slate-800 text-xs font-medium shadow-sm hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Replace Template</span>
                </button>
              </div>
            </div>

            {/* Template Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">Format</span>
                <span className="font-semibold text-slate-800 uppercase font-mono">
                  {template.format}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">Dimensions</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {template.width} × {template.height}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">Aspect Ratio</span>
                <span className="font-semibold text-slate-800 capitalize">
                  {template.orientation} ({template.aspect_ratio})
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">File Size</span>
                <span className="font-semibold text-slate-800">
                  {formatFileSize(template.file_size_bytes)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
              <span className="truncate max-w-[220px]" title={template.filename}>
                📄 {template.filename}
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
              >
                Upload different template
              </button>
            </div>
          </div>
        ) : (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            tabIndex={0}
            role="button"
            aria-label="Upload certificate template"
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              isDragOver
                ? 'border-indigo-500 bg-indigo-50/50'
                : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
            }`}
          >
            <div className="flex flex-col items-center justify-center">
              <div className="h-12 w-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 mb-3">
                {isUploading ? (
                  <RefreshCw className="h-5 w-5 animate-spin text-indigo-600" />
                ) : (
                  <FileUp className="h-5 w-5" />
                )}
              </div>
              <span className="text-sm font-medium text-slate-800 mb-1">
                {isUploading
                  ? 'Processing template...'
                  : 'Click or drag certificate template here'}
              </span>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                Accepts high-res PNG, JPG or single-page PDF. Quality and aspect ratio are preserved losslessly.
              </p>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.pdf"
          onChange={handleFileChange}
          className="hidden"
          disabled={isUploading}
        />
      </div>
    </div>
  )
}
