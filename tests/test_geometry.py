from backend.core.geometry import iou, spatial_relationships


def test_iou():
    assert iou([0, 0, 1, 1], [0, 0, 1, 1]) == 1
    assert iou([0, 0, .5, .5], [.5, .5, 1, 1]) == 0


def test_spatial_relationships():
    result = spatial_relationships([
        {"id": "a", "bbox": [0, 0, .2, .2]},
        {"id": "b", "bbox": [.3, 0, .5, .2]},
    ])
    assert any(r["relation"] == "left_of" for r in result)
