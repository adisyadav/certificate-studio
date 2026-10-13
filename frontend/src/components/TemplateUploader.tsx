import React, { useRef, useState, useEffect } from 'react'
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
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [imageRetryCount, setImageRetryCount] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset image state when template preview_url changes
  useEffect(() => {
    setImageLoaded(false)
    setImageError(false)
  }, [template?.preview_url])

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
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-slate-100 flex items-center justify-center text-slate-700">
              <ImageIcon className="h-3.5 w-3.5" />
            </div>
            <h3 className="text-xs font-semibold text-slate-900 leading-tight">
              Certificate Template
            </h3>
          </div>

          {template && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              <span>{imageLoaded ? 'Ready' : 'Uploaded'}</span>
            </span>
          )}
        </div>

        {error && (
          <div className="mb-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-600" />
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        {template ? (
          <div className="space-y-3">
            {/* Visual Preview Container */}
            <div className="relative h-44 rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden flex items-center justify-center group">
              {!imageLoaded && !imageError && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-400 text-xs gap-1.5 z-5">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-600" />
                  <span>Loading preview...</span>
                </div>
              )}

              {imageError ? (
                <div className="flex flex-col items-center justify-center p-4 text-center text-xs text-slate-500 gap-1.5">
                  <AlertCircle className="h-5 w-5 text-slate-400" />
                  <span className="font-medium text-slate-700">Preview currently unavailable</span>
                  <button
                    type="button"
                    onClick={() => {
                      setImageError(false)
                      setImageRetryCount((c) => c + 1)
                    }}
                    className="text-[11px] text-slate-900 underline hover:text-slate-700 font-medium"
                  >
                    Retry loading
                  </button>
                </div>
              ) : (
                <img
                  src={getTemplatePreviewUrl(template.preview_url, imageRetryCount || undefined)}
                  alt="Certificate template preview"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => {
                    setImageError(true)
                    setImageLoaded(false)
                  }}
                  className={`max-h-full max-w-full object-contain transition-opacity duration-200 ${
                    imageLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              )}

              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-md bg-white text-slate-800 text-xs font-medium shadow-xs hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-slate-600" />
                  <span>Replace File</span>
                </button>
              </div>
            </div>

            {/* Compact Template Summary */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <div className="flex items-center gap-2 truncate">
                <span className="font-medium text-slate-800 truncate" title={template.filename}>
                  {template.filename}
                </span>
                <span className="text-[11px] text-slate-400 shrink-0">
                  {template.width}×{template.height} • {formatFileSize(template.file_size_bytes)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="text-slate-700 hover:text-slate-900 font-medium underline disabled:opacity-50 text-[11px] shrink-0 ml-2"
              >
                Change
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
            className={`border border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
              isDragOver
                ? 'border-slate-800 bg-slate-50'
                : 'border-slate-300 hover:border-slate-400 bg-slate-50/30'
            }`}
          >
            <div className="flex flex-col items-center justify-center">
              <div className="h-10 w-10 rounded-full bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-slate-600 mb-3">
                {isUploading ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-slate-800" />
                ) : (
                  <FileUp className="h-4 w-4" />
                )}
              </div>
              <span className="text-xs font-semibold text-slate-800 mb-1">
                {isUploading ? 'Uploading...' : 'Upload certificate template'}
              </span>
              <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                Drag and drop or click to browse. PNG, JPG, or PDF up to 20MB.
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
