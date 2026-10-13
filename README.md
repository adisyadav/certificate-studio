# Certificate Studio

A local-first, privacy-respecting web application for bulk generating personalized PDF certificates from a template and a CSV file of participant names.

---

## Architecture Overview

Certificate Studio is organized as a clean, decoupled monorepo:

- **`backend/`**: Python FastAPI service providing API endpoints, file ingestion (Pillow, PyMuPDF), CSV parsing, atomic job storage, and PDF layout processing.
- **`frontend/`**: React 19 application built with TypeScript, Vite, Tailwind CSS, and React Konva for visual coordinate placement.

---

## Current Status: Milestone 2 (File Upload and CSV Processing)

### Features Implemented
1. **Template Ingestion**:
   - Accepts PNG, JPG / JPEG, and single-page PDF certificate templates.
   - Rejects encrypted, corrupted, or multipage PDFs with clear error feedback.
   - Decompression-bomb protection via Pillow pixel thresholds.
   - Extracts exact width, height, aspect ratio, and orientation (landscape, portrait, square).
   - Generates browser-compatible PNG preview images while preserving the original template untouched.
2. **CSV Processing**:
   - Supports UTF-8 and UTF-8-BOM encoded CSVs.
   - Detects common participant name headers (`name`, `full_name`, `Participant`, `Student Name`, etc.).
   - Preserves additional CSV columns without discarding them.
   - Interactive column selection fallback when headers are ambiguous.
   - Preserves original name capitalization and 1-based CSV row numbers.
   - Identifies duplicate participant names without discarding them.
   - Explicitly flags blank rows or missing names.
3. **Local Job Management**:
   - Isolated job sessions stored inside `storage/jobs/{job_id}/`.
   - Atomic metadata persistence (`job.json`).
   - Safe preview endpoints protected against directory traversal.
4. **Interactive Upload Workspace**:
   - Drag-and-drop file uploaders with fallback file pickers and keyboard accessibility.
   - Live certificate image preview with format and dimension metrics.
   - Participant preview table with validation badges (valid, duplicate, missing name).
   - Instant file replacement without requiring application restarts.

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

## Verifying Milestone 2

1. Start both the backend (`http://localhost:8000`) and frontend (`http://localhost:5173`).
2. Visit `http://localhost:5173` in your browser.
3. **Test Template Upload**:
   - Drag-and-drop or select a PNG, JPG, or single-page PDF certificate.
   - Confirm that the visual preview renders with exact dimensions, format, and orientation badge.
   - Test uploading a different template to verify seamless replacement.
4. **Test CSV Upload**:
   - Drag-and-drop or select a CSV containing participant names (e.g. `Participant,Email` or `Full Name,Role`).
   - Observe the participant statistics (Total, Valid, Duplicates, Invalid) and the preview table.
   - Use the dropdown to select a different name column and observe the preview table update instantly.
5. **Run the Automated Test Suite**:
   ```bash
   cd backend
   venv/bin/pytest
   ```
   All 17 tests (Milestone 1 health + Milestone 2 upload & validation cases) will pass.
