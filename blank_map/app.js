(() => {
    'use strict';
    const regions = window.BLANK_MAP_REGIONS;
    const $ = id => document.getElementById(id);
    const province = $('province');
    const search = $('search');
    const list = $('regions');
    const dialog = $('preview');
    const variants = [
        { file: 'admin-labeled', kind: '행정동', label: '이름 있음' },
        { file: 'admin-blank', kind: '행정동', label: '이름 없음' },
        { file: 'legal-labeled', kind: '법정동', label: '이름 있음' },
        { file: 'legal-blank', kind: '법정동', label: '이름 없음' }
    ];
    const normalize = value => value.normalize('NFC').replace(/\s/g, '').toLowerCase();
    const getHashRegion = () => regions.find(r => String(r.id) === location.hash.slice(1));
    let selected = getHashRegion() || regions.find(r => r.sido === '서울특별시' && r.name === '강남구') || regions[0];
    for (const name of new Set(regions.map(r => r.sido))) {
        province.add(new Option(name, name));
    }
    function renderList() {
        const words = search.value.trim().split(/\s+/).map(normalize);
        const matches = regions.filter(r => (!province.value || province.value === r.sido) && words.every(word => normalize(r.sido + r.name).includes(word)));
        list.replaceChildren();
        let group;
        for (const region of matches) {
            if (group !== region.sido) {
                group = region.sido;
                const heading = document.createElement('p');
                heading.className = 'region-group';
                heading.textContent = group;
                list.append(heading);
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'region-button';
            button.textContent = region.name;
            button.dataset.id = region.id;
            button.setAttribute('aria-current', String(region.id === selected.id));
            button.addEventListener('click', () => selectRegion(region));
            list.append(button);
        }
        $('result-count').textContent = `${matches.length}개 지역`;
        $('empty').hidden = matches.length > 0;
    }
    function selectRegion(region, updateHash = true) {
        selected = region;
        if (updateHash) history.replaceState(null, '', `#${region.id}`);
        $('region-province').textContent = region.sido;
        $('region-title').textContent = region.name;
        $('region-counts').textContent = `행정동 ${region.adminCount}개 · 법정동 ${region.legalCount}개`;
        document.title = `${region.name} 백지도 | APT Utils`;
        $('maps').replaceChildren();
        for (const variant of variants) {
            const title = `${region.sido} ${region.name} ${variant.kind} ${variant.label}`;
            const path = `maps/${region.id}/${variant.file}`;
            const card = document.createElement('article');
            card.className = 'map-card';
            const heading = document.createElement('div');
            heading.className = 'card-heading';
            const h3 = document.createElement('h3');
            h3.textContent = variant.kind;
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = variant.label;
            heading.append(h3, badge);
            const open = document.createElement('button');
            open.type = 'button';
            open.className = 'map-open';
            open.setAttribute('aria-label', `${title} 크게 보기`);
            const img = document.createElement('img');
            img.src = `${path}.svg`;
            img.alt = title;
            img.width = 1400;
            img.height = 1300;
            open.append(img);
            open.addEventListener('click', () => {
                $('preview-title').textContent = `${region.name} · ${variant.kind} · ${variant.label}`;
                $('preview-image').src = `${path}.svg`;
                $('preview-image').alt = title;
                dialog.showModal();
            });
            const actions = document.createElement('div');
            actions.className = 'card-actions';
            for (const format of ['png', 'svg']) {
                const link = document.createElement('a');
                link.className = `button${format === 'svg' ? ' secondary' : ''}`;
                link.href = `${path}.${format}`;
                link.download = `${region.sido}_${region.name}_${variant.file}.${format}`;
                link.textContent = `${format.toUpperCase()} 다운로드`;
                link.setAttribute('aria-label', `${title} ${format.toUpperCase()} 다운로드`);
                actions.append(link);
            }
            card.append(heading, open, actions);
            $('maps').append(card);
        }
        for (const button of list.querySelectorAll('.region-button')) {
            button.setAttribute('aria-current', String(button.dataset.id === String(region.id)));
        }
    }
    province.addEventListener('change', renderList);
    search.addEventListener('input', renderList);
    $('reset').addEventListener('click', () => { province.value = ''; search.value = ''; renderList(); search.focus(); });
    $('close-preview').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    window.addEventListener('hashchange', () => { const region = getHashRegion(); if (region) selectRegion(region, false); });
    renderList();
    selectRegion(selected, false);
    const active = list.querySelector('[aria-current="true"]');
    if (active) list.scrollTop = active.offsetTop - list.offsetTop - list.clientHeight / 2;
})();
