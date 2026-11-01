/* Embedded fonts keep SVG images and PNG exports independent of page fonts. */
(function (root) {
    'use strict';
    const fonts = [
        ['Noto Sans KR', 'Noto Sans KR', 'sans'],
        ['Nanum Gothic', '나눔고딕', 'nanum'],
        ['Noto Serif KR', 'Noto Serif KR', 'serif'],
        ...[1, 2, 3, 4, 5].map(n => [`old_studio${n}`, `a옛날사진관${n}`, `old_studio${n}`]),
        ...['light', 'medium', 'bold'].map(w => [`esamanru_${w}`, `이사만루 ${w}`, `esamanru_${w}`])
    ];
    const assets = root.BLANK_MAP_ASSETS = Object.create(null), cache = new Map();
    function load(key) {
        if (!cache.has(key)) {
            const request = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                let timer, settled = false;
                const finish = error => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer); script.remove();
                    if (error || !assets[key]) reject(error || new Error(`Invalid asset: ${key}`));
                    else resolve(assets[key]);
                };
                script.src = `data/${key}.js`;
                script.onload = () => finish();
                script.onerror = () => finish(new Error(`Could not load ${key}`));
                timer = setTimeout(() => finish(new Error(`Timed out: ${key}`)), 15000);
                document.head.append(script);
            }).catch(error => { cache.delete(key); throw error; });
            cache.set(key, request);
        }
        return cache.get(key);
    }
    async function font(family) {
        const entry = fonts.find(f => f[0] === family);
        if (!entry) throw new Error('Unknown font');
        const data = await load(`fonts/${entry[2]}`);
        if (data.family !== family || !['truetype', 'woff2'].includes(data.format) || !['font/ttf', 'font/woff2'].includes(data.mime) || !/^[A-Za-z0-9+/=]+$/.test(data.data)) {
            cache.delete(`fonts/${entry[2]}`);
            throw new Error('Invalid font');
        }
        return { family, css: `@font-face{font-family:'${family}';src:url(data:${data.mime};base64,${data.data}) format('${data.format}');font-weight:100 900;font-style:normal;}` };
    }
    const mapCache = new Map();
    async function originalMaps(id) {
        if (!Number.isInteger(id) || id < 1 || id > 127) throw new Error('Unknown map');
        if (!mapCache.has(id)) {
            const request = load(`font-maps/${id}`).then(async packed => {
                const bytes = Uint8Array.from(atob(packed), c => c.charCodeAt(0));
                const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
                return JSON.parse(await new Response(stream).text());
            }).catch(error => { mapCache.delete(id); cache.delete(`font-maps/${id}`); throw error; });
            mapCache.set(id, request);
        }
        return mapCache.get(id);
    }
    function apply(source, selectedFont) {
        if (!selectedFont) return source;
        const family = selectedFont.family;
        if (!fonts.some(f => f[0] === family)) throw new Error('Unknown font');
        return source.replace(/font-family="[^"]*"/g, `font-family="${family}"`)
            .replace(/(<svg\b[^>]*>)/, `$1<style>${selectedFont.css}</style>`);
    }
    const api = { fonts, font, originalMaps, apply };
    if (typeof module !== 'undefined') module.exports = api;
    else root.BlankMapFonts = api;
})(typeof window === 'undefined' ? globalThis : window);
