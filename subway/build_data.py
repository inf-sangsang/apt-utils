"""Create a compact, date-free UI dataset from the verified weekday inputs."""
import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[1] / 'outputs/transit_20261031/요일평균_계산자료.json'
items = json.loads(SOURCE.read_text())['items']
query_mappings = json.loads((SOURCE.parent / 'query_mappings.json').read_text())
regions_by_station = defaultdict(set)
for mapping in query_mappings.values():
    for target in mapping.get('targets', []):
        source_row = target.get('sourceRow', [])
        if len(source_row) >= 4:
            regions_by_station[(target['line'], target['station'])].add(tuple(source_row[1:4]))
rows = []
for item in items:
    regions = regions_by_station[(item['line'], item['station'])]
    assert regions, f"지역 정보 누락: {item['line']} {item['station']}"
    observations = item['observations']
    assert [o['weekday'] for o in observations] == list(range(7))
    metrics = []
    for component in range(2):
        peaks = [sum(o['values'][((h - 4) % 24) * 2 + component]
                     for o in observations[:5]) / 5 for h in [7, 8, 17, 18]]
        totals = [sum(o['values'][component::2]) for o in observations]
        metrics.append(peaks + [sum(totals[:5]) / 5, sum(totals[5:]) / 2, sum(totals)])
    rows.append({'id': item['line'] + '|' + item['station'], 'line': item['line'],
                 'station': item['station'], 'boarding': metrics[0], 'alighting': metrics[1],
                 'regions': [{'province': province, 'city': city, 'dong': dong}
                             for province, city, dong in sorted(regions)],
                 'note': {'사용자 지정 0': '지정값 0', '다른 날짜로 요일 보완': '요일 보완'}.get(item['method'], '')})
assert len(rows) == 752
(HERE / 'data.js').write_text('window.SUBWAY_DATA=' + json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(f'{len(rows)} station-line records generated')
