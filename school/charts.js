/* 학교 상세 - 상단 지표 카드와 Chart.js 차트 */
window.SchoolCharts = (function () {
    'use strict';

    var PALETTE = ['#7a9fc4', '#8fbf9f', '#e0a96d', '#b48ec4', '#d98b8b', '#6fb3b8'];
    var charts = {};

    function destroy() {
        Object.keys(charts).forEach(function (k) {
            if (charts[k]) charts[k].destroy();
        });
        charts = {};
    }

    function n(v, digits) {
        if (v == null) return '-';
        return digits ? v.toFixed(digits) : Math.round(v).toLocaleString();
    }

    function stat(label, value) {
        return '<div class="stat"><div class="stat-label">' + label + '</div>' +
            '<div class="stat-value">' + value + '</div></div>';
    }

    function shell(title, sub, stats, boxes) {
        return '<div class="detail-title">' + title + '</div>' +
            '<div class="detail-sub">' + sub + '</div>' +
            '<div class="stat-grid">' + stats + '</div>' +
            '<div class="chart-grid">' + boxes + '</div>';
    }

    function box(id, heading) {
        return '<div class="chart-box"><h4>' + heading + '</h4>' +
            '<div class="chart-canvas"><canvas id="' + id + '"></canvas></div></div>';
    }

    function lastOf(arr) {
        if (!arr) return null;
        for (var i = arr.length - 1; i >= 0; i--) {
            if (arr[i] != null) return arr[i];
        }
        return null;
    }

    function baseOptions(extra) {
        var opts = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { font: { family: 'Noto Sans KR', size: 11 } } },
                tooltip: { bodyFont: { family: 'Noto Sans KR' }, titleFont: { family: 'Noto Sans KR' } }
            },
            scales: {
                x: { ticks: { font: { family: 'Noto Sans KR', size: 11 } }, grid: { display: false } },
                y: { ticks: { font: { family: 'Noto Sans KR', size: 11 } }, beginAtZero: true }
            }
        };
        return Object.assign(opts, extra || {});
    }

    /* ---------- 초등학교 ---------- */

    function elementaryHtml(s, sido) {
        var diff = (s.coh[5] == null || s.coh[0] == null) ? null : s.coh[5] - s.coh[0];
        var stats = stat('전교생', n(lastOf(s.t)) + '명') +
            stat('학급당 학생수', n(lastOf(s.cs), 1) + '명') +
            stat('학급수', n(lastOf(s.cl)) + '개') +
            stat('1학년', n(lastOf(s.gr[0])) + '명') +
            stat('6년 유지율', s.cr == null ? '-' : n(s.cr, 1) + '%') +
            stat('코호트 증감', diff == null ? '-' : (diff > 0 ? '+' : '') + n(diff) + '명');
        return shell(s.n, sido + ' ' + s.g + ' · ' + s.f,
            stats,
            box('chartCohort', '2021년 1학년 → 2026년 6학년 (같은 학생들의 인원 변화)') +
            box('chartGrades', '연도별 학년 구성') +
            box('chartTotal', '전교생수와 학급당 학생수 추이'));
    }

    function drawElementary(s, years) {
        destroy();
        var gradeLabels = ['1학년', '2학년', '3학년', '4학년', '5학년', '6학년'];

        charts.cohort = new Chart(document.getElementById('chartCohort'), {
            type: 'line',
            data: {
                labels: gradeLabels.map(function (g, i) { return g + '\n(' + (2021 + i) + ')'; }),
                datasets: [{
                    label: '인원',
                    data: s.coh,
                    borderColor: PALETTE[0],
                    backgroundColor: 'rgba(122,159,196,0.18)',
                    fill: true,
                    tension: 0.25,
                    pointRadius: 4
                }]
            },
            options: baseOptions({ plugins: { legend: { display: false } } })
        });

        charts.grades = new Chart(document.getElementById('chartGrades'), {
            type: 'bar',
            data: {
                labels: years,
                datasets: gradeLabels.map(function (label, i) {
                    return {
                        label: label,
                        data: s.gr[i],
                        backgroundColor: PALETTE[i]
                    };
                })
            },
            options: baseOptions({
                scales: {
                    x: { stacked: true, grid: { display: false }, ticks: { font: { family: 'Noto Sans KR', size: 11 } } },
                    y: { stacked: true, beginAtZero: true, ticks: { font: { family: 'Noto Sans KR', size: 11 } } }
                }
            })
        });

        charts.total = new Chart(document.getElementById('chartTotal'), {
            type: 'bar',
            data: {
                labels: years,
                datasets: [
                    { label: '전교생수', data: s.t, backgroundColor: PALETTE[0], yAxisID: 'y' },
                    {
                        label: '학급당 학생수', data: s.cs, type: 'line', borderColor: PALETTE[2],
                        backgroundColor: PALETTE[2], yAxisID: 'y1', tension: 0.25, pointRadius: 3
                    }
                ]
            },
            options: baseOptions({
                scales: {
                    x: { grid: { display: false }, ticks: { font: { family: 'Noto Sans KR', size: 11 } } },
                    y: { position: 'left', beginAtZero: true, title: { display: true, text: '명' } },
                    y1: {
                        position: 'right', beginAtZero: true, grid: { drawOnChartArea: false },
                        title: { display: true, text: '학급당(명)' }
                    }
                }
            })
        });
    }

    /* ---------- 중학교 ---------- */

    /* 연도별 (과고+외고/국제고+[자사고]+기타) / 졸업자 * 100. 진학 자료가 없는 해는 null */
    function eliteRates(s, withAu) {
        return s.grad.map(function (g, i) {
            if (!g || s.sci[i] == null) return null;
            var sum = s.sci[i] + s.fl[i] + s.etc[i] + (withAu ? s.au[i] : 0);
            return Math.round(sum / g * 1000) / 10;
        });
    }

    function middleHtml(s, sido, withAu) {
        var rateLabel = withAu ? '비율 (자사고 포함)' : '비율 (자사고 제외)';
        var stats = stat('졸업자', n(lastOf(s.grad)) + '명') +
            stat('과고', n(lastOf(s.sci)) + '명') +
            stat('외고/국제고', n(lastOf(s.fl)) + '명') +
            stat('자사고', n(lastOf(s.au)) + '명') +
            stat('기타', n(lastOf(s.etc)) + '명') +
            stat(rateLabel, n(lastOf(eliteRates(s, withAu)), 1) + '%');
        if (s.ach) {
            stats += stat('성취도 평균', n(s.ach.avg, 1) + '%') +
                stat('국어 / 영어 / 수학',
                    n(s.ach.kor, 1) + ' / ' + n(s.ach.eng, 1) + ' / ' + n(s.ach.math, 1));
        }
        return shell(s.n, sido + ' ' + s.g + ' · ' + s.f,
            stats,
            box('chartElite', '연도별 특목고·자사고·기타 진학자') +
            box('chartGrad', '졸업자수와 ' + rateLabel));
    }

    function drawMiddle(s, years, withAu) {
        destroy();

        charts.elite = new Chart(document.getElementById('chartElite'), {
            type: 'bar',
            data: {
                labels: years,
                datasets: [
                    { label: '과고', data: s.sci, backgroundColor: PALETTE[1] },
                    { label: '외고/국제고', data: s.fl, backgroundColor: PALETTE[0] },
                    { label: '자사고', data: s.au, backgroundColor: PALETTE[3] },
                    { label: '기타', data: s.etc, backgroundColor: PALETTE[2] }
                ]
            },
            options: baseOptions({
                scales: {
                    x: { stacked: true, grid: { display: false }, ticks: { font: { family: 'Noto Sans KR', size: 11 } } },
                    y: { stacked: true, beginAtZero: true, ticks: { font: { family: 'Noto Sans KR', size: 11 } } }
                }
            })
        });

        charts.grad = new Chart(document.getElementById('chartGrad'), {
            type: 'bar',
            data: {
                labels: years,
                datasets: [
                    { label: '졸업자수', data: s.grad, backgroundColor: PALETTE[0], yAxisID: 'y' },
                    {
                        label: withAu ? '비율 (자사고 포함)' : '비율 (자사고 제외)',
                        data: eliteRates(s, withAu), type: 'line', borderColor: PALETTE[4],
                        backgroundColor: PALETTE[4], yAxisID: 'y1', tension: 0.25, pointRadius: 3
                    }
                ]
            },
            options: baseOptions({
                scales: {
                    x: { grid: { display: false }, ticks: { font: { family: 'Noto Sans KR', size: 11 } } },
                    y: { position: 'left', beginAtZero: true, title: { display: true, text: '명' } },
                    y1: {
                        position: 'right', beginAtZero: true, grid: { drawOnChartArea: false },
                        title: { display: true, text: '%' }
                    }
                }
            })
        });
    }

    return {
        elementaryHtml: elementaryHtml,
        drawElementary: drawElementary,
        middleHtml: middleHtml,
        eliteRates: eliteRates,
        drawMiddle: drawMiddle
    };
})();
