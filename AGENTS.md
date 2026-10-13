# Certificate Studio — Engineering Rules

## Project Objective
Build a reliable, reusable bulk certificate generation application using React, TypeScript, FastAPI, and Python.

## Core Principles
1. Users must never need to edit source code or manually calculate coordinates.
2. Support arbitrary certificate layouts through a visual placement editor.
3. Use automatic detection only when reliable; otherwise request visual confirmation.
4. Preserve the original template's quality and aspect ratio.
5. Use a shared backend layout engine for previews and final exports.
6. Validate every participant before final generation.
7. Never silently discard participant rows.
8. Never silently shrink text below the configured minimum readable size.
9. Never overwrite certificates when participant names are duplicated.
10. Never claim a generated certificate has passed checks that were not actually performed.

## Development Standards
- Use TypeScript for frontend code.
- Use Python type hints and Pydantic models in the backend.
- Separate API routes, business logic, and file processing.
- Avoid hardcoded template coordinates.
- Prefer normalized coordinates for placement.
- Keep processing deterministic where possible.
- Handle errors explicitly.
- Add tests for every critical processing module.
- Never introduce paid services or external AI dependencies without approval.
- Do not implement features beyond the current milestone unless necessary.

## Workflow
Before implementing a milestone:
1. Inspect the existing project.
2. Explain which files will change.
3. Implement the smallest complete solution.
4. Run relevant tests.
5. Report what passed and failed.
6. Provide instructions to verify the feature manually.

Do not claim that a feature works unless it has been tested.

## Security
- Validate all uploaded files.
- Sanitize filenames.
- Limit file sizes and processing resources.
- Keep participant data local by default.
- Exclude generated files, environment secrets, and temporary job data from Git.

## Architecture
Frontend: React, TypeScript, Vite, Tailwind CSS, React Konva.

Backend: FastAPI, Pillow, PyMuPDF, fontTools, standard Python CSV and ZIP libraries.

Testing: pytest and Playwright.

Development must follow the documented milestone plan.