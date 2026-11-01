/* node blank_map/tests/app.test.js — selection, loading and failure regression */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const engine = require('../connection-engine');
const base = path.join(__dirname, '..');
class Element {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this.dataset = {}; this.style = {}; this.value = ''; this.textContent = ''; this.open = false; }
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
    getBoundingClientRect() { return this.rect || { width: 400, height: 300 }; }
    remove() { this.removed = true; }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(hash = '', loader, Observer, storage = new Map()) {
    const elements = {};
    const document = {
        getElementById: id => elements[id] ||= new Element(['province', 'neighbor'].includes(id) ? 'select' : 'div'),
        createElement: tag => new Element(tag), title: '', body: new Element('body')
    };
    document.getElementById('province').add({ textContent: '전체 시·도', value: '' });
    document.getElementById('connection-settings');
    let calls = [], revoked = [], blobs = new Map();
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
        Option: function(text, value) { this.textContent = text; this.value = value; this.style = {}; },
        URL: { createObjectURL: blob => { const url = `blob:test-${calls.length}-${Math.random()}`; blobs.set(url, blob); return url; }, revokeObjectURL: value => revoked.push(value) }, Blob,
        setTimeout, clearTimeout, ResizeObserver: Observer,
        atob, Uint8Array, DecompressionStream, Response,
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        fetch: () => { throw new Error('Local files cannot be fetched; script loading must be used'); }
    });
    for (const file of ['data/regions.js', 'data/neighbors.js', 'font-engine.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context);
    return { elements, calls, location, window, revoked, context, blobs };
}
(async () => {
    const ui = setup(), e = ui.elements;
    await tick();
    assert.equal(e['region-title'].textContent, '강남구');
    assert.equal(e.maps.children.length, 4);
    const singleLegal = await ui.blobs.get(e.maps.children[2].children[1].children[0].src).text();
    assert.ok(singleLegal.includes('data-dong-boundaries="23"'), '단독 법정동 지도도 정리된 경계망 사용');
    assert.ok(!singleLegal.includes('<path data-name='), '단독 법정동은 기존 다각형을 겹쳐 그리지 않음');
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
    e['connection-settings'].open = true;
    e.neighbor.value = '22'; e.connect.click(); await tick();
    assert.equal(e['region-title'].textContent, '강남구 외 1개 지역');
    assert.equal(e['region-title'].title, '강남구 + 서초구');
    assert.equal(e['connection-summary'].textContent, '2개 지역 선택');
    assert.ok(e['connection-settings'].open, '연결 후에도 사용자가 열어 둔 설정 유지');
    assert.equal(ui.location.hash, '#23+22');
    assert.equal(e.maps.children.length, 4);
    assert.equal(ui.calls.length, 2);
    assert.ok(e['connection-status'].textContent.includes('연결했습니다'));
    assert.ok(e['connection-status'].className.includes('visually-hidden'), '일상적인 완료 메시지는 화면에서 숨기고 읽기 도구에 알림');
    e.maps.children[0].children[1].click(); assert.ok(e.preview.open);
    assert.equal(e['preview-image'].className, 'original-size', '연결 지도는 축소하지 않고 원본 크기로 확대');
    assert.ok(!e['preview-size'].hidden);
    e['preview-size'].click();
    assert.equal(e['preview-image'].className, '');
    assert.equal(e['preview-size'].textContent, '원본 크기');
    e['preview-size'].click(); assert.equal(e['preview-image'].className, 'original-size');
    e.disconnect.click(); await tick();
    assert.equal(e['region-title'].textContent, '강남구');
    assert.ok(!e.preview.open);
    e.maps.children[0].children[1].click();
    assert.ok(e['preview-size'].hidden, '단독 지도는 기존 전체 보기 유지');
    assert.equal(e['preview-image'].className, '');
    e['close-preview'].click();
    assert.equal(ui.revoked.length, 6, '초기 법정동 2종과 이전 연결 지도 4종 URL 해제');
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
    assert.equal(retry.elements['connection-status'].className, 'map-status', '오류와 재시도는 접힌 설정 밖에 표시');
    failed = false; retry.elements['connection-status'].children[0].click(); await tick();
    assert.equal(retry.elements.maps.children.length, 4, '실패 후 다시 시도');
    const malformed = setup('#23+22', () => ({ ok: true, invalid: true }));
    await tick(); assert.ok(malformed.elements['connection-status'].textContent.includes('불러오지 못했습니다'), '잘못된 스크립트 자료 검사');
    assert.ok(ui.calls.every(url => /^data\/connections\/\d+\.js$/.test(url)));
    const districtUI = setup(), d = districtUI.elements;
    d['district-only'].checked = true; d['district-only'].listeners.change(); await tick();
    assert.equal(d.maps.children.length, 2, '구만 표시: 이름 유무 2종');
    assert.ok(d['region-counts'].hidden);
    assert.equal(d.maps.children[0].children[0].children[0].textContent, '구·시 외곽선');
    assert.ok(d.maps.children[0].children[2].children[1].download.endsWith('_district-labeled.svg'));
    d.maps.children[0].children[1].click(); assert.ok(d.preview.open);
    d.neighbor.value = '22'; d.connect.click(); await tick();
    assert.equal(d.maps.children.length, 2, '연결 후에도 구만 표시 유지');
    assert.ok(!d.preview.open);
    d['district-only'].checked = false; d['district-only'].listeners.change(); await tick();
    assert.equal(d.maps.children.length, 4, '해제하면 기존 4종 복원');
    assert.ok(!d['region-counts'].hidden);
    let outlineResponses = [];
    const toggle = setup('', () => new Promise(resolve => outlineResponses.push(resolve)));
    toggle.elements['district-only'].checked = true; toggle.elements['district-only'].listeners.change();
    toggle.elements['district-only'].checked = false; toggle.elements['district-only'].listeners.change();
    await tick(); outlineResponses.forEach(resolve => resolve({ ok: true })); await tick();
    assert.equal(toggle.elements.maps.children.length, 4, '외곽선 로딩 중 해제하면 기존 지도 유지');
    const largePNG = setup('#23+22'); await tick();
    largePNG.context.document.fonts = { ready: Promise.resolve() };
    largePNG.context.Image = class { constructor() { this.naturalWidth = 5000; this.naturalHeight = 2000; } async decode() {} };
    const pngButton = largePNG.elements.maps.children[0].children[2].children[0];
    pngButton.click(); await tick();
    assert.ok(largePNG.elements['connection-status'].textContent.includes('SVG를 다운로드'), '대형 PNG를 자동 축소하지 않고 SVG 안내');
    assert.equal(pngButton.disabled, false);
    let observer;
    class Observer {
        constructor(callback) { this.callback = callback; this.targets = new Set(); observer = this; }
        observe(img) { this.targets.add(img); }
        unobserve(img) { this.targets.delete(img); }
        disconnect() { this.targets.clear(); }
        resize(img) { this.callback([{ target: img }]); }
    }
    const responsive = setup('#23+22', undefined, Observer), r = responsive.elements; await tick();
    r['district-only'].checked = true; r['district-only'].listeners.change(); await tick();
    const thumb = r.maps.children[0].children[1].children[0];
    const download = r.maps.children[0].children[2].children[1].href;
    assert.ok(observer.targets.has(thumb));
    observer.resize(thumb);
    assert.notEqual(thumb.src, download, '축소 카드는 글씨 크기를 보정한 SVG 사용');
    r.maps.children[0].children[1].click(); observer.resize(r['preview-image']);
    assert.equal(r['preview-image'].src, download, '원본 크기 보기는 원본 SVG 사용');
    r['preview-size'].click();
    assert.notEqual(r['preview-image'].src, download, '전체 보기로 축소하면 글씨 보정');
    const fitted = r['preview-image'].src;
    r['preview-image'].rect = { width: 200, height: 150 }; observer.resize(r['preview-image']);
    assert.notEqual(r['preview-image'].src, fitted, '화면 크기 변경 시 글씨 재보정');
    assert.ok(responsive.revoked.includes(fitted), '이전 보정 SVG 해제');
    r['preview-size'].click(); assert.equal(r['preview-image'].src, download);
    r['district-only'].checked = false; r['district-only'].listeners.change(); await tick();
    assert.equal(observer.targets.size, 4, '행정동·법정동 이름 유무 4종 모두 구·시 외곽선 보정');
    const plain = r.maps.children[1].children[1].children[0];
    observer.resize(plain);
    const plainSource = await responsive.blobs.get(plain.src).text();
    assert.equal(Number(plainSource.match(/stroke="#111" stroke-width="([\d.]+)"/)[1]), 1.6, '이름 없는 동 지도도 기존 선 굵기 유지');
    assert.ok(Number(plainSource.match(/data-layer="region-outlines"[^>]*stroke-width="([\d.]+)"/)[1]) > 1.6, '동 표시 상태에서도 구·시 외곽선만 굵게 표시');
    assert.ok(!plainSource.includes('<text'));
    r.disconnect.click(); await tick();
    assert.equal(observer.targets.size, 2, '단독 법정동도 같은 표시용 경계와 외곽선 보정 사용');
    const storage = new Map(), fontUI = setup('', undefined, undefined, storage), f = fontUI.elements;
    assert.equal(f.fontSelect.children.length, 11, '다른 페이지와 같은 11개 글씨체');
    f.fontSelect.value = 'old_studio3'; f.fontSelect.listeners.change();
    await Promise.all([fontUI.window.BlankMapFonts.font('old_studio3'), fontUI.window.BlankMapFonts.originalMaps(23)]); await tick();
    assert.equal(storage.get('selectedFont'), 'old_studio3');
    assert.equal(fontUI.context.document.body.style.fontFamily, "'old_studio3', sans-serif");
    assert.equal(f.maps.children.length, 4);
    const styled = await fontUI.blobs.get(f.maps.children[0].children[1].children[0].src).text();
    assert.ok(styled.includes('font-family="old_studio3"'));
    assert.ok(styled.includes('data:font/woff2;base64,'));
    assert.equal(styled.match(/<path[^>]*>/)[0], fs.readFileSync(path.join(base, 'maps/23/admin-labeled.svg'), 'utf8').match(/<path[^>]*>/)[0], '단독 지도는 원본 경계 유지');
    assert.equal(f.maps.children[0].children[2].children[0].tagName, 'BUTTON', '선택한 폰트로 PNG 재생성');
    f['district-only'].checked = true; f['district-only'].listeners.change(); await tick();
    assert.ok((await fontUI.blobs.get(f.maps.children[0].children[1].children[0].src).text()).includes('font-family="old_studio3"'), '구만 표시에도 선택 글씨체 유지');
    const savedUI = setup('', undefined, undefined, storage);
    await Promise.all([savedUI.window.BlankMapFonts.font('old_studio3'), savedUI.window.BlankMapFonts.originalMaps(23)]); await tick();
    assert.equal(savedUI.elements.fontSelect.value, 'old_studio3', '다른 페이지와 같은 저장 키로 글씨체 복원');
    console.log('PASS: file: 환경에서 fetch 없이 실제 자료 스크립트 로딩, 연결·해제·미리보기·URL 복원·캐시·빠른 전환·실패 후 재시도·잘못된 자료 처리');
})().catch(error => { console.error(error); process.exitCode = 1; });
