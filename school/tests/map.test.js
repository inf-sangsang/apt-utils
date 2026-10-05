/* node school/tests/map.test.js — 지도 표시/팝업 회귀 검사 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.join(__dirname, '..');
function element() {
    return { children: [], checked: true, appendChild(child) { this.children.push(child); }, scrollIntoView() {} };
}
const elements = Object.fromEntries(['mapSource', 'mapTileNotice', 'mapStatus', 'mapElemCheckbox', 'mapMidCheckbox', 'detailPanel'].map(id => [id, element()]));
const groups = [], created = [];
const active = new Set();
let fits = 0;
const map = {
    setView() { return this; }, invalidateSize() {},
    hasLayer(layer) { return active.has(layer); },
    addLayer(layer) { active.add(layer); }, removeLayer(layer) { active.delete(layer); },
    fitBounds(bounds) { assert.ok(bounds.length); fits++; }
};
const L = {
    map: () => map,
    tileLayer: () => ({ addTo() { return this; }, on() {} }),
    divIcon: options => options,
    markerClusterGroup: () => {
        const group = { items: [], clearLayers() { this.items = []; }, addLayers(items) { this.items.push(...items); } };
        groups.push(group); return group;
    },
    marker: (point, options) => {
        const marker = {
            point, options, open: false,
            bindPopup(builder) { this.builder = builder; },
            bindTooltip() {}, on(event, callback) { this[event] = callback; },
            isPopupOpen() { return this.open; }, setPopupContent(content) { this.content = content; }
        };
        created.push(marker); return marker;
    }
};
const context = vm.createContext({ window: { L, SchoolCharts: { eliteRates: (s, withAu) => [withAu ? 10 : 4] } }, document: { createElement: element, getElementById: id => elements[id] }, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync(path.join(dir, 'data/schoolLocations.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(dir, 'map.js'), 'utf8'), context);
const locations = context.window.schoolLocations.positions;
assert.equal(Object.keys(locations).length, 9531);
Object.values(locations).forEach(([lat, lng, address]) => {
    assert.ok(lat >= 32 && lat <= 39.5 && lng >= 124 && lng <= 132);
    assert.ok(address);
});
const schools = { elem: [], mid: [] };
for (const kind of Object.keys(schools)) {
    for (const file of fs.readdirSync(path.join(dir, 'data')).filter(f => f.startsWith(kind + '_'))) {
        const data = JSON.parse(fs.readFileSync(path.join(dir, 'data', file), 'utf8').split(' = ')[1].trim().replace(/;$/, ''));
        schools[kind].push(...data.schools);
    }
}
(async () => {
    const api = context.window.SchoolMap;
    await api.load();
    let selected;
    const options = { fit: true, withAu: true, onSelect: (school, kind) => { selected = [school.c, kind]; } };
    api.render(schools, options);
    assert.equal(groups[0].items.length, 6272);
    assert.equal(groups[1].items.length, 3259);
    assert.match(elements.mapStatus.textContent, /206개교/);
    assert.equal(active.size, 2);
    const count = created.length;
    api.render({ elem: [], mid: schools.mid }, { ...options, fit: false });
    assert.equal(active.size, 1);
    assert.equal(fits, 1, '체크박스 전환은 지도 위치를 유지한다');
    elements.mapElemCheckbox.checked = elements.mapMidCheckbox.checked = false;
    api.render({ elem: [], mid: [] }, { ...options, fit: false });
    assert.equal(active.size, 0);
    assert.match(elements.mapStatus.textContent, /체크해 주세요/);
    const school = schools.mid.find(s => s.c === 'S010002148');
    assert.equal(school.n, '광진중학교');
    assert.match(locations[school.c][2], /광진구/);
    api.render({ elem: [], mid: [school] }, options);
    const marker = groups[1].items[0];
    marker.click();
    assert.deepEqual(selected, [school.c, 'mid']);
    marker.open = true;
    api.render({ elem: [], mid: [school] }, { ...options, withAu: false, fit: false });
    assert.ok(marker.content.children.some(child => /4.0%.*자사고 제외/.test(child.textContent)));
    api.render(schools, options);
    assert.equal(created.length, count, '필터 변경 후 마커를 재사용한다');
    console.log('PASS: 좌표 9,531개, 학교급 표시 전환, 위치 누락, 상세 선택, 팝업 비율 갱신');
})().catch(error => { console.error(error); process.exitCode = 1; });
