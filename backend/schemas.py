from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field

ElementType = Literal["button", "text", "text_input", "search_box", "checkbox", "radio", "toggle", "dropdown", "tab", "link", "image", "icon", "card", "list_item", "table", "slider", "progress", "container", "unknown"]


class BoundingBox(BaseModel):
    """Normalized xyxy coordinates in [0, 1]."""
    x1: float = Field(ge=0, le=1)
    y1: float = Field(ge=0, le=1)
    x2: float = Field(ge=0, le=1)
    y2: float = Field(ge=0, le=1)

    def as_list(self) -> list[float]:
        return [self.x1, self.y1, self.x2, self.y2]


class UIElement(BaseModel):
    id: str
    type: ElementType
    bbox: BoundingBox
    confidence: float = Field(ge=0, le=1)
    text: str = ""
    interactive: bool = False
    state: str = "unknown"
    possible_actions: list[str] = []
    source: str = "cv_baseline"


class TextRegion(BaseModel):
    text: str
    bbox: BoundingBox
    confidence: float = Field(ge=0, le=1)


class Relationship(BaseModel):
    source_id: str
    relation: str
    target_id: str
    confidence: float = Field(ge=0, le=1)


class PipelineStage(BaseModel):
    name: str
    status: str
    duration_ms: float = 0
    detail: str = ""


class ScreenRepresentation(BaseModel):
    screen_id: str
    filename: str
    width: int
    height: int
    screen_type: str = "unknown"
    description: str = "Phase 1 local analysis of a graphical interface screenshot."
    elements: list[UIElement] = []
    text_regions: list[TextRegion] = []
    relationships: list[Relationship] = []
    current_state: dict[str, Any] = {}
    available_actions: list[str] = []
    pipeline: list[PipelineStage] = []
    providers: dict[str, str] = {}
    analyzed_at: str | None = None


class QueryRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500)


class GroundingResult(BaseModel):
    answer: str
    element_id: str | None = None
    bbox: BoundingBox | None = None
    confidence: float = Field(ge=0, le=1)
    evidence: list[str] = []
    provider: str = "local_grounding_baseline"
