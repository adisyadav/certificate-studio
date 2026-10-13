# Certificate Studio

A local-first, privacy-respecting web application for bulk generating personalized PDF certificates from a template and a CSV file of participant names.

---

## Architecture Overview

Certificate Studio is organized as a clean, decoupled monorepo:

- **`backend/`**: Python FastAPI service providing API endpoints, PDF layout processing (PyMuPDF, Pillow, fontTools), and strict validation.
- **`frontend/`**: React 19 application built with TypeScript, Vite, Tailwind CSS, and React Konva for visual coordinate placement.

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

## Verifying Milestone 1

1. Start both the backend (`http://localhost:8000`) and frontend (`http://localhost:5173`).
2. Visit `http://localhost:5173` in your browser.
3. Observe the **System Integration Status** indicator in the UI:
   - Status badge shows: **API Connected (v0.1.0)**
   - Health endpoint details display: `GET /api/health` with `Status: OK`
4. Run the automated backend test suite:
   ```bash
   cd backend
   venv/bin/pytest
   ```
   Both health check and CORS validation tests should pass.
