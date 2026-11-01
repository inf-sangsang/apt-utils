"""Build a clean display network and outlines from archived legal polygons.

Run: python3 blank_map/tools/build_legal_outlines.py (requires Shapely).
Requires Shapely >=2.2 / GEOS >=3.14. Original features remain unchanged.
"""
from pathlib import Path
import hashlib
import json
import shapely
from shapely import make_valid, coverage_clean, coverage_is_valid, maximum_inscribed_circle, line_merge
from shapely.geometry import Polygon, Point, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]


def lines(geometry):
    if geometry.geom_type in ('LineString', 'LinearRing'):
        yield geometry
    elif hasattr(geometry, 'geoms'):
        for part in geometry.geoms:
            yield from lines(part)


def segments(geometry):
    return [[[float(x), float(y)] for x, y in line.coords] for line in lines(line_merge(geometry)) if line.length > .001]


def legal_display(features):
    polygons = [unary_union([make_valid(Polygon(p[0], p[1:])) for p in f['polygons']]) for f in features]
    # These are display-only derivatives. Coverage cleaning resolves overlap
    # ownership, fills narrow gaps and gives neighboring dongs identical edges.
    # Reduce snapping for tiny dongs if a larger tolerance would erase them.
    for snapping in [20, 10, 5, 1, 0]:
        cleaned = coverage_clean(polygons, gap_width=40, snapping_distance=snapping)
        if len(cleaned) == len(features) and all(not p.is_empty for p in cleaned):
            break
    assert len(cleaned) == len(features) and all(not p.is_empty for p in cleaned), [f['name'] for f, p in zip(features, cleaned) if p.is_empty]
    assert coverage_is_valid(cleaned), 'Dong polygons must form an edge-matched, non-overlapping coverage'
    union = unary_union(cleaned)
    network = unary_union([p.boundary for p in cleaned])
    components = list(union.geoms) if union.geom_type == 'MultiPolygon' else [union]
    exterior = unary_union([p.exterior for p in components])
    # A shared boundary appears in two polygons but only once in this network.
    assert abs(network.length-(sum(p.length for p in cleaned)+union.length)/2) < .01
    labels = []
    for original, polygon in zip(features, cleaned):
        x, y, w, h = original['labelBox']
        if not polygon.covers(box(x-w/2, y-h/2, x+w/2, y+h/2)):
            point = Point(x, y)
            if not polygon.contains(point):
                point = Point(maximum_inscribed_circle(polygon, tolerance=1).coords[0])
            x, y = point.x, point.y
            side = polygon.boundary.distance(point)*2**.5*.95
            w, h = min(w, side), min(h, side)
        assert w > 0 and h > 0
        assert polygon.covers(box(x-w/2, y-h/2, x+w/2, y+h/2)), original['name']
        labels.append([x, y, w, h])
    return {'boundarySegments': segments(network), 'outlineSegments': segments(exterior), 'displayLabelBoxes': labels, 'displayCleanup': {'gapWidthMeters': 40, 'snappingDistanceMeters': snapping}}


def main():
    checks = []
    for file in sorted((ROOT / 'data/connections').glob('*.js'), key=lambda p: int(p.stem)):
        source = file.read_text()
        region = json.loads(source.split('=', 1)[1].strip().rstrip(';'))
        features = region['legal']['features']
        display = legal_display(features)
        region['legal'].update(display)
        file.write_text(f'window.BLANK_MAP_GEOMETRY[{region["id"]}]=' + json.dumps(region, ensure_ascii=False, separators=(',', ':')) + ';\n')
        checks.append({'id': region['id'], 'legalFeaturesSha256': hashlib.sha256(json.dumps(features, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest(), 'outlineSegments': len(display['outlineSegments']), 'boundarySegments': len(display['boundarySegments']), 'featuresPreserved': len(features), 'coverageValid': True, 'labelsInsideOwnDong': True, 'sharedEdgesDrawnOnce': True, **display['displayCleanup']})
    report = {
        'source': 'connections/{id}.js legal.features; same sources and dates as connection-validation.json',
        'method': 'Display-only coverage_clean(gap_width=40m, snapping_distance<=20m). Each source dong retains its name and nonempty polygon. Shared edges are drawn once from a noded line union; thick region outlines come from exterior rings of the same cleaned polygon union. Interior holes keep thin boundaries only. Original legal.features are retained unchanged.',
        'limitation': 'Display coordinates can shift within the cleanup tolerances. Narrow genuine gaps may be filled. This is a presentation repair of the archived source, not an official boundary update or fresh geographic verification.',
        'validation': 'Valid non-overlapping, edge-matched coverage; all dongs retained; label rectangles lie within their own display polygons; shared edges rendered once. Original geometry hashes recorded per region.',
        'documentation': 'https://shapely.readthedocs.io/en/stable/reference/shapely.coverage_clean.html',
        'shapelyVersion': shapely.__version__,
        'regions': checks,
    }
    (ROOT / 'data/legal-outline-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f'PASS: {len(checks)} clean legal display networks; original features retained; all labels inside their own dong.')


if __name__ == '__main__':
    main()
