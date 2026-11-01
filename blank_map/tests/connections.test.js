/* node blank_map/tests/connections.test.js */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engine = require('../connection-engine');
const base = path.join(__dirname, '..');
const context = { window: {} };
for (const file of ['regions.js', 'neighbors.js']) vm.runInNewContext(fs.readFileSync(path.join(base, 'data', file), 'utf8'), context);
const regions = context.window.BLANK_MAP_REGIONS, graph = context.window.BLANK_MAP_NEIGHBORS;
const data = id => {
    const sandbox = { window: { BLANK_MAP_GEOMETRY: {} } };
    vm.runInNewContext(fs.readFileSync(path.join(base, 'data/connections', `${id}.js`), 'utf8'), sandbox);
    return JSON.parse(JSON.stringify(sandbox.window.BLANK_MAP_GEOMETRY[id]));
};
assert.equal(regions.length, 127);
assert.ok(graph[23].includes(22), '강남–서초 인접');
assert.ok(!graph[23].includes(1), '강남–종로 비인접');
assert.ok(engine.connected([23, 22], graph));
assert.ok(!engine.connected([23, 1], graph));
assert.ok(!engine.connected([23, 23], graph));
assert.ok(!engine.connected([], graph));
assert.ok(!engine.candidates([23, 22], graph).includes(23));
assert.ok(!engine.candidates([23, 22], graph).includes(22));
const chain = { 1: [2], 2: [1, 3], 3: [2] };
assert.ok(engine.connected([1, 2, 3], chain));
assert.ok(!engine.connected([1, 3], chain), '중간 지역 제외 방지');
assert.ok(engine.candidates([1, 2], chain).includes(3), '연결한 지역의 이웃 추가');

function insideRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length-1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) inside = !inside;
    }
    return inside;
}
function insideFeature(x, y, f) {
    return f.polygons.some(poly => insideRing(x, y, poly[0]) && !poly.slice(1).some(ring => insideRing(x, y, ring)));
}
let featureCount = 0, separatedCount = 0, holeCount = 0;
for (const region of regions) {
    for (const neighbor of graph[region.id]) {
        assert.ok(regions.some(r => r.id === neighbor));
        assert.ok(graph[neighbor].includes(region.id), '양방향 인접 관계');
    }
    const geometry = data(region.id);
    assert.ok(geometry.legal.outlineSegments?.length, `${region.name} 법정동 자체 좌표의 외곽선 존재`);
    assert.ok(geometry.legal.boundarySegments?.length, `${region.name} 법정동 공유 경계망 존재`);
    assert.equal(geometry.legal.displayLabelBoxes.length, geometry.legal.features.length, '모든 동 이름에 표시용 내부 라벨 유지');
    for (const segment of geometry.legal.outlineSegments) {
        assert.ok(segment.length >= 2);
        for (const point of segment) assert.ok(point.length === 2 && point.every(Number.isFinite));
    }
    const district = engine.districtFeature({ ...geometry, name: region.name });
    assert.equal(district.name, region.name);
    assert.ok(insideFeature(...district.labelBox.slice(0, 2), { polygons: geometry.admin.features.flatMap(f => f.polygons) }), '구 이름은 구 내부에 배치');
    const [cx, cy, cw, ch] = district.labelBox;
    for (const dx of [-.45, .45]) for (const dy of [-.45, .45]) {
        assert.ok(insideFeature(cx+dx*cw, cy+dy*ch, { polygons: geometry.admin.features.flatMap(f => f.polygons) }), `${region.name} 구 이름 사각형이 구 내부에 위치`);
    }
    for (const ring of district.polygons[0]) assert.deepEqual(ring[0], ring.at(-1), `${region.name} 외곽선 폐합`);
    for (const kind of ['admin', 'legal']) {
        const features = geometry[kind].features;
        assert.equal(features.length, region[`${kind}Count`], `${region.name} ${kind} 동 개수`);
        for (const f of features) {
            featureCount++;
            separatedCount += Number(f.polygons.length > 1);
            holeCount += f.polygons.reduce((n, p) => n+p.length-1, 0);
            const [x, y, w, h] = f.labelBox;
            assert.ok(insideFeature(x, y, f), `${region.name} ${kind} ${f.name} 이름/인출선 내부점`);
            for (const dx of [-.45, .45]) for (const dy of [-.45, .45]) {
                assert.ok(insideFeature(x+dx*w, y+dy*h, f), `${region.name} ${f.name} 글자 사각형 내부`);
            }
            for (const poly of f.polygons) for (const ring of poly) {
                assert.ok(ring.length >= 4);
                assert.deepEqual(ring[0], ring.at(-1), '닫힌 경계');
            }
        }
    }
}
for (const kind of ['admin', 'legal']) {
    const pair = [data(23), data(22)], title = '강남구 + 서초구';
    const labeled = engine.svg(pair, kind, true, title), blank = engine.svg(pair, kind, false, title);
    const paths = svg => [...svg.matchAll(/<path (?:data-name|data-dong-boundaries)="[^"]*" d="([^"]*)"/g)].map(m => m[1]);
    assert.deepEqual(paths(labeled), paths(blank), '이름 유무에 따라 경계가 달라지지 않음');
    assert.equal(paths(blank).length, kind === 'legal' ? pair.length : pair.reduce((n, r) => n+r[kind].features.length, 0));
    assert.ok(!blank.includes('<text'));
    assert.ok(labeled.includes('서초'));
    if (kind === 'legal') {
        assert.ok(!blank.includes('<path data-name='), '원본 동 다각형을 정리된 선망 위에 다시 겹쳐 그리지 않음');
        assert.equal((blank.match(/<path data-dong-boundaries=/g) || []).length, pair.length, '구별 정리된 법정동 선망을 한 번씩만 그림');
    }
    fs.writeFileSync(path.join('/private/tmp', `connected-${kind}.svg`), labeled);
}
const synthetic = [{ admin: { bounds: [0, 0, 10000, 10000], features: [{ name: '<동&>', polygons: [[[[0, 0], [10000, 0], [10000, 10000], [0, 10000], [0, 0]]]], labelBox: [5000, 5000, 1, 1] }] } }];
const tiny = engine.svg(synthetic, 'admin', true, '<제목>');
assert.ok(tiny.includes('&lt;동&amp;&gt;'));
assert.ok(tiny.includes('<circle'), '좁은 구역에 연결된 인출선');
const rectangle = (x0, x1) => ({ name: '동', polygons: [[[[x0, 0], [x1, 0], [x1, 10], [x0, 10], [x0, 0]]]], labelBox: [(x0+x1)/2, 5, 2, 2] });
const districtData = [{ name: '첫째구', admin: { bounds: [0, 0, 20, 10], features: [rectangle(0, 10), rectangle(10, 20)] } },
    { name: '둘째구', admin: { bounds: [20, 0, 30, 10], features: [rectangle(20, 30)] } }];
const outline = engine.districtFeature(districtData[0]);
assert.deepEqual(outline.labelBox.slice(0, 2), [10, 5], '동 라벨 위치와 무관하게 구 전체 중앙에 배치');
assert.equal(outline.polygons[0].length, 1);
assert.equal(outline.polygons[0][0].length, 7, '공유 동 경계 제거, 구 외곽선 유지');
const districtSVG = engine.svg(districtData, 'district', true, '구만 표시');
assert.equal((districtSVG.match(/<path data-name=/g) || []).length, 2, '연결된 구마다 외곽선 유지');
assert.ok(districtSVG.includes('첫째구') && districtSVG.includes('둘째구'));
assert.ok(!engine.svg(districtData, 'district', false, '구만 표시').includes('<text'));
const districtFontSize = svg => Number(svg.match(/<text[^>]*font-size="([\d.]+)"/)[1]);
const fullDistrict = engine.svg(districtData, 'district', true, '구만 표시');
const [fullWidth, fullHeight] = fullDistrict.match(/width="(\d+)" height="(\d+)"/).slice(1).map(Number);
const halfDistrict = engine.svg(districtData, 'district', true, '구만 표시', { width: fullWidth/2, height: fullHeight/2 });
const quarterDistrict = engine.svg(districtData, 'district', true, '구만 표시', { width: fullWidth/4, height: fullHeight/4 });
assert.equal(districtFontSize(halfDistrict)*.5, 14, '절반 축척에서도 화면 글씨는 14px 유지');
assert.equal(districtFontSize(quarterDistrict)*.25, 14, '축척이 더 작아지면 글씨 크기는 반비례 증가');
assert.equal(districtFontSize(fullDistrict), 22, '원본 글씨 크기는 유지');
assert.deepEqual(quarterDistrict.match(/<path[^>]+>/g), fullDistrict.match(/<path[^>]+>/g), '글씨 보정은 경계를 바꾸지 않음');
const islandRegion = { name: '섬구', admin: { bounds: [0, 0, 110, 10], features: [rectangle(0, 20), rectangle(100, 110)] } };
assert.deepEqual(engine.districtFeature(islandRegion).labelBox.slice(0, 2), [10, 5], '멀리 떨어진 섬 대신 본체 중앙에 배치');
for (const polygons of [
    [[[[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10], [0, 0]]]],
    [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]]]]
]) {
    const feature = { name: '동', polygons, labelBox: [1.5, 5, 1, 1] };
    const concave = { name: '오목구', admin: { bounds: [0, 0, 10, 10], features: [feature] } };
    const [x, y, w, h] = engine.districtFeature(concave).labelBox;
    assert.ok(insideFeature(x, y, feature), '오목한 구와 내부 구멍의 중심은 구 안으로 보정');
    for (const dx of [-.45, .45]) for (const dy of [-.45, .45]) assert.ok(insideFeature(x+dx*w, y+dy*h, feature));
}
function dimensions(svg) {
    return svg.match(/width="(\d+)" height="(\d+)"/).slice(1).map(Number);
}
function firstEdgeLength(svg) {
    const points = svg.match(/<path (?:data-name|data-dong-boundaries)="[^"]*" d="M ([\d.,-]+) L ([\d.,-]+)/).slice(1).map(p => p.split(',').map(Number));
    return Math.hypot(points[1][0]-points[0][0], points[1][1]-points[0][1]);
}
for (const kind of ['admin', 'legal', 'district']) {
    const first = { ...data(23), name: '강남구' }, second = { ...data(22), name: '서초구' };
    const single = engine.svg([first], kind, true, '단독');
    const joined = engine.svg([first, second], kind, true, '연결');
    const blank = engine.svg([first, second], kind, false, '연결');
    assert.ok(Math.abs(firstEdgeLength(single)-firstEdgeLength(joined)) < .03, `${kind} 연결해도 기존 경계의 픽셀 길이 유지`);
    const [sw, sh] = dimensions(single), [jw, jh] = dimensions(joined);
    assert.ok(jw >= sw && jh >= sh && (jw > sw || jh > sh), `${kind} 연결 범위만큼 캔버스 확장`);
    assert.deepEqual(dimensions(joined), dimensions(blank), '이름 유무와 무관하게 이미지 크기 유지');
    const stroke = svg => Number(svg.match(/stroke="#111" stroke-width="([\d.]+)"/)[1]);
    if (kind === 'district') assert.ok(stroke(joined) > stroke(single), '구·시 연결 범위가 커지면 원본·다운로드 외곽선도 굵어짐');
    else assert.equal(stroke(joined), 1.6, `${kind} 연결해도 동 경계선은 기존 굵기 유지`);
    assert.equal(stroke(joined), stroke(blank), '이름 유무에 따른 선 굵기 일치');
    const fitted = engine.svg([first, second], kind, true, '전체 보기', { width: jw/4, height: jh/4 });
    if (kind === 'district') assert.ok(stroke(fitted)*.25 >= 1.2, '구·시 외곽선은 축소 시에도 화면 최소 굵기 유지');
    else {
        assert.equal(stroke(fitted), 1.6, `${kind} 축소 시에도 동 경계선을 두껍게 보정하지 않음`);
        const outerStroke = svg => Number(svg.match(/data-layer="region-outlines"[^>]*stroke-width="([\d.]+)"/)[1]);
        assert.ok(outerStroke(joined) > outerStroke(single), `${kind} 동 표시 상태에서도 연결한 구·시 외곽선만 굵어짐`);
        assert.ok(outerStroke(fitted)*.25 >= 1.2, `${kind} 전체 보기에서도 구·시 외곽선 강조`);
        assert.equal(outerStroke(joined), outerStroke(blank), '이름 없는 지도에도 같은 구·시 외곽선 적용');
        assert.equal((fitted.match(/<path data-region=/g) || []).length, 2, '각 구의 외곽선을 따로 유지해 구 사이 경계도 표시');
    }
    assert.equal(firstEdgeLength(fitted), firstEdgeLength(joined), '선 굵기 보정은 경계 좌표와 축척을 바꾸지 않음');
}
const layered = engine.svg(districtData, 'admin', false, '동 표시');
const outerLayer = layered.match(/<g data-layer="region-outlines"[^>]*>(.*?)<\/g>/)[1];
const outlinePaths = [...outerLayer.matchAll(/ d="([^"]*)"/g)].map(m => m[1]);
assert.equal(outlinePaths.length, 2);
const firstOutline = [...outlinePaths[0].matchAll(/[ML] ([\d.-]+),([\d.-]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
const internalX = firstOutline.map(p => p[0]).sort((a, b) => a-b)[3];
assert.ok(!firstOutline.slice(1).some((p, i) => p[0] === internalX && firstOutline[i][0] === internalX && p[1] !== firstOutline[i][1]), '동 사이 공유 세로 경계는 굵은 외곽선 레이어에서 제외');
const shiftedLegal = {
    id: 999, name: '다른좌표구',
    admin: { bounds: [0, 0, 20, 10], features: [rectangle(0, 20)] },
    legal: { bounds: [100, 0, 120, 10], features: [rectangle(100, 120)], outlineSegments: rectangle(100, 120).polygons[0] }
};
const shiftedSVG = engine.svg([shiftedLegal], 'legal', false, '법정동');
const thinPath = shiftedSVG.match(/<path data-name="[^"]*" d="([^"]*)"/)[1];
const thickPath = shiftedSVG.match(/<path data-region="999" d="([^"]*)"/)[1];
assert.equal(thickPath, thinPath.replace(/ Z/g, ''), '행정동과 위치가 다른 법정동도 굵고 얇은 외곽선이 정확히 일치');
console.log(`PASS: 127개 지역, ${featureCount}개 구역 내부 라벨, ${separatedCount}개 분리 구역, ${holeCount}개 내부 구멍, 인접 그래프와 동일 벡터 4종, 법정동 자체 외곽선`);
