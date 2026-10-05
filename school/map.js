/* 공식 학교 좌표를 사용하는 지도. 라이브러리/위치 데이터는 지도 진입 시 로드한다. */
(function () {
    'use strict';
    var map, loading, locations, settings;
    var layers = {}, markers = { elem: {}, mid: {} }, signatures = {};
    var LABEL = { elem: '초등학교', mid: '중학교' };

    function script(src) {
        return new Promise(function (resolve, reject) {
            var tag = document.createElement('script');
            var timer = setTimeout(function () { fail(); }, 25000);
            function fail() {
                clearTimeout(timer);
                tag.remove();
                reject(new Error(src + ' 로드 실패'));
            }
            tag.src = src;
            tag.onload = function () { clearTimeout(timer); resolve(); };
            tag.onerror = fail;
            document.head.appendChild(tag);
        });
    }

    function last(values) {
        for (var i = values.length - 1; i >= 0; i--) if (values[i] != null) return values[i];
        return null;
    }

    function text(parent, tag, value, className) {
        var el = document.createElement(tag);
        el.textContent = value;
        if (className) el.className = className;
        parent.appendChild(el);
        return el;
    }

    function popup(school, kind) {
        var panel = document.createElement('div');
        panel.className = 'school-map-popup';
        text(panel, 'span', LABEL[kind], 'popup-kind ' + kind);
        text(panel, 'h3', school.n);
        text(panel, 'p', locations.positions[school.c][2], 'popup-address');
        if (kind === 'elem') {
            var total = last(school.t);
            text(panel, 'p', '전교생 ' + (total == null ? '자료 없음' : total.toLocaleString() + '명'));
        } else {
            var rates = window.SchoolCharts.eliteRates(school, settings.withAu);
            var rate = last(rates);
            text(panel, 'p', '특목·자사고 진학 비율 ' + (rate == null ? '자료 없음' : rate.toFixed(1) + '%') +
                (settings.withAu ? ' (자사고 포함)' : ' (자사고 제외)'));
            if (school.ach) text(panel, 'p', '성취도(2016) ' + school.ach.avg + '%');
        }
        var button = text(panel, 'button', '학교 상세 보기', 'popup-detail-btn');
        button.type = 'button';
        button.onclick = function () {
            settings.onSelect(school, kind);
            document.getElementById('detailPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        return panel;
    }

    function init() {
        var L = window.L;
        map = L.map('schoolMap', { scrollWheelZoom: false }).setView([36.2, 127.8], 7);
        var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        var failures = 0;
        tiles.on('tileerror', function () {
            if (++failures < 3) return;
            document.getElementById('mapTileNotice').hidden = false;
        });
        tiles.on('tileload', function () {
            failures = 0;
            document.getElementById('mapTileNotice').hidden = true;
        });
        ['elem', 'mid'].forEach(function (kind) {
            layers[kind] = L.markerClusterGroup({
                maxClusterRadius: 50,
                showCoverageOnHover: false,
                animate: false,
                iconCreateFunction: function (cluster) {
                    return L.divIcon({
                        className: 'school-cluster school-cluster-' + kind,
                        html: '<span>' + (kind === 'elem' ? '초' : '중') + '</span><strong>' + cluster.getChildCount().toLocaleString() + '</strong>',
                        iconSize: [48, 48]
                    });
                }
            });
        });
        var source = document.getElementById('mapSource');
        source.textContent = ' 위치 출처: ';
        var link = text(source, 'a', '공공데이터포털 (' + locations.referenceDate + ' 기준)');
        link.href = locations.source;
        link.target = '_blank';
        link.rel = 'noopener';
    }

    function load() {
        if (map) return Promise.resolve();
        if (loading) return loading;
        loading = Promise.all([
            (window.L ? Promise.resolve() : script('vendor/leaflet.js')).then(function () {
                return window.L.markerClusterGroup ? Promise.resolve() : script('vendor/leaflet.markercluster.js');
            }),
            window.schoolLocations ? Promise.resolve() : script('data/schoolLocations.js')
        ]).then(function () {
            locations = window.schoolLocations;
            if (!locations || !locations.positions || !window.L.markerClusterGroup) throw new Error('지도 자료 확인 실패');
            init();
        }).catch(function (err) {
            loading = null;
            throw err;
        });
        return loading;
    }

    function render(groups, options) {
        settings = options;
        map.invalidateSize({ pan: false });
        var L = window.L, bounds = [], total = 0, missing = 0, counts = {};
        ['elem', 'mid'].forEach(function (kind) {
            var schools = groups[kind];
            var valid = schools.filter(function (s) { return !!locations.positions[s.c]; });
            counts[kind] = valid.length;
            missing += schools.length - valid.length;
            total += valid.length;
            var signature = valid.map(function (s) { return s.c; }).join('|');
            if (signature !== signatures[kind]) {
                signatures[kind] = signature;
                layers[kind].clearLayers();
                layers[kind].addLayers(valid.map(function (s) {
                    if (!markers[kind][s.c]) {
                        var point = locations.positions[s.c];
                        var marker = L.marker(point.slice(0, 2), {
                            title: LABEL[kind] + ' · ' + s.n,
                            alt: LABEL[kind] + ' · ' + s.n,
                            icon: L.divIcon({ className: 'school-marker school-marker-' + kind,
                                html: kind === 'elem' ? '초' : '중', iconSize: [28, 28], iconAnchor: [14, 14] })
                        });
                        marker.bindPopup(function () { return popup(s, kind); });
                        marker.school = s;
                        marker.on('click', function () { settings.onSelect(s, kind); });
                        var name = document.createElement('span');
                        name.textContent = s.n;
                        marker.bindTooltip(name, { direction: 'top' });
                        markers[kind][s.c] = marker;
                    }
                    return markers[kind][s.c];
                }));
            }
            if (valid.length) {
                if (!map.hasLayer(layers[kind])) map.addLayer(layers[kind]);
                valid.forEach(function (s) { bounds.push(locations.positions[s.c].slice(0, 2)); });
            } else if (map.hasLayer(layers[kind])) map.removeLayer(layers[kind]);
        });
        if (options.fit && bounds.length) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });
        var status = '초등학교 ' + counts.elem.toLocaleString() + '개교 · 중학교 ' + counts.mid.toLocaleString() + '개교 표시';
        if (!groups.elem.length && !groups.mid.length) {
            status = (!document.getElementById('mapElemCheckbox').checked && !document.getElementById('mapMidCheckbox').checked)
                ? '지도에 표시할 학교를 체크해 주세요.' : '검색 결과가 없습니다.';
        } else if (!total) status = '검색된 학교의 위치 정보가 없습니다.';
        if (missing) status += ' · 위치를 확인할 수 없는 ' + missing.toLocaleString() + '개교는 지도에서 제외';
        document.getElementById('mapStatus').textContent = status;
        // 이미 열린 팝업의 비율도 토글 상태와 일치시킨다.
        ['elem', 'mid'].forEach(function (kind) {
            Object.keys(markers[kind]).forEach(function (code) {
                var marker = markers[kind][code];
                if (marker.isPopupOpen()) marker.setPopupContent(popup(marker.school, kind));
            });
        });
    }

    window.SchoolMap = { load: load, ready: function () { return !!map; }, render: render };
})();
