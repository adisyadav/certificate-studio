import React, { useEffect, useState } from 'react'
import {
  FileUp,
  TableProperties,
  SlidersHorizontal,
  Download,
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { fetchHealth, type HealthStatus } from './api/client'

export const App: React.FC = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const checkBackendHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchHealth()
      setHealth(data)
      setLastChecked(new Date())
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Unable to connect to the backend server')
      }
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkBackendHealth()
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-200">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-semibold tracking-tight text-slate-900 block leading-tight">
                Certificate Studio
              </span>
              <span className="text-[11px] font-medium tracking-wide text-slate-600 uppercase block">
                Local-First PDF Generator
              </span>
            </div>
          </div>

          {/* Backend Connection Status Badge */}
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                loading
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : health
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              {loading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-500" />
                  <span>Checking backend...</span>
                </>
              ) : health ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>API Connected (v{health.version})</span>
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5 text-rose-500" />
                  <span>API Disconnected</span>
                </>
              )}
            </div>

            <button
              onClick={checkBackendHealth}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors disabled:opacity-50"
              title="Refresh connection status"
              aria-label="Refresh connection"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 flex flex-col justify-between">
        <div>
          {/* Hero Section */}
          <section className="max-w-3xl pt-4 pb-12">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-medium mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Milestone 1 — Architecture & Core Engine Foundation</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900 leading-[1.15] mb-5">
              Bulk certificate generation, engineered for precision.
            </h1>

            <p className="text-lg text-slate-600 leading-relaxed font-normal mb-8 max-w-2xl">
              Design and generate personalized, high-fidelity PDF certificates directly on your
              machine. Visual placement editor, exact typography scaling, and full data privacy.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium shadow-sm hover:bg-slate-800 transition-colors cursor-not-allowed opacity-90">
                <span>Upload Template & CSV</span>
                <span className="text-[11px] uppercase tracking-wider bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                  Upcoming
                </span>
              </div>

              <a
                href="#workflow"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                <span>Explore Workflow</span>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </a>
            </div>
          </section>

          {/* Workflow & Architecture Preview Cards */}
          <section id="workflow" className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="h-10 w-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 mb-4">
                  <FileUp className="h-5 w-5" />
                </div>
                <h2 className="text-base font-semibold text-slate-900 mb-2">1. Template & Data Ingestion</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Upload PDF or raster image certificate templates alongside CSV participant lists.
                  All parsing is processed locally with zero external leaks.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-indigo-500" />
                <span>Zero cloud uploads needed</span>
              </div>
            </div>

            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="h-10 w-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 mb-4">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <h2 className="text-base font-semibold text-slate-900 mb-2">2. Visual Field Placement</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Interactive canvas powered by React Konva allows drag-and-drop coordinate
                  calibration with live font metrics, alignment guides, and auto-shrink constraints.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <TableProperties className="h-4 w-4 text-indigo-500" />
                <span>Deterministic layout engine</span>
              </div>
            </div>

            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="h-10 w-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 mb-4">
                  <Download className="h-5 w-5" />
                </div>
                <h2 className="text-base font-semibold text-slate-900 mb-2">3. Deterministic Generation</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  FastAPI layout backend compiles lossless vector PDF documents with PyMuPDF,
                  handling duplicate names and text overflow gracefully.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-indigo-500" />
                <span>Batch validation & export</span>
              </div>
            </div>
          </section>

          {/* System Diagnostics / Health Status Panel */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">System Integration Status</h3>
                <p className="text-xs text-slate-600">
                  Verification of client-server connectivity for bulk generation services
                </p>
              </div>
              <div className="text-xs text-slate-600 font-mono">
                {lastChecked ? `Checked: ${lastChecked.toLocaleTimeString()}` : 'Not checked'}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="text-xs font-medium text-slate-600 block mb-1">Backend Server</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      health ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  />
                  <span className="text-sm font-semibold text-slate-800">
                    {health ? health.app : 'Offline'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="text-xs font-medium text-slate-600 block mb-1">Health Endpoint</span>
                <span className="text-sm font-mono text-slate-700 block truncate">
                  GET /api/health
                </span>
                <span
                  className={`text-[11px] font-medium block mt-0.5 ${
                    health ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {health ? `Status: ${health.status.toUpperCase()}` : error || 'Connection Error'}
                </span>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80">
                <span className="text-xs font-medium text-slate-600 block mb-1">Architecture State</span>
                <span className="text-sm font-semibold text-slate-800 block">Milestone 1 Ready</span>
                <span className="text-[11px] text-slate-600 block mt-0.5">
                  Frontend & Backend decoupled
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-4">
          <span>Certificate Studio — Local-First PDF Generation</span>
          <span>FastAPI • React • TypeScript • Vite • Tailwind CSS</span>
        </footer>
      </main>
    </div>
  )
}

export default App
