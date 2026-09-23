# Screen Understanding Agent

Teaching machines to understand graphical interfaces.

This repository contains the Phase 1 vertical slice of a research-oriented screen understanding system. Upload a screenshot, run local inference, inspect OCR and UI-region detections, and export the resulting `ScreenRepresentation` as JSON. The pipeline is deliberately modular so detector, OCR, and semantic models can be benchmarked or replaced later.

## Phase 1 architecture

```text
Screenshot → preprocessing → UI detector → OCR → text association → ScreenRepresentation
```

The detector is a classical computer-vision baseline: it derives candidate regions from image contours, edge density, and layout geometry. It is not a trained model, and its provenance is exposed in the API. No external API is called.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
brew install tesseract  # macOS, if not already installed
uvicorn backend.main:app --reload
```

Open http://127.0.0.1:8000 and upload a PNG, JPG, or WEBP screenshot.

## API

- `POST /api/screens` — upload a screenshot.
- `POST /api/screens/{id}/analyze` — run local Phase 1 inference.
- `GET /api/screens/{id}` — return the structured representation.
- `GET /api/screens/{id}/image` — serve the original screenshot.
- `GET /api/health` — report configured providers.
- `POST /api/screens/{id}/query` — ground a natural-language question to an existing element.

## Current limitations

The baseline detector is classical computer vision, not a trained UI detector. Tesseract must be installed locally for OCR; without it the UI reports OCR as unavailable. Semantic screen type and natural-language question answering are intentionally deferred to Phase 2. Local filesystem storage is used for this milestone.

## Phase 2

Phase 2 now includes a local grounding baseline and question panel. It scores existing detected elements using visible OCR text, element type, interactive state, action affordances, and intent synonyms. It never invents coordinates. A VLM-based provider can be compared against this baseline later.

Example query:

```json
{"question":"Which button completes the purchase?"}
```

The response includes `answer`, `element_id`, normalized `bbox`, confidence, and evidence.

Provider interfaces live under `backend/services/providers.py`; schemas are in `backend/schemas.py`; geometry utilities are in `backend/core/geometry.py`.

## Cloudflare Pages demo

The static frontend is also deployable to Cloudflare Pages. In hosted mode, if the FastAPI API is unavailable, the browser runs Tesseract.js OCR locally and uses a transparent text-affordance baseline for demonstration. The full OpenCV/Tesseract backend remains the recommended local/research mode.

Live demo: https://screen-understanding-agent.pages.dev

Custom domain path: https://abdulhabeeb.com/projects/screenunderstand/
