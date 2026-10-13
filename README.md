# Certificate Studio

A local-first, privacy-respecting web application for bulk generating personalized PDF certificates from a template and a CSV file of participant names.

---

## Architecture Overview

Certificate Studio is organized as a clean, decoupled monorepo:

- **`backend/`**: Python FastAPI service providing API endpoints, file ingestion (Pillow, PyMuPDF), font glyph inspection (`fontTools`), deterministic typography fitting, preview rendering, and atomic job storage.
- **`frontend/`**: React 19 application built with TypeScript, Vite, Tailwind CSS, and React Konva for visual coordinate placement.

---

## Current Status: Milestone 5.3 (Simplified Editor UX and Font Reliability)

### Key Specifications & Architecture
- **Reliable Programmatic Font Loading**:
  - Implemented `fontLoader.ts` with explicit `FontFace` loading and `document.fonts.load()` fallback.
  - Added HTML font preloading tags in `index.html` and `font-display: swap` in `index.css`.
  - Invalidate Konva canvas measurement caches on font load to completely eliminate silent font fallbacks to serif/sans-serif.
  - Verified appearance of all five bundled certificate fonts (Great Vibes, Allura, Alex Brush, Cinzel, EB Garamond).
- **Streamlined Visual Editor**:
  - **One Rectangle Only**: Removed the distracting inner green safe guide and toggle button. The single blue dashed rectangle with handles represents the recipient area.
  - Internal glyph containment and safe-margin calculations (8% vertical, 4% horizontal) remain active under the hood.
  - **Default Visible Controls**:
    - Certificate Font selector with live loading feedback.
    - Text Color and Alignment.
    - Participant Preview selector (Shortest, Longest, Widest chips + full CSV dropdown).
    - **"Perfect Fit"** primary action button.
    - Save & Continue actions.
  - **Collapsed Advanced Settings**: Sliders for font sizes and margins are neatly tucked inside an optional accordion (closed by default).
- **"Perfect Fit" Action & Automatic Initial Fitting**:
  - Replaced separate Auto Fit and Analyze buttons with one primary "Perfect Fit" action.
  - On first arrival to the visual editor, runs an initial automatic fit in the background so names fit out of the box without requiring manual button clicks.
  - Generates clear, human-friendly feedback (e.g. *"All 20 names fit perfectly"* or *"2 names need more space. Widen the name area slightly"*).
- **Preserved Export Fidelity**:
  - 100% layout and font consistency between editor preview and generated PDFs in `certificates.zip`.
- **Self-Sufficient Pre-Flight Readiness in Export Workspace**:
  - Automatically checks readiness and verifies all participant layouts upon entering Step 3 (Generate & Download) if analysis is missing or stale.
  - Eliminates the confusing requirement for users to manually click Analyze as an arbitrary prerequisite.
  - Shows clear, actionable statuses:
    - **Checking certificate readiness...** (with progress indicator)
    - **Ready to generate!** (enables the Generate Certificates button)
    - **Validation Failed** (displays specific overflow counts with one-click "Adjust in Editor")
    - **Connection Error / Retry** (actionable retry buttons)
- **Editor-to-Export Synchronization**:
  - Immediate state synchronization between `CertificateEditor` and `App.tsx` via `onBatchAnalysisUpdated`.
  - Fresh job state retrieval on tab transition ensures zero stale React closures or props.
- **Three-Step Production Workflow**:
  1. **Ingestion**: Template validation (PNG, JPG, single-page PDF) and participant CSV parsing with automatic name-column detection.
  2. **Visual Editor**: Interactive single-box placement, 5 bundled fonts, live font fitting, baseline centering, and one-click "Auto Fit All Names".
  3. **Generate & Download**: Pre-flight validation, live progress tracking, verified single-page PDF generation per participant, and atomic ZIP archive packaging.
- **Shared Typography & Layout Engine**:
  - Reuses the authoritative layout engine (`TypographyService.calculate_layout()`) for final PDF generation.
  - Ensures 100% visual consistency between on-screen previews and exported PDFs.
  - Individually calculates the optimal font size for every participant name; never reuses the size from the last editor preview.
- **Single-Page PDF Generation (`PDFService`) & Atomic ZIP Export (`ZipService`)**:
  - High-resolution raster (PNG/JPG) and vector PDF template overlays.
  - PyMuPDF structural and page-dimension validation on every certificate.
  - Unique, sanitized filenames with duplicate handling (e.g., `Aarav Sharma.pdf`, `Aarav Sharma (2).pdf`).
  - Machine-readable `generation_report.json` included in `certificates.zip`.



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
