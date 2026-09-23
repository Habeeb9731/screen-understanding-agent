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

## Current limitations

The baseline detector is classical computer vision, not a trained UI detector. Tesseract must be installed locally for OCR; without it the UI reports OCR as unavailable. Semantic screen type and natural-language question answering are intentionally deferred to Phase 2. Local filesystem storage is used for this milestone.

## Phase 2

Add a replaceable grounding interface and `/api/screens/{id}/query`, then compare detector + OCR grounding against a vision-language baseline. After that, add annotation export and a benchmark harness for IoU, OCR error rates, and latency.

Provider interfaces live under `backend/services/providers.py`; schemas are in `backend/schemas.py`; geometry utilities are in `backend/core/geometry.py`.
