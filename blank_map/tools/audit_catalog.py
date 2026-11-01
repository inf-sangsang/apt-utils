"""Compare the page catalog, target list, original maps and shipped assets.
Run from any directory: python3 blank_map/tools/audit_catalog.py
"""
from pathlib import Path
from collections import Counter
import hashlib
import json
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
import zlib
from datetime import datetime, timezone

BASE = Path(__file__).resolve().parents[1]
WORK = BASE.parents[1]
ORIGINAL = WORK / '전체지역_백지도'
VARIANTS = {'admin-labeled': '01_행정동_이름있음', 'admin-blank': '02_행정동_이름없음',
            'legal-labeled': '03_법정동_이름있음', 'legal-blank': '04_법정동_이름없음'}
norm = lambda s: unicodedata.normalize('NFC', s)

def assignment(path):
    return json.loads(path.read_text().split('=', 1)[1].strip().rstrip(';'))

def key(sido, name):
    return norm(sido + '/' + name.replace(' ', '_'))

regions = assignment(BASE/'data/regions.js')
targets = json.loads((WORK/'지도_제작대상_지역목록/지역목록.json').read_text())
inputs = json.loads((ORIGINAL/'제작자료/제작_입력.json').read_text())
sources = json.loads((BASE/'data/sources.json').read_text())
graph = assignment(BASE/'data/neighbors.js')
issues = []

def check(condition, message):
    if not condition:
        issues.append(message)

expected = {key(r['시도'], r['제작지역']) for r in targets}
actual = {key(r['sido'], r['name']) for r in regions}
check(expected == actual, f'기준 목록 차이: 누락 {sorted(expected-actual)}, 초과 {sorted(actual-expected)}')
check(len(actual) == len(regions), '페이지 지역명 중복')
ids = [r['id'] for r in regions]
check(len(set(ids)) == len(ids), '페이지 지역 ID 중복')
folders = {p.name for p in (BASE/'maps').iterdir() if p.is_dir()}
check(folders == {str(i) for i in ids}, '페이지 지도 폴더와 ID 목록 불일치')
connection_files = {p.name for p in (BASE/'data/connections').iterdir() if p.is_file()}
check(connection_files == {f'{i}.js' for i in ids}, '연결 데이터 파일과 ID 목록 불일치')
source_regions = [norm(r['지역']) for r in sources]
check(Counter(source_regions) == Counter(norm(r['sido']+' '+r['name']) for r in regions), '출처 목록 누락/중복')
original_folders = {key(p.name, d.name) for p in ORIGINAL.iterdir() if p.is_dir() and p.name in {r['sido'] for r in regions}
                    for d in p.iterdir() if d.is_dir()}
check(original_folders == expected, f'제작 원본 폴더 차이: {sorted(original_folders ^ expected)}')
check(set(graph) == {str(i) for i in ids}, '인접 목록 ID 누락/초과')
by_id = {r['id']: r for r in inputs}
files_checked = 0
zip_expected = set()
with zipfile.ZipFile(BASE/'maps/all-maps.zip') as archive:
    zipped = {norm(info.filename): info for info in archive.infolist()}
    for r in regions:
        region = key(r['sido'], r['name'])
        src = ORIGINAL/r['sido']/r['name'].replace(' ', '_')
        original_files = {norm(p.name): p for p in src.iterdir() if p.is_file()}
        production = by_id.get(r['id'])
        check(production is not None and key(production['sido'], production['name']) == region, f'{region}: 제작 입력 ID 불일치')
        geometry = assignment(BASE/'data/connections'/f'{r["id"]}.js')
        check(geometry['id'] == r['id'], f'{region}: 연결 데이터 ID 불일치')
        for kind in ['admin', 'legal']:
            names = production[kind+'_names']
            check(r[kind+'Count'] == len(names), f'{region}: {kind} 목록 개수 불일치')
            check([f['name'] for f in geometry[kind]['features']] == names, f'{region}: {kind} 연결 지도 동명 누락/불일치')
        for neighbor in graph[str(r['id'])]:
            check(neighbor in ids and r['id'] in graph.get(str(neighbor), []), f'{region}: 인접 관계 누락/불일치 {neighbor}')
        for variant, original_stem in VARIANTS.items():
            for extension in ['png', 'svg']:
                name = variant+'.'+extension
                shipped = BASE/'maps'/str(r['id'])/name
                original = original_files.get(original_stem+'.'+extension)
                files_checked += 1
                if not shipped.is_file() or original is None:
                    check(False, f'{region}: 파일 누락 {name}'); continue
                content = shipped.read_bytes()
                check(hashlib.sha256(content).digest() == hashlib.sha256(original.read_bytes()).digest(), f'{region}: 원본과 파일 불일치 {name}')
                if extension == 'png':
                    check(content[:8] == b'\x89PNG\r\n\x1a\n' and len(content) > 100, f'{region}: 잘못된 PNG {name}')
                else:
                    tree = ET.fromstring(content)
                    paths = [e for e in tree.iter() if e.tag.endswith('}path') and 'data-name' in e.attrib]
                    texts = [e.text for e in tree.iter() if e.tag.endswith('}text')]
                    kind = variant.split('-')[0]
                    check([e.attrib['data-name'] for e in paths] == production[kind+'_names'], f'{region}: SVG 동 경계명 불일치 {name}')
                    check(texts == (production[kind+'_names'] if variant.endswith('labeled') else []), f'{region}: SVG 이름 표시 누락/불일치 {name}')
                archive_name = '전체지역_백지도/'+region+'/'+original_stem+'.'+extension
                zip_expected.add(archive_name)
                info = zipped.get(archive_name)
                check(info is not None and info.file_size == len(content) and info.CRC == zlib.crc32(content), f'{region}: 압축 파일 누락/불일치 {name}')
        check((BASE/'maps'/str(r['id'])/'sources.txt').is_file(), f'{region}: 출처 파일 누락')
    zip_maps = {n for n in zipped if n.endswith(('.svg', '.png'))}
    check(zip_maps == zip_expected, f'압축 파일 지도 목록 차이: {sorted(zip_maps ^ zip_expected)}')

report = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'status': 'PASS' if not issues else 'FAIL',
          'regions': len(regions), 'standaloneMapFiles': files_checked, 'connectionDataFiles': len(connection_files),
          'archiveMapFiles': len(zip_maps), 'sourceRecords': len(sources),
          'checks': ['기준 지역 목록과 페이지 지역 집합·ID', '제작 원본·페이지 지도 폴더의 누락/초과',
                     'PNG/SVG 전 파일의 원본 SHA-256 일치', 'SVG 경계별 이름·표시 이름과 제작 입력 대응',
                     '연결 지도별 행정동/법정동 이름 대응', '인접 관계의 양방향 참조', '출처 목록·파일',
                     '전체 다운로드 ZIP 내 지도 목록·CRC·크기 일치'],
          'displayFix': '원본 목록 끝에 추가된 서귀포시가 세종시 뒤에 분리되어 보였음. UI에서 시도별로 모아 제주시·서귀포시를 같은 제주 그룹에 표시. 기존 ID·URL·지도 파일은 유지.',
          'limitations': '목록·파일·명칭 대조 결과이며 새 경계 정확도 검증이나 브라우저 실사용 검증은 아니다.',
          'jeju': [r for r in regions if r['sido'] == '제주특별자치도'], 'issues': issues}
encoded = json.dumps(report, ensure_ascii=False, indent=2)
(BASE/'data/catalog-validation.json').write_text(encoded)
(ORIGINAL/'제작자료/목록_파일_대조.json').write_text(encoded)
print(encoded)
raise SystemExit(bool(issues))
