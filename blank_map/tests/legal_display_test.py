"""python3 blank_map/tests/legal_display_test.py (Shapely >=2.2 required)."""
from pathlib import Path
import copy
import sys
from shapely.geometry import LineString
from shapely.ops import unary_union
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from build_legal_outlines import legal_display


def rectangle(name, left, right):
    return {'name': name, 'polygons': [[[[left, 0], [right, 0], [right, 1000], [left, 1000], [left, 0]]]], 'labelBox': [(left+right)/2, 500, 100, 100]}


for second_start in [990, 1000, 1010]:  # overlap, matching edge, gap
    features = [rectangle('첫동', 0, 1000), rectangle('둘동', second_start, 2000)]
    original = copy.deepcopy(features)
    display = legal_display(features)
    assert features == original, 'Archived source polygons and labels must remain unchanged'
    parts = [LineString(points) for points in display['boundarySegments']]
    network = unary_union(parts)
    assert abs(sum(p.length for p in parts)-network.length) < .001, 'Shared edges must be drawn once'
    crossings = network.intersection(LineString([[-100, 500], [2100, 500]]))
    assert crossings.geom_type == 'MultiPoint' and len(crossings.geoms) == 3, 'Only two exterior edges and ONE shared dong boundary should remain'
    outline = unary_union([LineString(points) for points in display['outlineSegments']])
    assert outline.difference(network.buffer(.001)).length < .001, 'Thick outlines and thin boundaries must use the same network'
    assert len(display['displayLabelBoxes']) == 2

print('PASS: overlaps, gaps, shared edges, unchanged source, and matching thick/thin legal boundaries.')
