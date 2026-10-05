"""공식 전국초중등학교위치표준데이터를 대시보드 학교코드에 연결.

실행: python3 apt-utils/school/generate_school_locations.py [--download]
원본은 output에 보관한다. 교명·학교급·시도·시군구를 대조하며 유사도 추측은 쓰지 않는다.
"""
import argparse
import json
import re
import sys
from collections import defaultdict, Counter
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
BASE = HERE.parent.parent
sys.path.insert(0, str(BASE))
from school_key import norm_location, norm_sido

RAW = BASE / 'output/전국학교_위치_원본.json'
SOURCE = 'https://www.data.go.kr/data/15021148/standard.do'


def download():
    import requests
    host = 'https://www.data.go.kr'
    header = requests.get(host + '/download/columList.json',
                          params={'pk': '15021148', 'ext': 'JSON'}, timeout=60)
    header.raise_for_status()
    h = header.json()
    params = dict(publicDataPk='15021148', colNmList=h['tableVO']['colNmList'],
                  svcTableNm=h['tableVO']['svcTableNm'], totalCount=h['totalCount'], perPage=10000)
    rows = []
    for page in range(1, (int(h['totalCount']) + 9999) // 10000 + 1):
        response = requests.get(host + '/download/standard.json', params={**params, 'page': page}, timeout=60)
        response.raise_for_status()
        rows.extend(response.json())
    if len(rows) != int(h['totalCount']):
        raise ValueError('공식 위치 데이터 총 건수 불일치')
    RAW.write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')


def name_key(name):
    # 분교·캠퍼스 이름은 보존한다.
    return re.sub(r'[\s()]', '', name)


def compatible_region(sido, school_region, location_region):
    a, b = norm_location(school_region), norm_location(location_region)
    if a == b and a:
        return True
    if a and b and ((a.endswith('시') and b.startswith(a)) or
                    (b.endswith('시') and a.startswith(b))):
        return True
    # 공식 위치 자료(2026-03-20) 이후의 행정구역 개편
    if sido == '인천' and a in {'제물포구': {'중구', '동구'}, '영종구': {'중구'},
                                '검단구': {'서구'}, '서해구': {'서구'}}:
        return b in {'제물포구': {'중구', '동구'}, '영종구': {'중구'},
                     '검단구': {'서구'}, '서해구': {'서구'}}[a]
    if sido == '경남' and {a, b} == {'창원시성산구', '창원시의창구'}:
        return True
    return sido == '세종' and not a and not b


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    if args.download or not RAW.exists():
        download()
    raw = json.loads(RAW.read_text())
    index = defaultdict(list)
    for r in raw:
        if r['OPER_STTUS'] != '운영':
            continue
        index[(r['SCHOOL_SE'], norm_sido(r['CDDC_NM']))].append(r)
    positions, audit = {}, []
    for kind, level in [('elem', '초등학교'), ('mid', '중학교')]:
        for file in sorted((HERE / 'data').glob(kind + '_*.js')):
            data = json.loads(file.read_text().split(' = ', 1)[1].rstrip(';\n'))
            sido = data['sido']
            pool = index[(level, sido)]
            for school in data['schools']:
                names = {name_key(n) for n in [school['n'], *school.get('aliases', [])]}
                local = [r for r in pool if compatible_region(sido, school['g'], r['RDNMADR'])]
                hits = [r for r in local if name_key(r['SCHOOL_NM']) in names]
                method = '학교급+시도+시군구+교명'
                if not hits:
                    prefixes = {sido, *re.findall(r'.+?[시군구]', norm_location(school['g']))}
                    prefixes |= {re.sub(r'[시군구]$', '', p) for p in prefixes}
                    hits = [r for r in local if any(p and (name_key(r['SCHOOL_NM']) == p+n or
                                                          n == p+name_key(r['SCHOOL_NM']))
                                                   for p in prefixes for n in names)]
                    method = '지역일치+명칭접두어'
                hits = {r['SCHOOL_ID']: r for r in hits}
                record = dict(학교코드=school['c'], 학교급=level, 시도=sido, 학교명=school['n'], 지역=school['g'])
                if len(hits) == 1:
                    r = next(iter(hits.values()))
                    try:
                        lat, lng = float(r['LATITUDE']), float(r['LONGITUDE'])
                    except (ValueError, TypeError):
                        lat, lng = 0, 0
                    if 32 <= lat <= 39.5 and 124 <= lng <= 132:
                        positions[school['c']] = [round(lat, 7), round(lng, 7), r['RDNMADR']]
                        record.update(검사결과='연결', 매칭방법=method, 위치자료학교ID=r['SCHOOL_ID'],
                                      위치자료학교명=r['SCHOOL_NM'], 주소=r['RDNMADR'], 위도=lat, 경도=lng)
                    else:
                        record['검사결과'] = '좌표누락·범위오류'
                else:
                    record['검사결과'] = '미연결' if not hits else '복수후보:연결보류'
                audit.append(record)
    matched = pd.DataFrame(audit)
    # 서로 다른 학교코드를 한 위치자료 ID에 임의로 연결하지 않는다.
    used = matched[matched['검사결과'] == '연결']
    if used['위치자료학교ID'].duplicated().any():
        raise ValueError('위치자료 학교ID 중복 연결')
    matched.to_csv(BASE / 'output/학교_지도위치_전수검사.csv', index=False, encoding='utf-8-sig')
    counts = {k: dict(Counter(r['검사결과'] for r in audit if r['학교급'] == level))
              for k, level in [('elem', '초등학교'), ('mid', '중학교')]}
    payload = dict(source=SOURCE, referenceDate=sorted({r['REFERENCE_DATE'] for r in raw})[-1],
                   positions=positions, counts=counts)
    (HERE / 'data/schoolLocations.js').write_text('window.schoolLocations = ' +
        json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(json.dumps(counts, ensure_ascii=False))


if __name__ == '__main__':
    main()
