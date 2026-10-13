# Certificate Studio

A local-first, privacy-respecting web application for bulk generating personalized PDF certificates from a template and a CSV file of participant names.

---

## Architecture Overview

Certificate Studio is organized as a clean, decoupled monorepo:

- **`backend/`**: Python FastAPI service providing API endpoints, file ingestion (Pillow, PyMuPDF), font glyph inspection (`fontTools`), deterministic typography fitting, preview rendering, and atomic job storage.
- **`frontend/`**: React 19 application built with TypeScript, Vite, Tailwind CSS, and React Konva for visual coordinate placement.

---

## Current Status: Milestone 4.1 (Live WYSIWYG Editor and Placeholder Removal)

### Features Implemented
1. **Live WYSIWYG Single-Canvas Experience**:
   - Eliminated the split between "placement canvas" and "authoritative preview".
   - Immediate frontend typography visualization using bundled TrueType font files loaded via `@font-face` directly inside React Konva.
   - Real-time instant updates on the main certificate canvas when font, size, color, alignment, or participant changes.
   - 250ms debounced background synchronization with the authoritative backend rendering pipeline.
2. **Dual-Region Independent Architecture**:
   - **Name Placement Region**: Bounded box (indigo outline) determining where the new recipient name is rendered and fitted.
   - **Cleanup Region**: Dedicated bounded box (red/dashed outline) marking the placeholder text to be erased on the template.
   - Either region can be toggled as active and adjusted via mouse drag, resize handles, or arrow keys.
3. **Non-Destructive Placeholder Removal Engine (`placeholder_removal_service.py`)**:
   - **Solid Background Fill**: Replaces old text with a uniform background; supports auto-border color sampling or custom HEX color.
   - **OpenCV Telea Inpainting**: Reconstructs parchment and textured backgrounds seamlessly without blur or discoloration (`cv2.INPAINT_TELEA`).
   - **PyMuPDF Vector Text Redaction**: Removes underlying vector text streams cleanly from PDF templates (`page.add_redact_annot`).
   - **Original Preservation**: Original template files are never modified; cleanings are performed non-destructively in-memory and cached per version.
4. **Canvas View Switching**:
   - In-canvas view toggle: `Personalized` (default view with cleaned background + live recipient typography), `Cleaned` (template with erased placeholder), and `Original` (untouched uploaded template).
5. **Session Persistence**:
   - Full recovery of job session, uploaded assets, selected column, placement, cleanup configuration, and typography across page reloads.

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
