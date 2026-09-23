from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from PIL import Image

from backend.core.geometry import spatial_relationships
from backend.schemas import PipelineStage, ScreenRepresentation
from .providers import UIElementDetector, TesseractOCR, associate_text


class ScreenPipeline:
    def __init__(self) -> None:
        self.detector = UIElementDetector()
        self.ocr = TesseractOCR()

    def analyze(self, screen_id: str, filename: str, path: Path) -> ScreenRepresentation:
        image = Image.open(path).convert("RGB")
        stages = []
        start = perf_counter()
        elements = self.detector.detect(image)
        stages.append(PipelineStage(name="UI detector", status="complete", duration_ms=round((perf_counter()-start)*1000, 2), detail=f"{len(elements)} candidate regions; CV baseline"))
        start = perf_counter()
        text_regions = self.ocr.extract(image)
        stages.append(PipelineStage(name="OCR", status="complete" if self.ocr.available else "unavailable", duration_ms=round((perf_counter()-start)*1000, 2), detail="Tesseract local provider" if self.ocr.available else "Install Tesseract to enable OCR"))
        associate_text(elements, text_regions)
        rels = spatial_relationships([e.model_dump() | {"bbox": e.bbox.as_list()} for e in elements])
        stages.append(PipelineStage(name="Representation", status="complete", duration_ms=round((perf_counter()-start)*1000, 2), detail=f"{len(rels)} spatial relationships"))
        interactive = sum(e.interactive for e in elements)
        return ScreenRepresentation(screen_id=screen_id, filename=filename, width=image.width, height=image.height, elements=elements, text_regions=text_regions, relationships=rels, available_actions=["click", "type", "scroll"] if interactive else ["scroll"], current_state={"interactive_elements": interactive, "ocr_regions": len(text_regions)}, pipeline=stages, providers={"detector": self.detector.name, "ocr": self.ocr.name if self.ocr.available else "unavailable"}, analyzed_at=datetime.now(timezone.utc).isoformat())
