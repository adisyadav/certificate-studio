# Certificate Studio

A local-first, privacy-respecting web application for bulk generating personalized PDF certificates from a template and a CSV file of participant names.

---

## Architecture Overview

Certificate Studio is organized as a clean, decoupled monorepo:

- **`backend/`**: Python FastAPI service providing API endpoints, file ingestion (Pillow, PyMuPDF), font glyph inspection (`fontTools`), deterministic typography fitting, preview rendering, and atomic job storage.
- **`frontend/`**: React 19 application built with TypeScript, Vite, Tailwind CSS, and React Konva for visual coordinate placement.

---

## Current Status: Milestone 4.2 (Complete Editor Stabilization & Intelligent Auto-Fit)

### Key Specifications & Architecture
- **V1 Template Requirement**: V1 requires certificate templates with an **EMPTY/BLANK recipient-name area**. All placeholder-removal and cleanup mechanisms have been cleanly removed to eliminate unnecessary complexity.
- **Fixed-Aspect-Ratio Stationary Viewport**:
  - The certificate canvas is completely stationary. Zero vertical jumping, zero viewport collapse, zero reflow during participant switching or typography adjustments.
  - Image instance and canvas boundaries are preserved across font, size, color, and participant changes.
  - Asynchronous loading and layout calculation indicators are rendered as non-disruptive, fixed-height overlays.
- **Intelligent Automatic Font Fitting**:
  - Enabled by default for all participants.
  - Deterministic binary-search font fitting finds the largest readable size that fits strictly within placement box width and height constraints.
  - Automatically downsizes long names (e.g. from 64px to 38px) while rendering short names at preferred size.
  - Never truncates or clips names, and never shrinks below the configured minimum readable size (`min_font_size`).
- **Typographic Baseline Consistency**:
  - Center alignment shares identical horizontal and vertical anchor positions across all names.
  - Font EM ascender/descender metric centering prevents ascenders or descenders (like 'y', 'g', 'j') from vertically displacing names.
- **Lightweight Authoritative Layout API**:
  - `GET /api/jobs/{job_id}/layout` computes fitted font size, bounding boxes, and fitting warnings without requiring full image rasterization.
- **Session Persistence, New Project & Session Reset**:
  - Automatically recovers active job ID, uploaded template, participant CSV, placement coordinates, and typography preferences across browser refreshes.
  - Prominent "New Project" header action enables users to intentionally start a fresh project at any time.
  - Confirms with the user before clearing workspace if files or placement exist.
  - Generates a distinct backend job session, updates browser `localStorage`, resets view to Ingestion tab, and shows a fresh empty workspace.
  - Preserves previous jobs and uploaded assets on the backend without deletion.
  - Allows seamless replacement of certificate templates via "Upload different template".
  - Safely ignores legacy cleanup fields in older job records without data corruption.

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
