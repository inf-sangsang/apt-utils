/* node blank_map/tests/fonts.test.js — embedded fonts and unchanged map vectors */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const base = path.join(__dirname, '..');
const sandbox = { window: {}, atob, Uint8Array, Blob, Response, DecompressionStream, setTimeout, clearTimeout };
sandbox.document = {
    createElement: () => ({ remove() {} }),
    head: { append(script) {
        Promise.resolve().then(() => {
            vm.runInContext(fs.readFileSync(path.join(base, script.src), 'utf8'), context);
            script.onload();
        }).catch(() => script.onerror());
    } }
};
const context = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(base, 'font-engine.js'), 'utf8'), context);
const engine = sandbox.window.BlankMapFonts;
(async () => {
    assert.equal(engine.fonts.length, 11);
    for (const [family] of engine.fonts) {
        const font = await engine.font(family);
        const sample = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M 0,0 L 10,10"/><text font-family="old">강남구</text></svg>';
        const result = engine.apply(sample, font);
        assert.ok(result.includes(`font-family="${family}"`));
        assert.ok(result.includes('src:url(data:font/'), 'SVG에 폰트를 내장해 이미지·다운로드에 적용');
        assert.ok(result.includes('<path d="M 0,0 L 10,10"/>'));
    }
    await assert.rejects(engine.font('unknown'));
    for (let id = 1; id <= 129; id++) {
        const maps = await engine.originalMaps(id);
        for (const kind of ['admin', 'legal']) {
            assert.equal(maps[kind], fs.readFileSync(path.join(base, `maps/${id}/${kind}-labeled.svg`), 'utf8'), `${id} ${kind}: 원본 경계와 글자 위치 보존`);
        }
    }
    console.log('PASS: 11개 글씨체 내장, 129개 지역 원본 벡터·라벨 위치 보존, file:에서 fetch 없이 로딩');
})().catch(error => { console.error(error); process.exitCode = 1; });
