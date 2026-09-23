from __future__ import annotations

from PIL import Image
import cv2
import numpy as np

from backend.schemas import BoundingBox, TextRegion, UIElement


class OCRProvider:
    name = "ocr"
    available = False

    def extract(self, image: Image.Image) -> list[TextRegion]:
        raise NotImplementedError


class TesseractOCR(OCRProvider):
    name = "tesseract"

    def __init__(self) -> None:
        try:
            import pytesseract
            pytesseract.get_tesseract_version()
            self._pytesseract = pytesseract
            self.available = True
        except Exception:
            self._pytesseract = None

    def extract(self, image: Image.Image) -> list[TextRegion]:
        if not self.available:
            return []
        data = self._pytesseract.image_to_data(image, output_type=self._pytesseract.Output.DICT, config="--psm 11")
        w, h = image.size
        regions = []
        for i, raw in enumerate(data["text"]):
            text = " ".join(raw.split())
            conf = float(data["conf"][i]) / 100 if str(data["conf"][i]) != "-1" else 0
            if not text or conf <= 0:
                continue
            x, y, bw, bh = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
            regions.append(TextRegion(text=text, confidence=max(0, min(1, conf)), bbox=BoundingBox(x1=x/w, y1=y/h, x2=(x+bw)/w, y2=(y+bh)/h)))
        return regions


class UIElementDetector:
    name = "cv_baseline"

    def detect(self, image: Image.Image) -> list[UIElement]:
        arr = cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2BGR)
        h, w = arr.shape[:2]
        gray = cv2.cvtColor(arr, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 70, 170)
        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        candidates = []
        for contour in contours:
            x, y, cw, ch = cv2.boundingRect(contour)
            area = cw * ch
            if area < w*h*.0012 or cw < 28 or ch < 16 or area > w*h*.55:
                continue
            ratio = cw / max(ch, 1)
            perimeter = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, .04*perimeter, True) if perimeter else []
            if len(approx) < 4 and ratio < 4:
                continue
            kind = "button" if 1.8 <= ratio <= 8 and ch < h*.16 else "card" if area > w*h*.025 else "container"
            interactive = kind == "button"
            candidates.append((x, y, cw, ch, kind, interactive, .63 if interactive else .52))
        candidates.sort(key=lambda c: c[2]*c[3], reverse=True)
        kept = []
        for candidate in candidates:
            box = [candidate[0]/w, candidate[1]/h, (candidate[0]+candidate[2])/w, (candidate[1]+candidate[3])/h]
            if any(_iou(box, [d[0]/w, d[1]/h, (d[0]+d[2])/w, (d[1]+d[3])/h]) > .72 for d in kept):
                continue
            kept.append(candidate)
            if len(kept) >= 70:
                break
        kept.sort(key=lambda c: (c[1], c[0]))
        return [UIElement(id=f"element_{i+1:03d}", type=c[4], bbox=BoundingBox(x1=c[0]/w, y1=c[1]/h, x2=(c[0]+c[2])/w, y2=(c[1]+c[3])/h), confidence=c[6], interactive=c[5], state="enabled" if c[5] else "unknown", possible_actions=["click"] if c[5] else [], source=self.name) for i, c in enumerate(kept)]


def _iou(a: list[float], b: list[float]) -> float:
    ix1, iy1, ix2, iy2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, ix2-ix1) * max(0, iy2-iy1)
    union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter
    return inter / union if union else 0


def associate_text(elements: list[UIElement], regions: list[TextRegion]) -> None:
    for region in regions:
        rx, ry = (region.bbox.x1+region.bbox.x2)/2, (region.bbox.y1+region.bbox.y2)/2
        matches = [e for e in elements if e.bbox.x1-.02 <= rx <= e.bbox.x2+.02 and e.bbox.y1-.03 <= ry <= e.bbox.y2+.03]
        if matches:
            target = min(matches, key=lambda e: (e.bbox.x2-e.bbox.x1)*(e.bbox.y2-e.bbox.y1))
            target.text = f"{target.text} {region.text}".strip()
            if target.type == "container" and target.bbox.y2-target.bbox.y1 < .18:
                target.type = "button"
                target.interactive, target.state, target.possible_actions = True, "enabled", ["click"]
