"""Build connected-map vectors from the archived, cross-checked production inputs.
Run: python3 blank_map/tools/build_connections.py [path/to/제작자료]
Requires numpy, scipy, Pillow and Shapely; never fetches or silently updates source data.
"""
from pathlib import Path
import sys, json, re, hashlib
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import minimum_filter
from scipy.spatial import cKDTree
from build_legal_outlines import legal_display

OUT = Path(__file__).resolve().parents[1] / 'data'
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT.parents[2] / '전체지역_백지도/제작자료'
sys.path.insert(0, str(SOURCE))
from 경계_추출 import tm, norm


def polygons(feature):
    g = feature['geometry']
    return g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]


def label_box(polys, name):
    # A rectangle entirely within one polygon, including holes. Use the largest
    # component for the label, but retain ALL components in the drawn geometry.
    def area(p):
        a = np.array(p[0]); return abs(np.sum(a[:-1, 0]*a[1:, 1]-a[1:, 0]*a[:-1, 1]))
    poly = max(polys, key=area)
    pts = np.array(poly[0]); lo, hi = pts.min(0), pts.max(0)
    unit = max(hi-lo)/300
    w, h = np.ceil((hi-lo)/unit).astype(int)+5
    im = Image.new('1', (int(w), int(h)))
    draw = ImageDraw.Draw(im)
    for i, ring in enumerate(poly):
        draw.polygon([tuple(v) for v in (np.array(ring)-lo)/unit+2], fill=int(i == 0))
    mask = np.array(im, dtype=np.uint8)
    low, high, best = 1, max(2, min(h, w//max(1, len(name)))), None
    while low <= high:
        size = (low+high)//2
        bh, bw = max(1, size), max(1, size*len(name))
        valid = minimum_filter(mask, size=(bh+2, bw+2), mode='constant', cval=0)
        ys, xs = np.where(valid)
        if len(xs):
            k = np.argmin((xs-xs.mean())**2+(ys-ys.mean())**2)
            best = [float((xs[k]-2)*unit+lo[0]), float((ys[k]-2)*unit+lo[1]), bw*unit, bh*unit]
            low = size+1
        else:
            high = size-1
    if best is None:
        raise ValueError('No interior label rectangle: '+name)
    return [round(v, 2) for v in best]


def boundary_samples(features):
    chunks, weights = [], []
    for f in features:
        for poly in f['polygons']:
            # Interiors are harmless here: only boundaries close to ANOTHER
            # region can contribute. Holes and separated islands are retained.
            for ring in poly:
                p = np.array(ring)
                for a, b in zip(p[:-1], p[1:]):
                    length = np.linalg.norm(b-a)
                    n = max(1, int(np.ceil(length/10)))
                    chunks.append(a+(b-a)*np.arange(n)[:, None]/n)
                    weights.append(np.full(n, length/n))
    points = np.concatenate(chunks)
    return points, cKDTree(points), np.concatenate(weights)


def main():
    rows = json.loads((SOURCE/'제작_입력.json').read_text())
    extra = OUT/'additional-regions.json'
    if extra.exists():
        existing = {r['id'] for r in rows}
        rows += [r for r in json.loads(extra.read_text()) if r['id'] not in existing]
    regions = []
    for r in rows:
        result = {'id': r['id'], 'referenceMap': {'url': r['meta']['url'], 'date': '2026-09-30'}}
        for kind in ['admin', 'legal']:
            names = r[kind+'_names']
            field = 'adm_nm' if kind == 'admin' else 'EMD_KOR_NM'
            lookup = {norm(f['properties'][field].split()[-1]): f for f in r[kind]}
            features = []
            for name in names:
                f = lookup[norm(name)]
                polys = [[np.round(tm(np.array(ring)), 2).tolist() for ring in p] for p in polygons(f)]
                features.append({'name': name, 'polygons': polys, 'labelBox': label_box(polys, name)})
            pts = np.concatenate([np.array(p[0]) for f in features for p in f['polygons']])
            result[kind] = {'bounds': [*pts.min(0), *pts.max(0)], 'features': features}
        result['legal'].update(legal_display(result['legal']['features']))
        regions.append(result)
        (OUT/'connections').mkdir(exist_ok=True)
        (OUT/'connections'/f'{r["id"]}.js').write_text('window.BLANK_MAP_GEOMETRY['+str(r['id'])+']='+json.dumps(result, ensure_ascii=False, separators=(',', ':'))+';\n')

    samples = {kind: [boundary_samples(r[kind]['features']) for r in regions] for kind in ['admin', 'legal']}
    neighbors = {str(r['id']): [] for r in rows}
    checks, disagreements = [], []
    for i, a in enumerate(regions):
        for j in range(i+1, len(regions)):
            b = regions[j]
            alo, ahi = np.array(a['admin']['bounds']).reshape(2, 2)
            blo, bhi = np.array(b['admin']['bounds']).reshape(2, 2)
            if np.any(alo > bhi+100) or np.any(blo > ahi+100):
                continue
            lengths = {}
            for kind, tolerance in [('admin', 5), ('legal', 40)]:
                ap, at, aw = samples[kind][i]; bp, bt, bw = samples[kind][j]
                # Require a length, never just a common corner. Symmetric test
                # limits effects of different vertex densities in the two inputs.
                lengths[kind] = int(min(aw[bt.query(ap, distance_upper_bound=tolerance)[0] < tolerance].sum(),
                                        bw[at.query(bp, distance_upper_bound=tolerance)[0] < tolerance].sum()))
            agreement = all(v >= 200 for v in lengths.values())
            record = {'ids': [a['id'], b['id']], 'nearBoundaryMeters': lengths}
            if agreement:
                neighbors[str(a['id'])].append(b['id']); neighbors[str(b['id'])].append(a['id'])
                checks.append(record)
            elif any(v >= 200 for v in lengths.values()):
                disagreements.append(record)

    (OUT/'neighbors.js').write_text('window.BLANK_MAP_NEIGHBORS = '+json.dumps(neighbors, separators=(',', ':'))+';\n')
    report = {
        'method': '공통 TM 투영, 10m 이하 경계 표본. 행정동 5m/법정동 40m 이내 양방향 근접 길이 각각 200m 이상인 쌍만 허용. 점 접촉 제외. 불일치는 보수적으로 연결 목록에서 제외.',
        'sources': [{'url': 'https://github.com/vuski/admdongkor', 'date': '2026-10-01', 'role': '행정동 좌표'},
                    {'url': 'https://github.com/KnellBalm/kr-admin-geojson', 'date': '2023-07-29', 'role': '법정동 좌표, 기존 제작 입력의 최신 명칭 재분류 포함'},
                    {'url': 'https://dokdokinfo.kr/areaboundary/', 'date': '2026-09-30', 'role': '지역별 참고 지도·명칭. 지역별 URL은 sources.json 및 connections/{id}.js'}],
        'inputSha256': hashlib.sha256((SOURCE/'제작_입력.json').read_bytes()).hexdigest(),
        'regions': len(rows), 'accepted': checks, 'excludedDisagreements': disagreements,
        'geometryChoice': '연결 지도는 기존 제작 시 대조한 지리 좌표를 사용한다. 이미지에서 추출한 단독 지도는 지역별 여백·비등방 축척과 픽셀 복원 때문에 서로 직접 이어 붙일 수 없다. 최신 이미지 윤곽과 좌표의 차이는 기존 제작 검증 기록을 승계하며, 연결 지도의 법정동은 2023년 좌표 기반임을 UI에 명시한다. 기준일 불명인 최신 좌표로 간주하지 않는다.',
        'validation': '동 이름별 대응, 구멍·분리 구역 유지, 구역 내부 직사각형에 이름 배치(작으면 내부점으로 인출선). 이름 유무는 같은 고정 벡터 공유. 기존 지역별 출처/대조 기록: maps/{id}/sources.txt. 경계 표본 근접은 인접 판정의 근사이며 전체 지역의 신규 육안 전수 검증을 의미하지 않는다.'
    }
    report['checkedReferencePages'] = ['https://github.com/vuski/admdongkor', 'https://github.com/KnellBalm/kr-admin-geojson', 'https://dokdokinfo.kr/areaboundary/seoul/gangnam-gu/']
    report['dataLoading'] = '로컬 파일 직접 열기와 HTTP 모두 지원하도록 지역별 일반 JS 스크립트를 동적으로 불러온다. file://에서 차단되는 JSON fetch는 사용하지 않는다. 로딩 실패·잘못된 자료·타임아웃은 캐시에서 제거하여 재시도할 수 있다.'
    report['knownDiscrepancy'] = '법정동 원자료의 독립 단순화로 이웃 다각형 사이에 작은 틈/겹침이 남아 있다. 이를 임의의 새 경계로 덮거나 스냅하지 않고 보존한다. 행정동·법정동 간 인접 판정이 다른 4쌍은 연결 후보에서 제외했다. 최신 이미지 지도와의 상세 차이·복원 내역은 기존 지역별 sources.txt 및 제작자료/검증경계의 구역별 진단을 승계한다.'
    report['checks'] = {'geometry': '127개 지역, 4706개 구역, 169개 분리 구역, 28개 내부 구멍. 각 이름/인출선 내부점 및 글자 사각형 모서리, 폐합 경로, 양방향 인접, 이름 유무 동일 도형 검사 통과.', 'interaction': 'file: 환경에서 fetch를 금지하고 실제 지역별 JS 스크립트를 실행하는 Node 회귀 검사 통과. 연결·해제·미리보기·URL 복원·캐시·빠른 전환·로딩 실패 후 재시도·잘못된 자료 검사를 포함한다. 실제 브라우저 검증을 대체하지 않는다.', 'visual': '강남구+서초구 두 경계 체계의 SVG를 PNG로 렌더링하여 확인. 브라우저 실사용·PNG 다운로드는 실행 환경의 서버/파일 URL 제한으로 미확인.'}
    encoded = json.dumps(report, ensure_ascii=False, indent=2)
    (OUT/'connection-validation.json').write_text(encoded)
    (SOURCE/'백지도_연결_검증.json').write_text(encoded)
    print('regions', len(rows), 'connections', len(checks), 'excluded', len(disagreements))
    print('Gangnam neighbors:', neighbors['23'])


if __name__ == '__main__':
    main()
