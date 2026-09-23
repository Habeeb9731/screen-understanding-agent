from __future__ import annotations


def iou(a: list[float], b: list[float]) -> float:
    ix1, iy1, ix2, iy2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union else 0.0


def contains(outer: list[float], inner: list[float], margin: float = 0.0) -> bool:
    return (outer[0] - margin <= inner[0] and outer[1] - margin <= inner[1]
            and outer[2] + margin >= inner[2] and outer[3] + margin >= inner[3])


def spatial_relationships(elements: list[dict]) -> list[dict]:
    rels: list[dict] = []
    for left in elements:
        for right in elements:
            if left["id"] == right["id"]:
                continue
            a, b = left["bbox"], right["bbox"]
            if contains(a, b, 0.002) and (a[2]-a[0])*(a[3]-a[1]) > (b[2]-b[0])*(b[3]-b[1])*1.15:
                rels.append({"source_id": left["id"], "relation": "contains", "target_id": right["id"], "confidence": 0.9})
            ax, ay = (a[0]+a[2])/2, (a[1]+a[3])/2
            bx, by = (b[0]+b[2])/2, (b[1]+b[3])/2
            overlap_y, overlap_x = min(a[3], b[3])-max(a[1], b[1]), min(a[2], b[2])-max(a[0], b[0])
            if overlap_y > 0 and ax < bx and abs(ay-by) < 0.08:
                rels.append({"source_id": left["id"], "relation": "left_of", "target_id": right["id"], "confidence": 0.78})
            elif overlap_x > 0 and ay < by and abs(ax-bx) < 0.12:
                rels.append({"source_id": left["id"], "relation": "above", "target_id": right["id"], "confidence": 0.76})
    return rels
