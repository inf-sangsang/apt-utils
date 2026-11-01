(() => {
    'use strict';
    // Later additions may appear at the end of the catalog. Keep each province
    // together without changing stable region IDs used by URLs and map files.
    const catalog = window.BLANK_MAP_REGIONS;
    const provinces = [...new Set(catalog.map(r => r.sido))];
    const regions = provinces.flatMap(sido => catalog.filter(r => r.sido === sido));
    const graph = window.BLANK_MAP_NEIGHBORS;
    const engine = window.BlankMapConnection;
    const $ = id => document.getElementById(id);
    const province = $('province'), search = $('search'), list = $('regions'), dialog = $('preview');
    const variants = [
        { file: 'admin-labeled', kind: '행정동', label: '이름 있음' },
        { file: 'admin-blank', kind: '행정동', label: '이름 없음' },
        { file: 'legal-labeled', kind: '법정동', label: '이름 있음' },
        { file: 'legal-blank', kind: '법정동', label: '이름 없음' }
    ];
    const normalize = value => value.normalize('NFC').replace(/\s/g, '').toLowerCase();
    const byId = id => regions.find(r => r.id === id);
    function hashRegions() {
        const ids = location.hash.slice(1).split('+').map(Number);
        return ids.every(id => byId(id)) && engine.connected(ids, graph) ? ids.map(byId) : null;
    }
    let selected = hashRegions() || [regions.find(r => r.sido === '서울특별시' && r.name === '강남구') || regions[0]];
    let renderVersion = 0, urls = [];
    const cache = new Map();
    for (const name of new Set(regions.map(r => r.sido))) province.add(new Option(name, name));

    function renderList() {
        const words = search.value.trim().split(/\s+/).map(normalize);
        const matches = regions.filter(r => (!province.value || province.value === r.sido) && words.every(word => normalize(r.sido + r.name).includes(word)));
        list.replaceChildren();
        let group;
        for (const region of matches) {
            if (group !== region.sido) {
                group = region.sido;
                const heading = document.createElement('p');
                heading.className = 'region-group'; heading.textContent = group; list.append(heading);
            }
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'region-button'; button.textContent = region.name;
            button.dataset.id = region.id;
            button.setAttribute('aria-current', String(selected.some(r => r.id === region.id)));
            button.addEventListener('click', () => selectRegions([region]));
            list.append(button);
        }
        $('result-count').textContent = `${matches.length}개 지역`;
        $('empty').hidden = matches.length > 0;
    }
    function renderConnections() {
        const ids = selected.map(r => r.id);
        $('connected-regions').replaceChildren();
        for (const region of selected) {
            const chip = document.createElement('span'); chip.className = 'connected-region';
            const name = document.createElement('span'); name.textContent = `${region.sido} ${region.name}`; chip.append(name);
            if (ids.length > 1) {
                const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×';
                remove.setAttribute('aria-label', `${region.name} 연결에서 제외`);
                const remaining = ids.filter(id => id !== region.id);
                remove.disabled = !engine.connected(remaining, graph);
                remove.title = remove.disabled ? '이 지역을 제외하면 나머지 지역이 서로 떨어집니다.' : `${region.name} 제외`;
                remove.addEventListener('click', () => selectRegions(selected.filter(r => r.id !== region.id)));
                chip.append(remove);
            }
            $('connected-regions').append(chip);
        }
        const neighbors = engine.candidates(ids, graph).map(byId).filter(Boolean);
        $('neighbor').replaceChildren();
        for (const r of neighbors) $('neighbor').add(new Option(`${r.sido} ${r.name}`, r.id));
        if (!neighbors.length) $('neighbor').add(new Option('연결 가능한 인접 지역이 없습니다', ''));
        $('neighbor').disabled = !neighbors.length;
        $('connect').disabled = !neighbors.length;
        $('disconnect').hidden = ids.length === 1;
        $('connection-note').hidden = ids.length === 1;
    }
    function saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    async function downloadPNG(source, filename, button) {
        button.disabled = true; button.textContent = 'PNG 생성 중…';
        try {
            await document.fonts.ready;
            const img = new Image(); img.src = source;
            await img.decode();
            const canvas = document.createElement('canvas');
            // Keep large combinations within common browser canvas limits.
            const ratio = Math.min(2, 8192/Math.max(img.naturalWidth, img.naturalHeight), Math.sqrt(24000000/(img.naturalWidth*img.naturalHeight)));
            canvas.width = Math.round(img.naturalWidth*ratio); canvas.height = Math.round(img.naturalHeight*ratio);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('PNG encoding failed');
            saveBlob(blob, filename);
        } catch (error) {
            $('connection-status').textContent = 'PNG를 만들지 못했습니다. 다시 시도하거나 SVG를 다운로드해 주세요.';
        } finally { button.disabled = false; button.textContent = 'PNG 다운로드'; }
    }
    function renderCards(items, name) {
        $('maps').replaceChildren();
        for (const [i, variant] of variants.entries()) {
            const item = items[i], title = `${name} ${variant.kind} ${variant.label}`;
            const card = document.createElement('article'); card.className = 'map-card';
            const heading = document.createElement('div'); heading.className = 'card-heading';
            const h3 = document.createElement('h3'); h3.textContent = variant.kind;
            const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = variant.label;
            heading.append(h3, badge);
            const open = document.createElement('button'); open.type = 'button'; open.className = 'map-open';
            open.setAttribute('aria-label', `${title} 크게 보기`);
            const img = document.createElement('img'); img.src = item.svg; img.alt = title; img.width = 1400; img.height = 1300;
            open.append(img);
            open.addEventListener('click', () => {
                $('preview-title').textContent = `${name} · ${variant.kind} · ${variant.label}`;
                $('preview-image').src = item.svg; $('preview-image').alt = title; dialog.showModal();
            });
            const actions = document.createElement('div'); actions.className = 'card-actions';
            for (const format of ['png', 'svg']) {
                const filename = `${name.replace(/\s/g, '_')}_${variant.file}.${format}`;
                const action = document.createElement(format === 'png' && !item.png ? 'button' : 'a');
                action.className = `button${format === 'svg' ? ' secondary' : ''}`;
                action.textContent = `${format.toUpperCase()} 다운로드`;
                action.setAttribute('aria-label', `${title} ${format.toUpperCase()} 다운로드`);
                if (action.tagName === 'BUTTON') {
                    action.type = 'button';
                    action.addEventListener('click', () => downloadPNG(item.svg, filename, action));
                } else { action.href = item[format]; action.download = filename; }
                actions.append(action);
            }
            card.append(heading, open, actions); $('maps').append(card);
        }
    }
    // Classic local scripts work both on file:// and HTTP. fetch() of a local
    // JSON file is blocked by browsers even when this page was opened locally.
    const geometry = window.BLANK_MAP_GEOMETRY = Object.create(null);
    async function loadGeometry(id) {
        if (!cache.has(id)) {
            const request = new Promise((resolve, reject) => {
                if (geometry[id]) { resolve(geometry[id]); return; }
                const script = document.createElement('script');
                let timer, settled = false;
                const finish = error => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    script.remove();
                    if (error) { reject(error); return; }
                    const data = geometry[id];
                    if (!data || data.id !== id || !Array.isArray(data.admin?.features) || !Array.isArray(data.legal?.features)) {
                        delete geometry[id];
                        reject(new Error(`Invalid map data: ${id}`));
                    } else resolve(data);
                };
                script.src = `data/connections/${id}.js`;
                script.async = true;
                script.onload = () => finish();
                script.onerror = () => finish(new Error(`Map data could not be loaded: ${id}`));
                timer = setTimeout(() => finish(new Error(`Map data timed out: ${id}`)), 15000);
                document.head.append(script);
            }).catch(error => { cache.delete(id); throw error; });
            cache.set(id, request);
        }
        return cache.get(id);
    }
    async function selectRegions(next, updateHash = true) {
        if (!engine.connected(next.map(r => r.id), graph)) return;
        selected = next;
        const version = ++renderVersion;
        if (updateHash) history.replaceState(null, '', `#${selected.map(r => r.id).join('+')}`);
        if (dialog.open) dialog.close();
        $('preview-image').removeAttribute('src');
        $('maps').replaceChildren();
        $('maps').removeAttribute('aria-busy');
        urls.forEach(url => URL.revokeObjectURL(url)); urls = [];
        const name = selected.map(r => r.name).join(' + ');
        $('region-province').textContent = [...new Set(selected.map(r => r.sido))].join(' · ');
        $('region-title').textContent = name;
        $('region-counts').textContent = `행정동 ${selected.reduce((s, r) => s+r.adminCount, 0)}개 · 법정동 ${selected.reduce((s, r) => s+r.legalCount, 0)}개`;
        document.title = `${name} 백지도 | APT Utils`;
        renderConnections(); renderList();
        if (selected.length === 1) {
            const region = selected[0];
            $('connection-status').textContent = '인접 지역을 선택하고 연결을 눌러 주세요.';
            renderCards(variants.map(v => ({ svg: `maps/${region.id}/${v.file}.svg`, png: `maps/${region.id}/${v.file}.png` })), name);
            return;
        }
        $('connection-status').textContent = '연결 지도를 만드는 중입니다…';
        $('maps').setAttribute('aria-busy', 'true');
        try {
            const data = await Promise.all(selected.map(r => loadGeometry(r.id)));
            if (version !== renderVersion) return;
            const items = variants.map(v => {
                const source = engine.svg(data, v.file.startsWith('admin') ? 'admin' : 'legal', v.file.endsWith('labeled'), `${name} ${v.kind} ${v.label}`);
                const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
                urls.push(url); return { svg: url };
            });
            renderCards(items, name);
            $('connection-status').textContent = `${selected.length}개 지역을 실제 위치와 같은 축척으로 연결했습니다.`;
        } catch (error) {
            if (version !== renderVersion) return;
            $('connection-status').textContent = '지도 자료를 불러오지 못했습니다. ';
            const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'button secondary'; retry.textContent = '다시 시도';
            retry.addEventListener('click', () => selectRegions(selected, false)); $('connection-status').append(retry);
        } finally { if (version === renderVersion) $('maps').removeAttribute('aria-busy'); }
    }
    province.addEventListener('change', renderList);
    search.addEventListener('input', renderList);
    $('connect').addEventListener('click', () => {
        const region = byId(Number($('neighbor').value));
        if (region && engine.candidates(selected.map(r => r.id), graph).includes(region.id)) selectRegions([...selected, region]);
    });
    $('disconnect').addEventListener('click', () => selectRegions([selected[0]]));
    $('reset').addEventListener('click', () => { province.value = ''; search.value = ''; renderList(); search.focus(); });
    $('close-preview').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    window.addEventListener('hashchange', () => { const next = hashRegions(); if (next) selectRegions(next, false); });
    selectRegions(selected, false);
    const active = list.querySelector('[aria-current="true"]');
    if (active) list.scrollTop = active.offsetTop - list.offsetTop - list.clientHeight / 2;
})();
