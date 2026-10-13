# Certificate Studio

A local-first, privacy-respecting desktop web application for bulk generating print-ready, personalized PDF certificates from a template and a participant CSV file.

---

## Overview

Certificate Studio provides an intuitive, professional workflow for event organizers, educators, and teams who need to generate beautiful certificates at scale without sending sensitive participant data to cloud servers or writing custom code.

- **Local-First & Private**: All templates, CSV records, and generated PDFs remain strictly on your local device.
- **Visual Drag & Drop Placement**: Interactive, fixed-aspect-ratio canvas with live calligraphic font rendering, stationary viewport, and precision keyboard nudge controls.
- **Batch-Consistent Typography**: Standard and short names share the same target size, while longer outlier names scale down proportionally without clipping or overflowing.
- **Curated Certificate Fonts**: Bundled with 5 high-quality open-source fonts (*Great Vibes*, *Allura*, *Alex Brush*, *Cinzel*, *EB Garamond*).
- **Reusable Template Presets**: Save configured template layouts (boundaries, fonts, colors, and margins) to reuse across future participant batches without repeating setup.
- **Vector-Crisp PDF Export**: Individual personalized single-page PDFs packaged into a verified ZIP archive with bounded memory usage.

---

## Supported File Formats

- **Certificate Templates**: PNG, JPG/JPEG, single-page vector PDF (up to 20 MB).
- **Participant Data**: Standard CSV files (UTF-8 encoded) with header row and name column detection.
- **Export Package**: ZIP archive containing individually named, verified single-page PDF certificates (`Participant_Name.pdf`).

---

## 3-Step Workflow

1. **Upload**: Drop your certificate template and participant CSV list. Review row counts, verify preview thumbnail, and select the recipient name column.
2. **Edit**: Drag and resize the recipient name placement rectangle. Click **Perfect Fit All Names** to optimize batch typography across all participants. Use the **Preview** toggle (`Eye`) to inspect the clean certificate without editing guides.
3. **Export**: Run automatic pre-flight verification, click **Generate Certificates**, and download the final `certificates.zip` package.

---

## Project Structure

```
certificate-studio/
├── AGENTS.md               # Core engineering principles & rules
├── README.md               # Project documentation & setup instructions
├── .gitignore              # Git ignore configuration
├── backend/
│   ├── app/                # FastAPI application
│   │   ├── api/            # REST API endpoints (jobs, typography, export, preset)
│   │   ├── assets/fonts/   # Bundled TrueType fonts & OFL license texts
│   │   ├── schemas/        # Pydantic v2 schemas
│   │   ├── services/       # Core business logic (fitting, PDF generation, ZIP packaging)
│   │   ├── main.py         # Application entry point & CORS configuration
│   │   └── config.py       # Configuration settings
│   ├── requirements.txt    # Clean Python dependencies
│   ├── scripts/            # CLI utilities & benchmark scripts
│   └── tests/              # Backend pytest test suite (73 tests)
├── frontend/
│   ├── src/                # React 19 + TypeScript source
│   │   ├── api/            # Typed backend API client
│   │   ├── components/     # UI components (Upload, Editor, Export, Presets)
│   │   └── utils/          # Coordinates, session, and font loader utilities
│   ├── public/fonts/       # Bundled TrueType fonts for browser canvas
│   ├── package.json        # Node dependencies & npm scripts
│   └── vite.config.ts      # Vite configuration
├── tests/e2e/              # Consolidated Playwright end-to-end browser test
└── test-artifacts/         # Ignored directory for test screenshots & outputs
```

---

## Quickstart

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
Backend API will be available at `http://localhost:8000`. API documentation at `http://localhost:8000/docs`.

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## Running Test Suites

- **Backend Test Suite (73 tests)**:
  ```bash
  PYTHONPATH=backend ./backend/venv/bin/python -m pytest
  ```
- **Frontend Unit Test Suite (31 tests)**:
  ```bash
  cd frontend && npm test
  ```
- **Frontend Production Build**:
  ```bash
  cd frontend && npm run build
  ```
- **End-to-End Playwright Browser Verification**:
  ```bash
  ./backend/venv/bin/python tests/e2e/test_browser_workflow.py
  ```

---

## Font Attribution & Licenses

Certificate Studio bundles five open-source fonts for typography rendering and vector PDF export:

| Font | Category | Designer / Foundry | License |
| :--- | :--- | :--- | :--- |
| **Great Vibes** | Calligraphic Script | TypeSETIT (Robert E. Leuschke) | SIL Open Font License 1.1 |
| **Allura** | Formal Script | TypeSETIT (Robert E. Leuschke) | SIL Open Font License 1.1 |
| **Alex Brush** | Brush Script | TypeSETIT (Robert E. Leuschke) | SIL Open Font License 1.1 |
| **Cinzel** | Classical Serif | Natanael Gama | SIL Open Font License 1.1 |
| **EB Garamond** | Classic Roman Serif | Georg Duffner | SIL Open Font License 1.1 |

Full license texts are preserved in `backend/app/assets/fonts/*-OFL.txt`.

---

## Privacy & Security Guarantees

Certificate Studio is local-first by default:
- No participant names, emails, template images, or generated documents are ever transmitted over external networks or sent to third-party AI APIs.
- All temporary job data and exports are written to local `storage/` directories and excluded from version control.
