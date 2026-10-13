import React, { useRef, useState } from 'react'
import {
  FileSpreadsheet,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Copy,
  ChevronDown,
} from 'lucide-react'
import type { CsvSummary, ParticipantRecord } from '../api/client'

interface CsvUploaderProps {
  csvSummary: CsvSummary | null
  participants: ParticipantRecord[]
  onUpload: (file: File) => Promise<void>
  onSelectColumn: (column: string) => Promise<void>
  isUploading: boolean
}

export const CsvUploader: React.FC<CsvUploaderProps> = ({
  csvSummary,
  participants,
  onUpload,
  onSelectColumn,
  isUploading,
}) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isChangingColumn, setIsChangingColumn] = useState(false)
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
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please provide a valid CSV file (.csv format).')
      return
    }

    try {
      await onUpload(file)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to process CSV file.')
      }
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleColumnChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCol = e.target.value
    setIsChangingColumn(true)
    setError(null)
    try {
      await onSelectColumn(newCol)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      }
    } finally {
      setIsChangingColumn(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-slate-100 flex items-center justify-center text-slate-700">
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </div>
            <h3 className="text-xs font-semibold text-slate-900 leading-tight">
              Participant List
            </h3>
          </div>

          {csvSummary && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              <span>{csvSummary.valid_count} names</span>
            </span>
          )}
        </div>

        {error && (
          <div className="mb-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-600" />
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        {csvSummary ? (
          <div className="space-y-3">
            {/* Name Column Selection Dropdown */}
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="name-column-select"
                  className="text-xs font-semibold text-slate-800 shrink-0"
                >
                  Name Column
                </label>
                <div className="relative inline-block min-w-[160px]">
                  <select
                    id="name-column-select"
                    value={csvSummary.selected_name_column || ''}
                    onChange={handleColumnChange}
                    disabled={isChangingColumn}
                    className="w-full appearance-none bg-white border border-slate-200 hover:border-slate-300 rounded-md py-1.5 pl-3 pr-8 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 shadow-2xs"
                  >
                    {csvSummary.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Structured Warnings */}
            {csvSummary.warnings.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
                {csvSummary.warnings.map((warn, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                    <span>{warn}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Participant Preview Table */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-800">
                  Preview ({Math.min(participants.length, 5)} of {csvSummary.valid_count})
                </span>
              </div>
              <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {participants.slice(0, 5).map((p) => (
                      <tr
                        key={p.row_number}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="py-1.5 px-3 font-mono text-slate-400 text-[11px] w-12">
                          #{p.row_number}
                        </td>
                        <td className="py-1.5 px-3 font-medium text-slate-800">
                          {p.name || (
                            <span className="italic text-rose-500 font-normal">
                              [Missing name]
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-[11px] text-right">
                          {p.is_duplicate && (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                              <Copy className="h-3 w-3" />
                              Duplicate
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
              <span className="truncate max-w-[200px]" title={csvSummary.filename}>
                {csvSummary.filename}
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="text-slate-700 hover:text-slate-900 font-medium underline disabled:opacity-50"
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
            aria-label="Upload CSV participant file"
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
                  <FileSpreadsheet className="h-4 w-4" />
                )}
              </div>
              <span className="text-xs font-semibold text-slate-800 mb-1">
                {isUploading ? 'Parsing list...' : 'Upload participant CSV'}
              </span>
              <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                Drag and drop or click to browse. CSV format with name column.
              </p>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="hidden"
          disabled={isUploading}
        />
      </div>
    </div>
  )
}
