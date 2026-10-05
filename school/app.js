/* 학교 데이터 대시보드 - 상태, 필터, 표 */
(function () {
    'use strict';

    var INDEX = window.schoolRegionIndex;
    var pending = {};
    var refreshId = 0;
    var loaded = {};   // 'elem_01' -> 데이터
    var state = {
        view: 'list',
        mapLayers: { elem: true, mid: true },
        tab: 'elem',
        region: '',
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
            { key: 'g', label: '지역', type: 'text', get: function (s) { return s.sido + ' ' + s.g; } },
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
            { key: 'g', label: '지역', type: 'text', get: function (s) { return s.sido + ' ' + s.g; } },
            { key: 'f', label: '설립', type: 'text', get: function (s) { return s.f; } },
            { key: 'grad', label: '졸업자', get: function (s) { return last(s.grad); } },
            { key: 'sci', label: '과고', get: function (s) { return last(s.sci); } },
            { key: 'fl', label: '외고/국제고', get: function (s) { return last(s.fl); } },
            { key: 'au', label: '자사고', get: function (s) { return last(s.au); } },
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

    function dataset(school) {
        if (!school) return null;
        return loaded[state.tab + '_' + INDEX.regions[school.sido].code];
    }

    function ensureData(tab) {
        tab = tab || state.tab;
        return Promise.all(INDEX.order.map(function (sido) {
            var code = INDEX.regions[sido].code;
            var key = tab + '_' + code;
            if (loaded[key]) return Promise.resolve(loaded[key]);
            if (pending[key]) return pending[key];
            var varName = (tab === 'elem' ? 'schoolElem_' : 'schoolMid_') + code;
            pending[key] = loadScript('data/' + key + '.js').then(function () {
                var data = window[varName];
                data.schools.forEach(function (school) { school.sido = sido; });
                loaded[key] = data;
                delete pending[key];
                return data;
            }).catch(function (err) {
                delete pending[key];
                throw err;
            });
            return pending[key];
        }));
    }

    function allSchools(tab) {
        tab = tab || state.tab;
        return INDEX.order.reduce(function (rows, sido) {
            var data = loaded[tab + '_' + INDEX.regions[sido].code];
            return data ? rows.concat(data.schools) : rows;
        }, []);
    }

    function matchesFilters(s) {
        if (state.found && s.f !== state.found) return false;
        var kw = state.keyword.trim();
        if (kw) return [s.n, s.sido + s.n].concat(s.aliases || []).some(function (name) {
            return name.indexOf(kw) !== -1;
        });
        var location = s.sido + ' ' + s.g;
        return state.region.trim().split(/\s+/).filter(Boolean).every(function (part) {
            return location.indexOf(part) !== -1;
        });
    }

    function visibleSchools() {
        var rows = allSchools().filter(matchesFilters);
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

    function renderFilters() {
        var options = document.getElementById('regionOptions');
        options.innerHTML = '';
        INDEX.order.forEach(function (sido) {
            var region = INDEX.regions[sido];
            var list = state.view === 'map'
                ? Array.from(new Set(region.sggElem.concat(region.sggMid)))
                : state.tab === 'elem' ? region.sggElem : region.sggMid;
            [sido].concat(list.map(function (sgg) { return sido + ' ' + sgg; })).forEach(function (name) {
                var opt = document.createElement('option');
                opt.value = name;
                options.appendChild(opt);
            });
        });
        var schools = state.view === 'map' ? allSchools('elem').concat(allSchools('mid')) : allSchools();
        var founds = [];
        if (schools.length) {
            schools.forEach(function (s) {
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

        if (!rows.some(function (s) { return state.selected && s.c === state.selected.c; })) {
            state.selected = null;
            renderDetail();
        }
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

        if (!rows.length) body.innerHTML = '<tr><td colspan="' + cols.length + '" class="empty">검색 결과가 없습니다.</td></tr>';

        var unit = state.tab === 'elem' ? '초등학교' : '중학교';
        document.getElementById('tableTitle').textContent =
            (state.keyword.trim() ? '전국' : state.region.trim() || '전국') + ' ' + unit + ' ' + rows.length.toLocaleString() + '개교';
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
        var data = dataset(s);
        panel.innerHTML = state.tab === 'elem'
            ? window.SchoolCharts.elementaryHtml(s, s.sido)
            : window.SchoolCharts.middleHtml(s, s.sido, state.withAu);
        if (state.tab === 'elem') {
            window.SchoolCharts.drawElementary(s, data.years);
        } else {
            window.SchoolCharts.drawMiddle(s, data.years, state.withAu);
        }
    }

    var mapTimer;
    function renderActive(fit) {
        if (state.view === 'list') {
            renderTable();
            return;
        }
        clearTimeout(mapTimer);
        mapTimer = setTimeout(function () {
            if (state.view !== 'map' || !window.SchoolMap.ready()) return;
            var groups = {};
            ['elem', 'mid'].forEach(function (kind) {
                groups[kind] = state.mapLayers[kind] ? allSchools(kind).filter(matchesFilters) : [];
            });
            if (state.selected && !groups.elem.concat(groups.mid).some(function (s) { return s.c === state.selected.c; })) {
                state.selected = null;
                renderDetail();
            }
            document.getElementById('auToggle').hidden = !state.mapLayers.mid;
            document.getElementById('filterHint').textContent = '학교 표시를 누르면 학생수와 진학 현황을 볼 수 있습니다.';
            window.SchoolMap.render(groups, {
                fit: !!fit,
                withAu: state.withAu,
                onSelect: function (school, kind) {
                    if (state.tab !== kind) {
                        state.sortKey = null;
                        state.sortAsc = false;
                    }
                    state.tab = kind;
                    state.selected = school;
                    syncTabs();
                    renderDetail();
                }
            });
        }, 180);
    }

    function syncTabs() {
        document.querySelectorAll('.tab-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.tab === state.tab);
        });
    }

    function refresh(fit) {
        var id = ++refreshId;
        var isMap = state.view === 'map';
        if (isMap) document.getElementById('mapStatus').textContent = '학교 위치를 불러오는 중입니다.';
        else document.getElementById('tableBody').innerHTML = '<tr><td colspan="10" class="empty">학교 데이터를 불러오는 중입니다.</td></tr>';
        var work = isMap
            ? Promise.all([ensureData('elem'), ensureData('mid'), window.SchoolMap.load()])
            : ensureData();
        work.then(function () {
            if (id !== refreshId) return;
            renderFilters();
            renderActive(fit);
            renderDetail();
        }).catch(function (err) {
            if (id !== refreshId) return;
            if (isMap) {
                document.getElementById('mapStatus').textContent = '지도를 불러오지 못했습니다. 목록으로 확인하거나 다시 시도해 주세요.';
            } else {
                document.getElementById('tableBody').textContent = '데이터를 불러오지 못했습니다: ' + err.message;
            }
        });
    }

    function init() {
        document.querySelectorAll('.view-btn').forEach(function (btn) {
            btn.onclick = function () {
                if (state.view === btn.dataset.view) {
                    if (state.view === 'map' && !window.SchoolMap.ready()) refresh(true);
                    return;
                }
                state.view = btn.dataset.view;
                document.querySelectorAll('.view-btn').forEach(function (b) {
                    var active = b.dataset.view === state.view;
                    b.classList.toggle('active', active);
                    b.setAttribute('aria-pressed', String(active));
                });
                document.getElementById('schoolTabs').hidden = state.view === 'map';
                document.getElementById('tablePanel').hidden = state.view === 'map';
                document.getElementById('mapPanel').hidden = state.view !== 'map';
                refresh(true);
            };
        });
        ['elem', 'mid'].forEach(function (kind) {
            document.getElementById(kind === 'elem' ? 'mapElemCheckbox' : 'mapMidCheckbox').onchange = function () {
                state.mapLayers[kind] = this.checked;
                renderActive(false);
            };
        });
        document.getElementById('mapFitButton').onclick = function () { renderActive(true); };

        document.querySelectorAll('.tab-btn').forEach(function (btn) {
            btn.onclick = function () {
                document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                state.tab = btn.dataset.tab;
                state.found = '';
                state.sortKey = null;
                state.sortAsc = false;
                state.selected = null;
                refresh();
            };
        });
        document.getElementById('regionInput').oninput = function () {
            state.region = this.value;
            renderActive(true);
        };
        document.getElementById('foundSelect').onchange = function () {
            state.found = this.value;
            renderActive(true);
        };
        document.getElementById('auCheckbox').onchange = function () {
            state.withAu = this.checked;
            renderActive(false);
            renderDetail();
        };
        document.getElementById('searchInput').oninput = function () {
            state.keyword = this.value;
            renderActive(true);
        };
        refresh();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
