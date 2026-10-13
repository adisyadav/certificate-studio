# Certificate Studio

A local-first, privacy-respecting web application for bulk generating personalized PDF certificates from a template and a CSV file of participant names.

---

## Architecture Overview

Certificate Studio is organized as a clean, decoupled monorepo:

- **`backend/`**: Python FastAPI service providing API endpoints, file ingestion (Pillow, PyMuPDF), font glyph inspection (`fontTools`), deterministic typography fitting, preview rendering, and atomic job storage.
- **`frontend/`**: React 19 application built with TypeScript, Vite, Tailwind CSS, and React Konva for visual coordinate placement.

---

## Current Status: Milestone 4 (Typography and Rendering Engine)

### Features Implemented
1. **Font System with Bundled OFL Fonts**:
   - Bundles 5 legally redistributable, open-source fonts with their respective `OFL.txt` licenses:
     - `great_vibes`: Great Vibes (flowing calligraphy)
     - `allura`: Allura (formal script)
     - `alex_brush`: Alex Brush (classic quick script)
     - `cinzel`: Cinzel (classical regal serif)
     - `eb_garamond`: EB Garamond (readable traditional serif)
   - Font glyph coverage validation using `fontTools.ttLib.TTFont` `cmap` inspection.
   - Proactively reports unsupported characters rather than rendering missing-glyph boxes.
2. **Authoritative Typography Engine (`typography_service.py`)**:
   - Precise visual ink bounding box calculation (`draw.textbbox`) accounting for ascenders, descenders, and decorative calligraphic flourishes.
   - Deterministic binary search font fitting between configured `preferred_font_size` and `min_font_size`.
   - Never silently shrinks text below the minimum readable size threshold (`min_font_size`).
   - Centers text horizontally and vertically with safe padding constraints.
   - Distinct coordinate systems: pixels (`px`) for raster templates, standard PDF points (`pt`, 1/72 inch) for vector documents.
3. **Lossless Rendering Engine (`rendering_service.py`)**:
   - Renders participant names onto copies of the original template without modifying stored files.
   - Antialiased high-resolution preview generation for PNG, JPG, and single-page PDF templates.
   - Configurable text color (HEX) and horizontal text alignment (center, left, right).
4. **Batch Typography Analysis (`batch_analysis_service.py`)**:
   - Analyzes all participant records in the CSV:
     - Identifies shortest name, longest name by characters, and widest name by visual rendered width.
     - Detects names requiring automatic font-size reduction.
     - Flags overflowing names that exceed bounds at the minimum font size.
     - Flags names with unsupported glyphs.
   - Invalidation: Modifying placement, template, or typography automatically invalidates previous analysis.
5. **Interactive Dual-Mode Frontend Editor**:
   - Mode 1: Interactive Placement Canvas (React Konva) for dragging and resizing the bounding box.
   - Mode 2: Authoritative Backend Preview displaying the exact font rasterization.
   - Font family dropdown, color picker, preferred and minimum font size sliders, and sample participant selectors.
   - Real-time batch analysis report with one-click preview of the widest participant name.
6. **Session Persistence**:
   - Full recovery of job session, uploaded assets, selected column, placement, and typography across page reloads.

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
