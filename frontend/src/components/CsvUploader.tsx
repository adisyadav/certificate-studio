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
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 leading-tight">
                Participant Data (CSV)
              </h3>
              <p className="text-xs text-slate-500">
                UTF-8 or UTF-8-BOM CSV with participant names
              </p>
            </div>
          </div>

          {csvSummary && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-3 w-3" />
              <span>Parsed</span>
            </span>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        {csvSummary ? (
          <div className="space-y-4">
            {/* Participant Statistics Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">Total Rows</span>
                <span className="text-base font-semibold text-slate-900 font-mono">
                  {csvSummary.total_rows}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200/60">
                <span className="text-[11px] text-emerald-700 block">Valid Participants</span>
                <span className="text-base font-semibold text-emerald-800 font-mono">
                  {csvSummary.valid_count}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200/60">
                <span className="text-[11px] text-amber-700 block">Duplicate Names</span>
                <span className="text-base font-semibold text-amber-800 font-mono">
                  {csvSummary.duplicate_count}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-rose-50/70 border border-rose-200/60">
                <span className="text-[11px] text-rose-700 block">Invalid / Empty</span>
                <span className="text-base font-semibold text-rose-800 font-mono">
                  {csvSummary.invalid_count}
                </span>
              </div>
            </div>

            {/* Name Column Selection Dropdown */}
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label
                    htmlFor="name-column-select"
                    className="text-xs font-semibold text-slate-800 block"
                  >
                    Participant Name Column
                  </label>
                  <span className="text-[11px] text-slate-500 block">
                    Choose which column contains the text to be printed
                  </span>
                </div>
                <div className="relative inline-block min-w-[180px]">
                  <select
                    id="name-column-select"
                    value={csvSummary.selected_name_column || ''}
                    onChange={handleColumnChange}
                    disabled={isChangingColumn}
                    className="w-full appearance-none bg-white border border-slate-300 hover:border-slate-400 rounded-md py-1.5 pl-3 pr-8 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs"
                  >
                    {csvSummary.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}{' '}
                        {csvSummary.candidate_name_columns.includes(header)
                          ? '★ (Suggested)'
                          : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Structured Warnings / Alerts */}
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
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-800">
                  Data Preview (First {participants.length} Records)
                </span>
                <span className="text-[11px] text-slate-500">
                  Original row index preserved
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 text-[11px] text-slate-600 uppercase">
                    <tr>
                      <th className="py-2 px-3 w-14 font-medium">Row</th>
                      <th className="py-2 px-3 font-medium">Participant Name</th>
                      <th className="py-2 px-3 font-medium">Status / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {participants.map((p) => (
                      <tr
                        key={p.row_number}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          !p.is_valid
                            ? 'bg-rose-50/40 text-rose-900'
                            : p.is_duplicate
                            ? 'bg-amber-50/30'
                            : ''
                        }`}
                      >
                        <td className="py-1.5 px-3 font-mono text-slate-400 text-[11px]">
                          #{p.row_number}
                        </td>
                        <td className="py-1.5 px-3 font-medium text-slate-800">
                          {p.name ? (
                            p.name
                          ) : (
                            <span className="italic text-rose-500 font-normal">
                              [Missing name]
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-[11px]">
                          {!p.is_valid ? (
                            <span className="inline-flex items-center gap-1 text-rose-600 font-medium">
                              <AlertCircle className="h-3 w-3" />
                              {p.validation_errors.join('; ')}
                            </span>
                          ) : p.is_duplicate ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                              <Copy className="h-3 w-3" />
                              Duplicate Name (will get unique ID)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Valid
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
              <span className="truncate max-w-[220px]" title={csvSummary.filename}>
                📊 {csvSummary.filename}
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
              >
                Upload different CSV
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
                  <FileSpreadsheet className="h-5 w-5" />
                )}
              </div>
              <span className="text-sm font-medium text-slate-800 mb-1">
                {isUploading ? 'Parsing participant list...' : 'Click or drag CSV file here'}
              </span>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                Accepts UTF-8 and UTF-8-BOM CSVs with participant names and optional custom fields.
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
