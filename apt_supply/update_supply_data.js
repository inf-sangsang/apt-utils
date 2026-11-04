/* Chrome에서 수집한 단지 표를 검증하고 목록/연간 집계를 함께 갱신한다.
 * node apt_supply/update_supply_data.js apt_supply/data/aptginSnapshot_20261105.json 2026 2030
 * --dry-run 옵션은 데이터 파일을 변경하지 않고 검증 결과만 출력한다.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const directory = path.join(__dirname, 'data');
const input = process.argv[2];
if (!input) throw new Error('수집한 JSON 파일 경로가 필요합니다.');
const startYear = Number(process.argv[3] || 2025);
const endYear = Number(process.argv[4] || 2030);
assert.ok(Number.isInteger(startYear) && Number.isInteger(endYear) && startYear >= 2000 && endYear >= startYear, '갱신 연도 범위 오류');
const startMonth = `${startYear}-01`;
const endMonth = `${endYear}-12`;
const periods = [];
for (let year = startYear; year <= endYear; year += 3) periods.push([`${year}-01`, `${Math.min(year + 2, endYear)}-12`]);
const dryRun = process.argv.includes('--dry-run');
const snapshots = JSON.parse(fs.readFileSync(input, 'utf8'));
const provinces = ['서울','경기','인천','부산','대구','광주','대전','울산','세종','강원','충북','충남','전북','경북','경남','제주'];
assert.equal(snapshots.length, provinces.length * periods.length);
for (const region of provinces) {
    for (const [start, end] of periods) {
        assert.equal(snapshots.filter(s => s.region === region && s.start === start && s.end === end).length, 1);
    }
}
const aliases = {
    서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천',
    대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종', 경기도: '경기',
    강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남', 전북특별자치도: '전북',
    경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주', 전남광주통합특별시: '광주'
};
const fresh = [];
for (const snapshot of snapshots) {
    if (snapshot.derivedFrom) {
        const source = snapshot.derivedFrom;
        const total = source.summary.match(/#총계\s*([\d,]+)단지\s*([\d,]+)세대/);
        assert.ok(source.start <= snapshot.start && source.end >= snapshot.end && total, '교차 확인 기간/총계 오류');
        assert.equal(source.rows.length, Number(total[1].replaceAll(',', '')));
        assert.ok(source.rows.every(row => row[3] >= source.start && row[3] <= source.end));
        assert.equal(source.rows.reduce((sum, row) => sum + Number(row[4].replaceAll(',', '')), 0), Number(total[2].replaceAll(',', '')));
        assert.deepEqual(snapshot.rows, source.rows.filter(row => row[3] >= snapshot.start && row[3] <= snapshot.end), '교차 확인 원문과 추출 결과 불일치');
    }
    const total = snapshot.summary.match(/#총계\s*([\d,]+)단지\s*([\d,]+)세대/);
    assert.ok(total, snapshot.region + ' 총계 누락');
    assert.equal(snapshot.rows.length, Number(total[1].replaceAll(',', '')));
    let households = 0;
    for (const original of snapshot.rows) {
        assert.equal(original.length, 5);
        const row = original.map(value => value.trim());
        assert.match(row[3], /^\d{4}-(0[1-9]|1[0-2])$/);
        assert.ok(row[3] >= snapshot.start && row[3] <= snapshot.end);
        row[4] = row[4].replaceAll(',', '');
        assert.match(row[4], /^\d+$/);
        households += Number(row[4]);
        const parts = row[2].split(/\s+/);
        parts[0] = aliases[parts[0]] || parts[0];
        assert.equal(parts[0], snapshot.region, '조회 지역과 주소의 시도 불일치');
        row[2] = parts.join(' ');
        fresh.push(row);
    }
    assert.equal(households, Number(total[2].replaceAll(',', '')), snapshot.region + ' 세대수 불일치');
}
const unique = new Map();
for (const row of fresh) {
    const key = JSON.stringify(row.slice(0, 4));
    assert.ok(!unique.has(key), '수집 목록에 중복 단지: ' + key);
    unique.set(key, row);
}
const old = require('./data/supplyList.js');
const history = old.slice(1).filter(row => row[3] < startMonth || row[3] > endMonth);
const rows = [...history, ...unique.values()].sort((a,b) => a[3].localeCompare(b[3]) || a[2].localeCompare(b[2]) || a[1].localeCompare(b[1]));
const regions = vm.runInNewContext(fs.readFileSync(path.join(directory, 'regionList.js'), 'utf8') + ';regions');
const yearly = regions.map(([region]) => {
    const counts = {};
    for (const row of rows) {
        if (row[2] === region || row[2].startsWith(region + ' ')) {
            const year = row[3].slice(0, 4);
            counts[year] = (counts[year] || 0) + Number(row[4]);
        }
    }
    return [region, counts];
}).filter(([, counts]) => Object.keys(counts).length);
for (const row of fresh) assert.ok(regions.some(([region]) => row[2] === region || row[2].startsWith(region + ' ')), '지역 집계 미연결');
const date = path.basename(input).match(/(\d{8})/)[1];
const stamp = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
const header = `// 출처: https://aptgin.com/home/gin05/gin0501\n// 업데이트: ${stamp} (${startYear}~${endYear}년 갱신, 해당 기간 밖 기존 자료 유지)\n\n`;
function save(filename, variable, data) {
    fs.writeFileSync(path.join(directory, filename), header + `const ${variable} = [\n` +
        data.map(row => '    ' + JSON.stringify(row)).join(',\n') + '\n];\n\n' +
        `if (typeof module !== 'undefined' && module.exports) module.exports = ${variable};\n`);
}
if (!dryRun) {
    save('supplyList.js', 'supplyData', [old[0], ...rows]);
    save('supplyCountList.js', 'regionYearlyData', yearly);
}
console.log(JSON.stringify({ dryRun, startYear, endYear, preserved: history.length, replaced: old.length-1-history.length, collected: fresh.length, total: rows.length, regions: yearly.length }));
