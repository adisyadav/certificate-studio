# Certificate Studio

A local-first, privacy-respecting desktop web application for bulk generating print-ready personalized PDF certificates from a template and a participant CSV file.

---

## Overview

Certificate Studio provides an intuitive, professional workflow for event organizers, educators, and teams who need to generate beautiful certificates at scale without sending sensitive participant data to cloud servers or writing custom code.

- **Local-first & Private**: All templates, CSV records, and generated PDFs remain strictly on your local machine.
- **Visual Drag & Drop Placement**: Interactive, fixed-aspect-ratio canvas with live font previews and nudge controls.
- **Batch-Consistent Typography**: Standard and short names share the same target size, while longer outlier names scale down proportionally without clipping or overflowing.
- **Curated Calligraphic & Serif Fonts**: Bundled with 5 high-quality open-source fonts (*Great Vibes*, *Allura*, *Alex Brush*, *Cinzel*, *EB Garamond*).
- **Reusable Template Presets**: Save configured template layouts (boundaries, fonts, colors, and margins) to reuse across future participant batches.
- **Vector-Crisp PDF Export**: Individual personalized single-page PDFs packaged into a verified ZIP archive with bounded memory usage.

---

## 3-Step Workflow

1. **Upload**: Drop your certificate template (PNG, JPG, or single-page PDF) and participant CSV. Review row counts and select the recipient name column.
2. **Edit**: Drag and resize the name placement rectangle. Click **Perfect Fit All Names** to optimize typography across all recipients. Toggle **Preview** to inspect the clean certificate without editing guides.
3. **Export**: Run automatic pre-flight verification, click **Generate Certificates**, and download the final `certificates.zip` package.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, React Konva, Lucide Icons.
- **Backend**: Python 3.9+, FastAPI, Pillow, PyMuPDF, fontTools, Pydantic.
- **Testing**: pytest (backend), Vitest (frontend unit), Playwright (browser verification).

---

## Getting Started

### 1. Prerequisites
- **Python 3.9+** (`python3 --version`)
- **Node.js 18+** & **npm** (`node -v`)

### 2. Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Backend API will be available at `http://localhost:8000`.

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## Running Test Suites

- **Backend Tests (73 tests)**:
  ```bash
  PYTHONPATH=backend ./backend/venv/bin/python -m pytest
  ```
- **Frontend Tests (25 tests)**:
  ```bash
  cd frontend && npm test
  ```
- **Frontend Production Build**:
  ```bash
  cd frontend && npm run build
  ```
- **End-to-End Playwright Verification**:
  ```bash
  ./backend/venv/bin/python verify_milestone8.py
  ```

---

## Privacy & Security

Certificate Studio is local by default. No participant names, emails, template images, or generated documents are ever uploaded to external servers, cloud APIs, or paid AI services.
