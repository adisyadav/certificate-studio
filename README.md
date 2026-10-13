# Certificate Studio

A local-first, privacy-respecting web application for bulk generating personalized PDF certificates from a template and a CSV file of participant names.

---

## Architecture Overview

Certificate Studio is organized as a clean, decoupled monorepo:

- **`backend/`**: Python FastAPI service providing API endpoints, file ingestion (Pillow, PyMuPDF), CSV parsing, normalized placement validation, and atomic job storage.
- **`frontend/`**: React 19 application built with TypeScript, Vite, Tailwind CSS, and React Konva for visual coordinate placement.

---

## Current Status: Milestone 3 (Interactive Certificate Editor)

### Features Implemented
1. **Interactive Visual Placement Editor (React Konva)**:
   - Visual certificate canvas preserving original template aspect ratio (landscape, portrait, and square).
   - Allows users to drag-and-drop or click-and-drag to select the recipient-name bounding box.
   - Resize handles with boundary-constrained transformation.
   - Non-draggable certificate background preventing accidental displacement.
   - Keyboard accessibility: Arrow keys nudge placement, Shift+Arrow expands step size.
   - Live sample text positioning preview with instant toggle between Short name ("Jane Doe"), Long name ("Dr. Alexander Montgomery-Cunningham III"), and actual CSV participants.
2. **Normalized Coordinate System**:
   - Stores coordinates strictly normalized between `0.0` and `1.0`:
     ```json
     {
       "x": 0.25,
       "y": 0.45,
       "width": 0.50,
       "height": 0.12
     }
     ```
   - Immune to browser window resizing, display scaling, and high-DPI screens.
3. **Placement API & Atomic Persistence**:
   - `POST /api/jobs/{job_id}/placement`: Validates boundaries (`x + width <= 1.0`, `y + height <= 1.0`, `width > 0`, `height > 0`).
   - `GET /api/jobs/{job_id}/placement`: Retrieves saved placement.
   - Atomic persistence inside `storage/jobs/{job_id}/job.json`.
   - **Template Replacement Invalidation**: Uploading a new template automatically clears previous placement to prevent mismatched layout coordinates.
4. **Ingestion & Processing (from Milestones 1 & 2)**:
   - High-fidelity template ingestion (PNG, JPG, single-page PDF) with PyMuPDF and Pillow.
   - CSV parsing with UTF-8 / UTF-8-BOM support, candidate name column detection, duplicate tracking, and blank row validation.

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

---

## Verifying Milestone 3 Manually

1. Start both the backend (`http://localhost:8000`) and frontend (`http://localhost:5173`).
2. Open `http://localhost:5173` in your browser.
3. In **Step 1 (Ingestion)**:
   - Upload a certificate template (PNG, JPG, or PDF) and a participant CSV.
4. Click **"Open Visual Editor"** or switch to the **"2. Visual Editor"** tab:
   - Observe the certificate canvas rendered with the correct aspect ratio.
   - Click and drag or use the resize handles on the bounding box to reposition the name area.
   - Use the sample text radio buttons to toggle between **Short Name**, **Long Name**, and **CSV Participant**.
   - Use Arrow keys on your keyboard to test fine-tuned keyboard adjustments.
   - Click **Save Placement** and verify the "Placement Saved" indicator appears.
5. **Persistence & Resilience**:
   - Refresh the browser page (`Cmd + R`); observe that the saved placement restores automatically.
   - Resize your browser window; observe that the placement box and certificate remain aligned without drift.
   - Return to Ingestion, upload a new template, and verify that previous placement is cleared.
6. **Run Automated Tests**:
   ```bash
   cd backend
   venv/bin/pytest -v
   ```
   All 23 unit & integration tests will pass.
