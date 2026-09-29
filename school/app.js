/* 학교 데이터 대시보드 - 상태, 필터, 표 */
(function () {
    'use strict';

    var INDEX = window.schoolRegionIndex;
    var loaded = {};   // 'elem_01' -> 데이터
    var state = {
        tab: 'elem',
        sido: INDEX.order[0],
        sigungu: '',
        found: '',
        keyword: '',
        sortKey: null,
        sortAsc: false,
        selected: null,
        withAu: true       // 중학교 비율에 자사고 포함 여부
    };

    var COLUMNS = {
        elem: [
            { key: 'n', label: '학교명', type: 'text', get: function (s) { return s.n; } },
            { key: 'g', label: '시군구', type: 'text', get: function (s) { return s.g; } },
            { key: 'f', label: '설립', type: 'text', get: function (s) { return s.f; } },
            { key: 'total', label: '전교생', get: function (s) { return last(s.t); } },
            { key: 'perClass', label: '학급당', digits: 1, get: function (s) { return last(s.cs); } },
            { key: 'first', label: '1학년', get: function (s) { return last(s.gr[0]); } },
            { key: 'cr', label: '6년 유지율', suffix: '%', digits: 1, get: function (s) { return s.cr; } },
            {
                key: 'diff', label: '증감', signed: true, get: function (s) {
                    return (s.coh[5] == null || s.coh[0] == null) ? null : s.coh[5] - s.coh[0];
                }
            }
        ],
        mid: [
            { key: 'n', label: '학교명', type: 'text', get: function (s) { return s.n; } },
            { key: 'g', label: '시군구', type: 'text', get: function (s) { return s.g; } },
            { key: 'f', label: '설립', type: 'text', get: function (s) { return s.f; } },
            { key: 'grad', label: '졸업자', get: function (s) { return last(s.grad); } },
            { key: 'sci', label: '과고', get: function (s) { return last(s.sci); } },
            { key: 'fl', label: '외고/국제고', get: function (s) { return last(s.fl); } },
            { key: 'au', label: '자사고', get: function (s) { return last(s.au); } },
            { key: 'etc', label: '기타', get: function (s) { return last(s.etc); } },
            {
                key: 'er', label: '비율', suffix: '%', digits: 1,
                get: function (s) { return last(window.SchoolCharts.eliteRates(s, state.withAu)); }
            },
            { key: 'ach', label: '성취도(2016)', suffix: '%', digits: 1, get: function (s) { return s.ach ? s.ach.avg : null; } }
        ]
    };
    var DEFAULT_SORT = { elem: 'total', mid: 'grad' };

    function last(arr) {
        if (!arr) return null;
        for (var i = arr.length - 1; i >= 0; i--) {
            if (arr[i] != null) return arr[i];
        }
        return null;
    }

    function fmt(value, col) {
        if (value == null) return '<span class="muted">-</span>';
        if (col.type === 'text') return value;
        var text = col.digits ? value.toFixed(col.digits) : Math.round(value).toLocaleString();
        if (col.suffix) text += col.suffix;
        if (col.signed) {
            text = (value > 0 ? '+' : '') + text;
            return '<span class="' + (value > 0 ? 'pos' : value < 0 ? 'neg' : '') + '">' + text + '</span>';
        }
        return text;
    }

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var el = document.createElement('script');
            el.src = src;
            el.onload = resolve;
            el.onerror = function () { reject(new Error(src + ' 로드 실패')); };
            document.head.appendChild(el);
        });
    }

    function dataset() {
        var code = INDEX.regions[state.sido].code;
        return loaded[state.tab + '_' + code] || null;
    }

    function ensureData() {
        var code = INDEX.regions[state.sido].code;
        var key = state.tab + '_' + code;
        if (loaded[key]) return Promise.resolve(loaded[key]);
        var file = (state.tab === 'elem' ? 'data/elem_' : 'data/mid_') + code + '.js';
        var varName = (state.tab === 'elem' ? 'schoolElem_' : 'schoolMid_') + code;
        return loadScript(file).then(function () {
            loaded[key] = window[varName];
            return loaded[key];
        });
    }

    function visibleSchools() {
        var data = dataset();
        if (!data) return [];
        var kw = state.keyword.trim();
        var rows = data.schools.filter(function (s) {
            if (state.sigungu && s.g !== state.sigungu) return false;
            if (state.found && s.f !== state.found) return false;
            if (kw && s.n.indexOf(kw) === -1) return false;
            return true;
        });
        var key = state.sortKey || DEFAULT_SORT[state.tab];
        var col = COLUMNS[state.tab].filter(function (c) { return c.key === key; })[0];
        var asc = state.sortAsc;
        rows.sort(function (a, b) {
            var va = col.get(a), vb = col.get(b);
            if (va == null && vb == null) return 0;
            if (va == null) return 1;   // 값 없는 학교는 항상 뒤로
            if (vb == null) return -1;
            if (col.type === 'text') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
            return asc ? va - vb : vb - va;
        });
        return rows;
    }

    function renderSidoButtons() {
        var box = document.getElementById('sidoButtons');
        box.innerHTML = '';
        INDEX.order.forEach(function (sido) {
            var btn = document.createElement('button');
            btn.className = 'region-btn' + (sido === state.sido ? ' active' : '');
            btn.textContent = sido;
            btn.onclick = function () {
                state.sido = sido;
                state.sigungu = '';
                state.selected = null;
                refresh();
            };
            box.appendChild(btn);
        });
    }

    function renderFilters() {
        var region = INDEX.regions[state.sido];
        var list = state.tab === 'elem' ? region.sggElem : region.sggMid;
        var sel = document.getElementById('sigunguSelect');
        sel.innerHTML = '<option value="">시군구 전체</option>';
        list.forEach(function (sgg) {
            var opt = document.createElement('option');
            opt.value = sgg;
            opt.textContent = sgg;
            if (sgg === state.sigungu) opt.selected = true;
            sel.appendChild(opt);
        });

        var data = dataset();
        var founds = [];
        if (data) {
            data.schools.forEach(function (s) {
                if (s.f && founds.indexOf(s.f) === -1) founds.push(s.f);
            });
            founds.sort();
        }
        var fsel = document.getElementById('foundSelect');
        fsel.innerHTML = '<option value="">설립 전체</option>';
        founds.forEach(function (f) {
            var opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            if (f === state.found) opt.selected = true;
            fsel.appendChild(opt);
        });
    }

    function renderTable() {
        var cols = COLUMNS[state.tab];
        document.getElementById('auToggle').hidden = state.tab !== 'mid';
        var rows = visibleSchools();
        var sortKey = state.sortKey || DEFAULT_SORT[state.tab];

        var head = document.getElementById('tableHead');
        head.innerHTML = '';
        cols.forEach(function (col) {
            var th = document.createElement('th');
            th.textContent = col.key === 'er'
                ? (state.withAu ? '비율(자사고 포함)' : '비율(자사고 제외)')
                : col.label;
            if (col.key === sortKey) th.className = 'sorted' + (state.sortAsc ? ' asc' : '');
            th.onclick = function () {
                if (sortKey === col.key) {
                    state.sortAsc = !state.sortAsc;
                } else {
                    state.sortKey = col.key;
                    state.sortAsc = col.type === 'text';
                }
                renderTable();
            };
            head.appendChild(th);
        });

        var body = document.getElementById('tableBody');
        body.innerHTML = '';
        rows.forEach(function (s) {
            var tr = document.createElement('tr');
            if (state.selected && state.selected.c === s.c) tr.className = 'selected';
            tr.innerHTML = cols.map(function (col) {
                return '<td>' + fmt(col.get(s), col) + '</td>';
            }).join('');
            tr.onclick = function () {
                state.selected = s;
                renderTable();
                renderDetail();
                document.getElementById('detailPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
            };
            body.appendChild(tr);
        });

        var unit = state.tab === 'elem' ? '초등학교' : '중학교';
        document.getElementById('tableTitle').textContent =
            state.sido + ' ' + unit + ' ' + rows.length.toLocaleString() + '개교';
        document.getElementById('filterHint').textContent =
            state.tab === 'elem'
                ? '유지율은 2021년 1학년이 2026년 6학년이 될 때까지의 인원 변화입니다'
                : '진학 수치는 최신 공시연도(2025년) 기준, 비율은 졸업자 대비입니다';
    }

    function renderDetail() {
        var panel = document.getElementById('detailPanel');
        var s = state.selected;
        if (!s) {
            panel.innerHTML = '<div class="empty">학교를 선택하면 연도별 추이가 나타납니다.</div>';
            return;
        }
        var data = dataset();
        panel.innerHTML = state.tab === 'elem'
            ? window.SchoolCharts.elementaryHtml(s, state.sido)
            : window.SchoolCharts.middleHtml(s, state.sido, state.withAu);
        if (state.tab === 'elem') {
            window.SchoolCharts.drawElementary(s, data.years);
        } else {
            window.SchoolCharts.drawMiddle(s, data.years, state.withAu);
        }
    }

    function refresh() {
        renderSidoButtons();
        ensureData().then(function () {
            renderFilters();
            renderTable();
            renderDetail();
        }).catch(function (err) {
            document.getElementById('tableBody').innerHTML =
                '<tr><td colspan="10" class="empty">데이터를 불러오지 못했습니다: ' + err.message + '</td></tr>';
        });
    }

    function init() {
        document.querySelectorAll('.tab-btn').forEach(function (btn) {
            btn.onclick = function () {
                document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                state.tab = btn.dataset.tab;
                state.sigungu = '';
                state.found = '';
                state.sortKey = null;
                state.sortAsc = false;
                state.selected = null;
                refresh();
            };
        });
        document.getElementById('sigunguSelect').onchange = function () {
            state.sigungu = this.value;
            renderTable();
        };
        document.getElementById('foundSelect').onchange = function () {
            state.found = this.value;
            renderTable();
        };
        document.getElementById('auCheckbox').onchange = function () {
            state.withAu = this.checked;
            renderTable();
            renderDetail();
        };
        document.getElementById('searchInput').oninput = function () {
            state.keyword = this.value;
            renderTable();
        };
        refresh();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
