from backend.services.grounding import answer_query
from backend.schemas import BoundingBox, ScreenRepresentation, UIElement


def test_grounding_returns_existing_element():
    screen = ScreenRepresentation(
        screen_id="test", filename="screen.png", width=100, height=100,
        elements=[UIElement(id="element_001", type="button", text="Place order", bbox=BoundingBox(x1=.7, y1=.7, x2=.9, y2=.9), confidence=.8, interactive=True, state="enabled", possible_actions=["click"])]
    )
    result = answer_query(screen, "Which button completes the purchase?")
    assert result.element_id == "element_001"
    assert result.bbox == screen.elements[0].bbox
    assert "Place order" in result.answer
