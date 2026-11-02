"""Build explicitly requested additions from archived nationwide boundary files.

Run from apt-utils: python3 blank_map/tools/build_additional_regions.py [제작자료]
Uses the same dependencies and projection as build_connections.py, plus resvg-py
for standalone PNGs. Existing region IDs and map files are preserved.
"""
import base64
import gzip
import json
from pathlib import Path
import subprocess
import zipfile
import hashlib

import numpy as np
import resvg_py
from build_connections import SOURCE, OUT, polygons, tm, label_box, boundary_samples
from build_legal_outlines import legal_display

ROOT = OUT.parent
ADDITIONS = [(128, '의왕시', 'uiwang-si'), (129, '과천시', 'gwacheon-si')]
VARIANTS = {'admin-labeled': '01_행정동_이름있음', 'admin-blank': '02_행정동_이름없음',
            'legal-labeled': '03_법정동_이름있음', 'legal-blank': '04_법정동_이름없음'}


def assignment(path):
    return json.loads(path.read_text().split('=', 1)[1].strip().rstrip(';'))


def write_assignment(path, key, value):
    encoded = json.dumps(value, ensure_ascii=False, indent=2) if path.name == 'regions.js' else json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    path.write_text(key + ' = ' + encoded + ';\n')


def main():
    catalog = assignment(OUT/'regions.js')
    graph = assignment(OUT/'neighbors.js')
    sources = json.loads((OUT/'sources.json').read_text())
    inputs, added = [], []
    for id, name, slug in ADDITIONS:
        row = {'id': id, 'sido': '경기도', 'name': name,
               'meta': {'url': f'https://dokdokinfo.kr/areaboundary/gyeonggi-do/{slug}/'}}
        geometry = {'id': id, 'referenceMap': {'url': row['meta']['url'], 'date': '2026-09-30'}}
        for kind, filename, cityfield, namefield in [
            ('admin', '행정동_전국_20261001.geojson', 'sggnm', 'adm_nm'),
            ('legal', '법정동_전국_20230729.geojson', 'SGG_NM', 'EMD_KOR_NM')]:
            all_features = json.loads((SOURCE/filename).read_text())['features']
            row[kind] = sorted([f for f in all_features if f['properties'].get(cityfield) == name],
                               key=lambda f: f['properties'][namefield].split()[-1])
            row[kind+'_names'] = [f['properties'][namefield].split()[-1] for f in row[kind]]
            assert row[kind], name
            features = []
            for f, dong in zip(row[kind], row[kind+'_names']):
                polys = [[np.round(tm(np.array(ring)), 2).tolist() for ring in p] for p in polygons(f)]
                features.append({'name': dong, 'polygons': polys, 'labelBox': label_box(polys, dong)})
            pts = np.concatenate([np.array(p[0]) for f in features for p in f['polygons']])
            geometry[kind] = {'bounds': [*pts.min(0), *pts.max(0)], 'features': features}
        geometry['legal'].update(legal_display(geometry['legal']['features']))
        write_assignment(OUT/'connections'/f'{id}.js', f'window.BLANK_MAP_GEOMETRY[{id}]', geometry)
        catalog = [r for r in catalog if r['id'] != id] + [
            {'id': id, 'sido': '경기도', 'name': name,
             'adminCount': len(row['admin']), 'legalCount': len(row['legal'])}]
        sources = [r for r in sources if r['지역'] != '경기도 '+name] + [
            {'지역': '경기도 '+name, '최신참고지도': row['meta']['url'], '지도기준일': '2026-09-30',
             '행정동수': len(row['admin']), '법정동수': len(row['legal'])}]
        inputs.append(row)
        added.append(geometry)

    # Only new pairs are calculated; previously checked adjacency is retained.
    report = json.loads((OUT/'connection-validation.json').read_text())
    new_ids = {r['id'] for r in added}
    for key in graph:
        graph[key] = [id for id in graph[key] if id not in new_ids]
    for id in new_ids:
        graph[str(id)] = []
    for key in ['accepted', 'excludedDisagreements']:
        report[key] = [r for r in report[key] if not new_ids.intersection(r['ids'])]
    geometries = [assignment(OUT/'connections'/f'{r["id"]}.js') for r in catalog]
    sample_cache = {}
    def samples(r, kind):
        key = (r['id'], kind)
        if key not in sample_cache:
            sample_cache[key] = boundary_samples(r[kind]['features'])
        return sample_cache[key]
    for i, a in enumerate(geometries):
        for b in geometries[i+1:]:
            if not new_ids.intersection([a['id'], b['id']]):
                continue
            alo, ahi = np.array(a['admin']['bounds']).reshape(2, 2)
            blo, bhi = np.array(b['admin']['bounds']).reshape(2, 2)
            if np.any(alo > bhi+100) or np.any(blo > ahi+100):
                continue
            lengths = {}
            for kind, tolerance in [('admin', 5), ('legal', 40)]:
                ap, at, aw = samples(a, kind); bp, bt, bw = samples(b, kind)
                lengths[kind] = int(min(aw[bt.query(ap, distance_upper_bound=tolerance)[0] < tolerance].sum(),
                                        bw[at.query(bp, distance_upper_bound=tolerance)[0] < tolerance].sum()))
            record = {'ids': [a['id'], b['id']], 'nearBoundaryMeters': lengths}
            if all(v >= 200 for v in lengths.values()):
                graph[str(a['id'])].append(b['id']); graph[str(b['id'])].append(a['id'])
                report['accepted'].append(record)
            elif any(v >= 200 for v in lengths.values()):
                report['excludedDisagreements'].append(record)
    for values in graph.values():
        values.sort()
    write_assignment(OUT/'regions.js', 'window.BLANK_MAP_REGIONS', catalog)
    write_assignment(OUT/'neighbors.js', 'window.BLANK_MAP_NEIGHBORS', graph)
    (OUT/'sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2)+'\n')
    (OUT/'additional-regions.json').write_text(json.dumps(inputs, ensure_ascii=False, separators=(',', ':'))+'\n')
    report['regions'] = len(catalog)
    report['additionalInputSha256'] = hashlib.sha256((OUT/'additional-regions.json').read_bytes()).hexdigest()
    report['checks']['geometry'] = '전체 지역의 구역 내부 라벨, 폐합 경로, 양방향 인접, 이름 유무 동일 도형은 connections.test.js로 검사한다.'
    (OUT/'connection-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')

    # Use the actual UI renderer for the four downloadable standalone variants.
    subprocess.run(['node', '-e', '''
const fs=require('fs'),vm=require('vm'),engine=require('./blank_map/connection-engine');
for(const [id,name] of [[128,'의왕시'],[129,'과천시']]) {
 const c={window:{BLANK_MAP_GEOMETRY:{}}};
 vm.runInNewContext(fs.readFileSync(`blank_map/data/connections/${id}.js`,'utf8'),c);
 const r=JSON.parse(JSON.stringify(c.window.BLANK_MAP_GEOMETRY[id]));
 fs.mkdirSync(`blank_map/maps/${id}`,{recursive:true});
 for(const kind of ['admin','legal']) for(const labeled of [true,false])
 fs.writeFileSync(`blank_map/maps/${id}/${kind}-${labeled?'labeled':'blank'}.svg`,engine.svg([r],kind,labeled,name));
}'''], check=True, cwd=ROOT.parent)
    # Embed Nanum Gothic so PNG rendering and standalone SVG are portable.
    font = json.loads((OUT/'fonts/nanum.js').read_text().split('=', 1)[1].strip().rstrip(';'))
    font_path = ROOT/'data/fonts/.render-nanum.ttf'
    font_path.write_bytes(base64.b64decode(font['data']))
    try:
        for row in inputs:
            folder = ROOT/'maps'/str(row['id'])
            for variant in VARIANTS:
                path = folder/f'{variant}.svg'
                svg = path.read_text().replace('font-family="Noto Sans KR,Apple SD Gothic Neo,sans-serif"', 'font-family="Nanum Gothic"')
                path.write_text(svg)
                path.with_suffix('.png').write_bytes(resvg_py.svg_to_bytes(svg_string=svg, font_files=[str(font_path)], zoom=2))
            maps = {kind: (folder/f'{kind}-labeled.svg').read_text() for kind in ['admin', 'legal']}
            packed = base64.b64encode(gzip.compress(json.dumps(maps, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)).decode()
            write_assignment(OUT/'font-maps'/f'{row["id"]}.js', f'window.BLANK_MAP_ASSETS["font-maps/{row["id"]}"]', packed)
    finally:
        font_path.unlink()
    # Rebuild the archive without accumulating duplicate entries on reruns.
    archive_path = ROOT/'maps/all-maps.zip'
    temporary = archive_path.with_suffix('.tmp.zip')
    prefixes = tuple('전체지역_백지도/경기도/'+r['name']+'/' for r in inputs)
    import unicodedata
    with zipfile.ZipFile(archive_path) as old, zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as new:
        for info in old.infolist():
            if not unicodedata.normalize('NFC', info.filename).startswith(prefixes):
                new.writestr(info, old.read(info))
        for row in inputs:
            folder = ROOT/'maps'/str(row['id'])
            for variant, stem in VARIANTS.items():
                for extension in ['svg', 'png']:
                    new.write(folder/f'{variant}.{extension}', f'전체지역_백지도/경기도/{row["name"]}/{stem}.{extension}')
    temporary.replace(archive_path)
    print('Added:', [(r['name'], graph[str(r['id'])]) for r in inputs])


if __name__ == '__main__':
    main()
