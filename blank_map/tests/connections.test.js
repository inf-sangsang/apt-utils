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
    const paths = svg => [...svg.matchAll(/<path data-name="[^"]*" d="([^"]*)"/g)].map(m => m[1]);
    assert.deepEqual(paths(labeled), paths(blank), '이름 유무에 따라 경계가 달라지지 않음');
    assert.equal(paths(blank).length, pair.reduce((n, r) => n+r[kind].features.length, 0));
    assert.ok(!blank.includes('<text'));
    assert.ok(labeled.includes('서초'));
    fs.writeFileSync(path.join('/private/tmp', `connected-${kind}.svg`), labeled);
}
const synthetic = [{ admin: { bounds: [0, 0, 10000, 10000], features: [{ name: '<동&>', polygons: [[[[0, 0], [10000, 0], [10000, 10000], [0, 10000], [0, 0]]]], labelBox: [5000, 5000, 1, 1] }] } }];
const tiny = engine.svg(synthetic, 'admin', true, '<제목>');
assert.ok(tiny.includes('&lt;동&amp;&gt;'));
assert.ok(tiny.includes('<circle'), '좁은 구역에 연결된 인출선');
console.log(`PASS: 127개 지역, ${featureCount}개 구역 내부 라벨, ${separatedCount}개 분리 구역, ${holeCount}개 내부 구멍, 인접 그래프와 동일 벡터 4종`);
