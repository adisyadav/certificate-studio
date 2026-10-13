# Certificate Studio

A local-first, privacy-respecting web application for bulk generating personalized PDF certificates from a template and a CSV file of participant names.

---

## Architecture Overview

Certificate Studio is organized as a clean, decoupled monorepo:

- **`backend/`**: Python FastAPI service providing API endpoints, file ingestion (Pillow, PyMuPDF), font glyph inspection (`fontTools`), deterministic typography fitting, preview rendering, and atomic job storage.
- **`frontend/`**: React 19 application built with TypeScript, Vite, Tailwind CSS, and React Konva for visual coordinate placement.

---

### Current Status: Milestone 7 (Reusable Certificate Templates & Local Presets)

### Key Specifications & Architecture
- **Reusable Local Template Presets (`PresetService`)**:
  - Save configured certificate templates (template image, placement box, font, color, alignment, clearance margins, and sizing mode) under `storage/presets/{preset_id}/`.
  - Stored with atomic metadata writes and zero participant or CSV data retention.
  - Complete independence between presets and temporary jobs (`storage/jobs/`): deleting a job or creating a new project never deletes or mutates the preset.
  - Deleting a preset never deletes jobs or exports created from it.
- **Ingestion Preset Gallery (`SavedTemplates.tsx`)**:
  - Displays saved templates with generated thumbnails, font family, and dimensions directly on the Ingestion tab.
  - "Use Template" action creates an independent new job with restored template, placement, and typography, leaving CSV upload ready for the new batch.
- **Visual Editor Preset Saving**:
  - Secondary "Save Template" action in the Visual Editor toolbar with clean modal dialog.
  - Prevents double submissions and provides immediate feedback.
- **Batch-Aware Revalidation on Reuse**:
  - When a saved template is loaded into a new job, old batch fitting analyses are never stale-reused.
  - A newly uploaded CSV runs fresh batch analysis and validation with the existing Smart / Consistent sizing engine.
- **Dedicated Quality Assurance Pipeline (`ValidationService`)**:
  - Full pre-export batch validation before PDF generation starts.
  - Validates template integrity, participant rows, placement boundary containment, font availability, and glyph support.
  - Categorizes findings into **Passed**, **Warning**, and **Blocking Error**.
  - Guarantees zero silent discards and zero unchecked text overflows.
- **Structural & Visual Output Verification**:
  - Every generated PDF undergoes immediate PyMuPDF structural validation (valid format, exactly 1 page, positive non-zero dimensions, matching aspect ratio, non-blank visual ink).
  - Representative outputs (first, middle, last) undergo automated visual verification comparing PDF rendering against layout expectations.
- **Bounded Concurrency & Export Reliability**:
  - Background export concurrency is bounded via semaphore (`MAX_CONCURRENT_EXPORTS = 2`).
  - Immutable configuration snapshot isolation: captures template, placement, typography, and participant data into `config_snapshot.json` at launch.
  - Changes made in the editor during an active export do not affect that export.
  - Incremental disk-backed processing: prevents memory exhaustion on large batches.
  - Atomic ZIP creation: writes to temporary archive and atomically renames upon verification.
  - Stale export state detection and automatic recovery: reconciles interrupted exports upon restart.
- **Batch-Consistent Typography & Perfect Fit**:
  - Standard/short names are locked to a shared target font size and never enlarged unnaturally.
  - Outlier long names scale down safely without clipping.
  - Concise human feedback: `"{N} names optimized. {C} use the same size, {A} adjusted."`
- **Simplified Export UX**:
  - Readiness banner communicates concise status: *"X participants ready. All names fit."*
  - Clear retry action on failure without corrupting previously completed exports.

### Performance & Benchmark Matrix
Tested using `backend/scripts/benchmark_exports.py` on macOS:

| Batch Size | Total Time | Time / Certificate | Peak Memory | ZIP Size | Throughput |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **20** | 0.40 s | 19.9 ms/cert | 4.06 MB | 0.11 MB | **50.4 cert/s** |
| **100** | 1.60 s | 16.0 ms/cert | 1.29 MB | 0.60 MB | **62.5 cert/s** |
| **500** | 7.85 s | 15.7 ms/cert | 3.24 MB | 3.10 MB | **63.7 cert/s** |

- **Recommended Batch Size**: Up to 1,000 participants per batch on standard hardware.
- **Memory Footprint**: Peak memory remains virtually constant (< 5 MB RAM) due to sequential file streaming and prompt resource disposal.



---

## Prerequisites (macOS)

Ensure you have the following installed on macOS:

1. **Python 3.9+** (Check with `python3 --version`)
2. **Node.js 18+** & **npm** (Check with `node -v` and `npm -v`). If needed, install via Homebrew:
   ```bash
   brew install node
   ```

---

## Quick Setup & Execution

### 1. Backend Setup

Open a terminal and navigate to `backend/`:

```bash
cd backend

# Create a virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

#### Run the Backend Server
```bash
# From within backend/ with venv activated
uvicorn app.main:app --reload --port 8000
```

The API will be available at:
- Health check: `http://localhost:8000/api/health`
- Interactive API Docs: `http://localhost:8000/docs`

#### Run Backend Tests
```bash
# From within backend/ with venv activated
pytest
```

---

### 2. Frontend Setup

Open a separate terminal window and navigate to `frontend/`:

```bash
cd frontend

# Install dependencies
npm install

# (Optional) Verify environment variables
# frontend/.env defaults to VITE_API_BASE_URL=http://localhost:8000
cp -n .env.example .env
```

#### Run Frontend Development Server
```bash
npm run dev
```

The application will be accessible at:
- Web UI: `http://localhost:5173`

#### Run Frontend Unit Tests
```bash
npm test
```

---

## Acceptance Testing: Milestone 4

1. Start both the backend (`http://localhost:8000`) and frontend (`http://localhost:5173`).
2. Open `http://localhost:5173` in your browser.
3. In **Step 1 (Ingestion)**: Upload a certificate template and CSV.
4. Switch to **Step 2 (Visual Editor)**:
   - Position the bounding box in the placement canvas.
   - Choose a calligraphic font (e.g. **Great Vibes** or **Allura**).
   - Change the text color and adjust preferred / minimum font sizes.
   - Click **Save Configuration**.
   - Switch to **"2. Authoritative Backend Preview"** to view the backend-rendered PNG.
   - Switch between **Short Name**, **Long Name**, and actual CSV participants.
   - Click **"Analyze"** in the **Batch Fitting Analysis** card to identify the widest name and check for any overflows.
   - Click on the detected widest name to preview it immediately.
5. **Run Automated Test Suites**:
   - Backend: `pytest -v` (34 tests pass).
   - Frontend: `npm test` (6 tests pass).
   - Frontend build: `npm run build` (0 TypeScript errors).
