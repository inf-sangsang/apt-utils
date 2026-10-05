"""월간 원본 CSV를 프론트에서 사용하는 UTF-8 JS 데이터로 변환한다.

사용: python3 people_graph/convert_monthly_data.py 202608 202609
원본 파일은 보존하고 열 이름의 기준월/계 접두어만 제거한다.
"""
import argparse
import csv
import io
from pathlib import Path

DATA = Path(__file__).resolve().parent / 'data'
TYPES = {'age': '연령별인구현황', 'family': '주민등록인구및세대현황'}


def convert(month, kind):
    source = DATA / f'{month}_{month}_{TYPES[kind]}_월간.csv'
    raw = source.read_bytes()
    try:
        content = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        content = raw.decode('cp949')
    rows = list(csv.reader(io.StringIO(content)))
    prefix = f'{month[:4]}년{month[4:]}월_'
    expected = ['행정구역', '총인구수'] + (
        ['연령구간인구수'] + [f'{i}~{i+9}세' for i in range(0, 100, 10)] + ['100세 이상']
        if kind == 'age' else ['세대수', '세대당 인구'])
    headers = [name.removeprefix(prefix).removeprefix('계_') for name in rows[0]]
    if headers != expected or any(len(row) != len(headers) for row in rows[1:]):
        raise ValueError(f'{source.name}: 열 형식 불일치')
    rows[0] = headers
    output = io.StringIO()
    csv.writer(output, quoting=csv.QUOTE_ALL, lineterminator='\n').writerows(rows)
    text = output.getvalue().replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
    target = DATA / f'csvData_{month}_{kind}.js'
    target.write_text(f'window.csvData_{month}_{kind} = `{text}`;\n', encoding='utf-8')
    print(f'{target.name}: {len(rows)-1:,}행')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('months', nargs='+')
    args = parser.parse_args()
    for month in args.months:
        if len(month) != 6 or not month.isdigit() or not 1 <= int(month[4:]) <= 12:
            parser.error(f'잘못된 기준월: {month}')
        for kind in TYPES:
            convert(month, kind)
