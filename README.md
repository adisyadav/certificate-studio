# Certificate Studio

A local-first, privacy-respecting web application for bulk generating personalized PDF certificates from a template and a CSV file of participant names.

---

## Architecture Overview

Certificate Studio is organized as a clean, decoupled monorepo:

- **`backend/`**: Python FastAPI service providing API endpoints, file ingestion (Pillow, PyMuPDF), font glyph inspection (`fontTools`), deterministic typography fitting, preview rendering, and atomic job storage.
- **`frontend/`**: React 19 application built with TypeScript, Vite, Tailwind CSS, and React Konva for visual coordinate placement.

---

## Current Status: Milestone 5 (Production-Quality Batch PDF Generation & ZIP Export)

### Key Specifications & Architecture
- **Three-Step Production Workflow**:
  1. **Ingestion**: Template validation (PNG, JPG, single-page PDF) and participant CSV parsing with automatic name-column detection.
  2. **Visual Editor**: Interactive single-box placement, 5 bundled fonts, live font fitting, baseline centering, and one-click "Auto Fit All Names".
  3. **Generate & Download**: Pre-flight validation, live progress tracking, verified single-page PDF generation per participant, and atomic ZIP archive packaging.
- **Shared Typography & Layout Engine**:
  - Reuses the authoritative layout engine (`TypographyService.calculate_layout()`) for final PDF generation.
  - Ensures 100% visual consistency between on-screen previews and exported PDFs.
  - Individually calculates the optimal font size for every participant name; never reuses the size from the last editor preview.
- **Single-Page PDF Generation (`PDFService`)**:
  - **Raster Templates (PNG/JPG)**: Renders full-resolution image with exact Pillow text coordinates and exports to PDF with verified page bounds and resolution.
  - **Vector PDF Templates**: Preserves original PDF page dimensions, vector lines, and text using PyMuPDF transparent overlays.
  - Strictly verifies every generated PDF (opens with PyMuPDF, verifies exactly 1 page, confirms non-empty content and valid dimensions).
- **Safe Filename Generation (`FilenameGenerator`)**:
  - Sanitizes participant names into clean, OS-compliant filenames across macOS, Windows, and Linux.
  - Prevents path traversal and removes unsafe characters.
  - Resolves duplicate participant names deterministically (e.g. `Aarav Sharma.pdf`, `Aarav Sharma (2).pdf`).
- **Atomic ZIP Archive Packaging (`ZipService`)**:
  - Packages verified PDFs and a machine-readable `generation_report.json` into `certificates.zip`.
  - Verifies ZIP integrity before publication.
- **Session Persistence & Safety**:
  - Maintains active session state across all 3 steps on page reload.
  - Prohibits export if any participants have blocking overflow errors.


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
