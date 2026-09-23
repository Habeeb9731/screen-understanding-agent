from __future__ import annotations

import re
from backend.schemas import GroundingResult, ScreenRepresentation, UIElement


INTENT_TERMS = {
    "login": {"login", "log", "sign", "signin", "sign-in", "account", "เข้าสู่ระบบ"},
    "search": {"search", "find", "look", "query"},
    "checkout": {"checkout", "purchase", "buy", "order", "pay", "payment", "submit"},
    "address": {"address", "delivery", "shipping", "location"},
    "password": {"password", "passcode", "security"},
    "settings": {"settings", "preferences", "configuration", "account"},
    "close": {"close", "dismiss", "cancel", "exit"},
    "menu": {"menu", "navigation", "nav", "sidebar"},
}

ACTION_TERMS = {
    "click": {"click", "press", "tap", "select", "open", "use", "where"},
    "type": {"type", "enter", "write", "input"},
    "toggle": {"toggle", "enable", "disable", "switch"},
}


def _tokens(value: str) -> set[str]:
    return set(re.findall(r"[a-z0-9-]+", value.lower()))


def _label(element: UIElement) -> str:
    return " ".join([element.text, element.type, element.state, *element.possible_actions])


def _intent(question: str) -> tuple[str | None, set[str]]:
    tokens = _tokens(question)
    scores = {name: len(tokens & terms) for name, terms in INTENT_TERMS.items()}
    best = max(scores, key=scores.get) if scores else None
    return (best if scores.get(best, 0) else None, tokens)


def _score(element: UIElement, question: str, intent: str | None, tokens: set[str]) -> float:
    label_tokens = _tokens(_label(element))
    # A long OCR paragraph can contain incidental query words. Cap direct
    # matches so text length cannot overwhelm element type and affordance.
    direct = min(3, len(tokens & label_tokens))
    intent_bonus = 0
    if intent:
        intent_bonus = len(label_tokens & INTENT_TERMS[intent]) * 2
        if intent == "search" and element.type == "search_box": intent_bonus += 5
        if intent in {"login", "checkout", "close", "menu"} and element.interactive: intent_bonus += 1.5
        if intent == "address" and any(word in label_tokens for word in {"change", "edit", "address", "delivery"}): intent_bonus += 3
    action_bonus = 1 if element.interactive and any(tokens & terms for terms in ACTION_TERMS.values()) else 0
    return direct * 2 + intent_bonus + action_bonus + element.confidence * .25


def _generic_type_query(question: str) -> str | None:
    tokens = _tokens(question)
    for words, element_type in [
        ({"button", "buttons"}, "button"), ({"link", "links"}, "link"),
        ({"input", "inputs", "textbox", "textboxes"}, "text_input"),
        ({"checkbox", "checkboxes"}, "checkbox"), ({"toggle", "toggles"}, "toggle"),
    ]:
        if tokens & words and tokens & {"see", "find", "show", "where", "list", "what", "can"}:
            return element_type
    return None


def answer_query(screen: ScreenRepresentation, question: str) -> GroundingResult:
    intent, tokens = _intent(question)
    generic_type = _generic_type_query(question)
    if generic_type:
        matches = [element for element in screen.elements if element.type == generic_type]
        if matches:
            labels = [element.text.strip() or element.type.replace("_", " ") for element in matches]
            shown = ", ".join(f'“{label}”' for label in labels[:6])
            suffix = "" if len(matches) <= 6 else f" and {len(matches) - 6} more"
            noun = generic_type.replace("_", " ") + ("s" if len(matches) != 1 else "")
            confidence = round(min(.95, .55 + sum(e.confidence for e in matches) / max(1, len(matches)) * .35), 2)
            return GroundingResult(answer=f"Yes — I can see {len(matches)} {noun}: {shown}{suffix}.", element_id=matches[0].id, bbox=matches[0].bbox, element_ids=[e.id for e in matches], bboxes=[e.bbox for e in matches], confidence=confidence, evidence=[f"Filtered detected elements by type: {generic_type}", f"Matched {len(matches)} existing element(s)."])
        return GroundingResult(answer=f"I don't see any detected {generic_type.replace('_', ' ')} elements on this screen.", confidence=.82, evidence=[f"No detected elements of type: {generic_type}"])
    ranked = sorted(((element, _score(element, question, intent, tokens)) for element in screen.elements), key=lambda pair: pair[1], reverse=True)
    if not ranked or ranked[0][1] < 1.0:
        return GroundingResult(answer="I couldn't ground that question to a detected element on this screen. Try mentioning visible text or asking what you can click.", confidence=.25, evidence=["No detected element passed the local grounding threshold."])
    element, raw_score = ranked[0]
    margin = raw_score - (ranked[1][1] if len(ranked) > 1 else 0)
    confidence = min(.92, max(.35, .45 + raw_score / 18 + margin / 20))
    subject = element.text.strip() or element.type.replace("_", " ")
    if element.interactive:
        verb = "click" if "click" in element.possible_actions else element.possible_actions[0] if element.possible_actions else "use"
        answer = f'Use the “{subject}” {element.type.replace("_", " ")} — you can {verb} it.'
    else:
        answer = f'The relevant detected {element.type.replace("_", " ")} is “{subject}”.'
    evidence = [f"Matched element text/type: {subject} / {element.type}"]
    if intent: evidence.append(f"Inferred intent: {intent}")
    return GroundingResult(answer=answer, element_id=element.id, bbox=element.bbox, element_ids=[element.id], bboxes=[element.bbox], confidence=round(confidence, 2), evidence=evidence)
