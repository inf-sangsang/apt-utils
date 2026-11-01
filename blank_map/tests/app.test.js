/* node blank_map/tests/app.test.js — selection, loading and failure regression */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const engine = require('../connection-engine');
const base = path.join(__dirname, '..');
class Element {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this.dataset = {}; this.value = ''; this.textContent = ''; this.open = false; }
    append(...children) { this.children.push(...children); }
    add(option) { this.append(option); if (this.children.length === 1) this.value = String(option.value); }
    replaceChildren(...children) { this.children = children; this.textContent = ''; if (this.tagName === 'SELECT') this.value = ''; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    removeAttribute(name) { delete this.attrs[name]; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    click() { if (!this.disabled) this.listeners.click?.({ target: this }); }
    querySelectorAll(selector) { return this.children.filter(c => selector === '.region-button' && c.className === 'region-button'); }
    querySelector() { return null; }
    close() { this.open = false; }
    showModal() { this.open = true; }
    focus() {}
    remove() { this.removed = true; }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(hash = '', loader) {
    const elements = {};
    const document = {
        getElementById: id => elements[id] ||= new Element(['province', 'neighbor'].includes(id) ? 'select' : 'div'),
        createElement: tag => new Element(tag), title: ''
    };
    document.getElementById('province').add({ textContent: '전체 시·도', value: '' });
    let calls = [], revoked = [];
    const window = { BlankMapConnection: engine, addEventListener: (name, fn) => window[name] = fn };
    const location = { hash, protocol: 'file:' };
    document.head = { append(script) {
        calls.push(script.src);
        Promise.resolve().then(() => loader ? loader(script.src) : { ok: true }).then(response => {
            if (!response.ok) { script.onerror(); return; }
            if (!response.invalid) vm.runInContext(fs.readFileSync(path.join(base, script.src), 'utf8'), context);
            script.onload();
        }).catch(() => script.onerror());
    } };
    const context = vm.createContext({ window, document, location, history: { replaceState: (_, unused, value) => location.hash = value },
        Option: function(text, value) { this.textContent = text; this.value = value; },
        URL: { createObjectURL: () => `blob:test-${calls.length}-${Math.random()}`, revokeObjectURL: value => revoked.push(value) }, Blob,
        setTimeout, clearTimeout,
        fetch: () => { throw new Error('Local files cannot be fetched; script loading must be used'); }
    });
    for (const file of ['data/regions.js', 'data/neighbors.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context);
    return { elements, calls, location, window, revoked };
}
(async () => {
    const ui = setup(), e = ui.elements;
    assert.equal(e['region-title'].textContent, '강남구');
    assert.equal(e.maps.children.length, 4);
    const regionButtons = () => e.regions.children.filter(c => c.className === 'region-button');
    assert.equal(regionButtons().length, 127, '전체 지역 목록 누락 없음');
    assert.equal(new Set(regionButtons().map(c => c.dataset.id)).size, 127, '지역 중복 없음');
    const jejuIndex = e.regions.children.findIndex(c => c.className === 'region-group' && c.textContent === '제주특별자치도');
    assert.equal(e.regions.children.filter(c => c.className === 'region-group' && c.textContent === '제주특별자치도').length, 1, '제주 그룹이 분리되지 않음');
    assert.equal(e.regions.children[jejuIndex+1].textContent, '제주시');
    assert.equal(e.regions.children[jejuIndex+2].textContent, '서귀포시');
    e.province.value = '제주특별자치도'; e.province.listeners.change();
    assert.deepEqual(regionButtons().map(c => c.textContent), ['제주시', '서귀포시']);
    e.search.value = '서귀포'; e.search.listeners.input();
    assert.deepEqual(regionButtons().map(c => c.textContent), ['서귀포시']);
    e.reset.click();
    assert.equal(regionButtons().length, 127);

    assert.ok(e.neighbor.children.some(o => o.value === 22));
    e.neighbor.value = '22'; e.connect.click(); await tick();
    assert.equal(e['region-title'].textContent, '강남구 + 서초구');
    assert.equal(ui.location.hash, '#23+22');
    assert.equal(e.maps.children.length, 4);
    assert.equal(ui.calls.length, 2);
    assert.ok(e['connection-status'].textContent.includes('연결했습니다'));
    e.maps.children[0].children[1].click(); assert.ok(e.preview.open);
    e.disconnect.click(); await tick();
    assert.equal(e['region-title'].textContent, '강남구');
    assert.ok(!e.preview.open);
    assert.equal(ui.revoked.length, 4);
    e.neighbor.value = '22'; e.connect.click(); await tick(); assert.equal(ui.calls.length, 2, '자료 캐시');
    ui.location.hash = '#1'; ui.window.hashchange(); await tick(); assert.equal(e['region-title'].textContent, '종로구');
    const restored = setup('#23+22'); await tick(); assert.equal(restored.elements.maps.children.length, 4, '연결 URL 복원');
    const invalid = setup('#23+1'); assert.equal(invalid.elements['region-title'].textContent, '강남구', '비인접 URL 제외');
    let responses = [];
    const slow = setup('#23+22', () => new Promise(resolve => responses.push(resolve)));
    slow.elements.disconnect.click();
    await tick();
    responses.forEach(resolve => resolve({ ok: true }));
    await tick();
    assert.equal(slow.elements['region-title'].textContent, '강남구');
    assert.ok(slow.elements.maps.children[0].children[1].children[0].src.startsWith('maps/23/'), '이전 로딩 결과가 새 선택 덮어쓰기 방지');
    assert.ok(!slow.elements.maps.attrs['aria-busy']);
    let failed = true;
    const retry = setup('#23+22', url => failed ? Promise.reject(new Error('offline')) : Promise.resolve({ ok: true }));
    await tick(); assert.ok(retry.elements['connection-status'].textContent.includes('불러오지 못했습니다'));
    failed = false; retry.elements['connection-status'].children[0].click(); await tick();
    assert.equal(retry.elements.maps.children.length, 4, '실패 후 다시 시도');
    const malformed = setup('#23+22', () => ({ ok: true, invalid: true }));
    await tick(); assert.ok(malformed.elements['connection-status'].textContent.includes('불러오지 못했습니다'), '잘못된 스크립트 자료 검사');
    assert.ok(ui.calls.every(url => /^data\/connections\/\d+\.js$/.test(url)));
    console.log('PASS: file: 환경에서 fetch 없이 실제 자료 스크립트 로딩, 연결·해제·미리보기·URL 복원·캐시·빠른 전환·실패 후 재시도·잘못된 자료 처리');
})().catch(error => { console.error(error); process.exitCode = 1; });
