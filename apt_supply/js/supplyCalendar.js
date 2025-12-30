let activeTooltip = null;

// 타입트 완료 함수
function closeTooltip() {
    if (activeTooltip) {
        activeTooltip.remove();
        activeTooltip = null;
    }
}

// 타입트 열기 함수
function showTooltip(event, tooltipText) {
    event.stopPropagation();
    closeTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';

    // 내용과 복사 버튼을 담을 컨테이너
    const content = document.createElement('div');
    content.className = 'tooltip-content';
    content.textContent = tooltipText;
    tooltip.appendChild(content);

    // 복사 버튼
    const copyBtn = document.createElement('button');
    copyBtn.className = 'tooltip-copy-btn';
    copyBtn.innerHTML = '📋';
    copyBtn.title = '복사하기';
    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(tooltipText).then(() => {
            copyBtn.innerHTML = '✓';
            copyBtn.style.color = '#666';
            setTimeout(() => {
                copyBtn.innerHTML = '📋';
                copyBtn.style.color = '#666';
            }, 2000);
        });
    });
    tooltip.appendChild(copyBtn);

    document.body.appendChild(tooltip);
    activeTooltip = tooltip;

    const rect = event.target.getBoundingClientRect();
    tooltip.style.left = (rect.left + window.scrollX) + 'px';
    tooltip.style.top = (rect.bottom + window.scrollY + 5) + 'px';
}

// 문서 클릭 시 타입트 닫기
document.addEventListener('click', closeTooltip);

// DOM 요소 선택
const regionSearch = document.getElementById('regionSearch');
const searchResults = document.getElementById('searchResults');
const selectedRegionsDiv = document.getElementById('selectedRegions');
const tablesContainer = document.getElementById('tablesContainer');
const fontSelect = document.getElementById('fontSelect');

// 폰트 선택 이벤트
fontSelect.addEventListener('change', (e) => {
    const selectedFont = e.target.value;
    document.body.style.fontFamily = `'${selectedFont}', sans-serif`;
    localStorage.setItem('selectedFont', selectedFont);
});

// 저장된 폰트 불러오기
const savedFont = localStorage.getItem('selectedFont');
if (savedFont) {
    fontSelect.value = savedFont;
    document.body.style.fontFamily = `'${savedFont}', sans-serif`;
}

let selectedRegions = [];
let currentHighlightIndex = -1;
let currentSearchResults = [];
let displayedCount = 0; // 현재 표시된 항목 수
let filteredRegions = []; // 필터링된 전체 지역 목록
const ITEMS_PER_LOAD = 30; // 한 번에 로드할 항목 수
const yearRange = [2025, 2026, 2027, 2028, 2029, 2030];
const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

// 검색 결과 항목 하이라이트 업데이트
function updateHighlight() {
    const items = searchResults.querySelectorAll('.search-result-item');
    items.forEach((item, index) => {
        if (index === currentHighlightIndex) {
            item.classList.add('highlighted');
        } else {
            item.classList.remove('highlighted');
        }
    });
}

// 검색 결과에 항목 추가하는 함수
function appendRegionItems(startIndex, endIndex) {
    for (let i = startIndex; i < Math.min(endIndex, filteredRegions.length); i++) {
        const regionArr = filteredRegions[i];
        const div = document.createElement('div');
        div.className = 'search-result-item';
        const population = parseInt(regionArr[1]).toLocaleString();
        div.textContent = `${regionArr[0]} (인구: ${population})`;
        div.addEventListener('click', () => addRegion(regionArr[0]));
        searchResults.appendChild(div);
    }
    displayedCount = Math.min(endIndex, filteredRegions.length);
}

// 지역 검색 기능
regionSearch.addEventListener('input', (e) => {
    const searchTerm = e.target.value.trim().toLowerCase();
    searchResults.innerHTML = '';
    currentHighlightIndex = -1;
    displayedCount = 0;

    if (searchTerm.length < 1) {
        filteredRegions = [];
        currentSearchResults = [];
        return;
    }

    filteredRegions = regions
        .filter(r => r[0].toLowerCase().includes(searchTerm) && !selectedRegions.includes(r[0]));

    currentSearchResults = filteredRegions;

    if (filteredRegions.length > 0) {
        appendRegionItems(0, ITEMS_PER_LOAD);

        // 스크롤 이벤트 추가 (검색 결과가 있을 때만)
        searchResults.onscroll = null; // 기존 리스너 제거
        searchResults.onscroll = handleSearchResultsScroll;
    }
});

// Focus 이벤트 - focus 시 기본 지역 목록 표시
regionSearch.addEventListener('focus', (e) => {
    if (regionSearch.value.trim().length === 0) {
        searchResults.innerHTML = '';
        currentHighlightIndex = -1;
        displayedCount = 0;

        filteredRegions = regions.filter(r => !selectedRegions.includes(r[0]));
        currentSearchResults = filteredRegions;

        if (filteredRegions.length > 0) {
            appendRegionItems(0, ITEMS_PER_LOAD);

            // 스크롤 이벤트 추가
            searchResults.onscroll = null; // 기존 리스너 제거
            searchResults.onscroll = handleSearchResultsScroll;
        }
    }
});

// Blur 이벤트 - focus가 풀렸을 때 dropdown 닫기
regionSearch.addEventListener('blur', (e) => {
    // blur 이벤트 후 아이템을 클릭할 수 있도록 약간의 지연 추가
    setTimeout(() => {
        searchResults.innerHTML = '';
        currentSearchResults = [];
        filteredRegions = [];
        displayedCount = 0;
        currentHighlightIndex = -1;
        searchResults.onscroll = null;
    }, 150);
});

// 검색 결과 스크롤 이벤트 핸들러
function handleSearchResultsScroll() {
    const scrollTop = searchResults.scrollTop;
    const scrollHeight = searchResults.scrollHeight;
    const clientHeight = searchResults.clientHeight;

    // 스크롤이 하단에 가까워지면 (200px 이내) 더 많은 항목 로드
    if (scrollTop + clientHeight >= scrollHeight - 200) {
        if (displayedCount < filteredRegions.length) {
            appendRegionItems(displayedCount, displayedCount + ITEMS_PER_LOAD);
        }
    }
}

// 키보드 이벤트 처리
regionSearch.addEventListener('keydown', (e) => {
    if (currentSearchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        currentHighlightIndex = Math.min(currentHighlightIndex + 1, currentSearchResults.length - 1);
        updateHighlight();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        currentHighlightIndex = Math.max(currentHighlightIndex - 1, -1);
        updateHighlight();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentHighlightIndex >= 0 && currentHighlightIndex < currentSearchResults.length) {
            addRegion(currentSearchResults[currentHighlightIndex][0]);
        }
    }
});

// 지역 추가 함수
function addRegion(region) {
    if (!selectedRegions.includes(region)) {
        selectedRegions.push(region);
        regionSearch.value = '';
        searchResults.innerHTML = '';
        currentSearchResults = [];
        currentHighlightIndex = -1;
        displayedCount = 0;
        filteredRegions = [];
        searchResults.onscroll = null; // 스크롤 이벤트 리스너 제거
        renderSelectedRegions();
        renderAllTables();
    }
}

// 지역 제거 함수
function removeRegion(region) {
    selectedRegions = selectedRegions.filter(r => r !== region);
    renderSelectedRegions();
    renderAllTables();
}

// 선택된 지역 렌더링
function renderSelectedRegions() {
    selectedRegionsDiv.innerHTML = '';
    if (selectedRegions.length === 0) {
        selectedRegionsDiv.innerHTML = '<p style="color: #999;">선택된 지역이 없습니다</p>';
    } else {
        selectedRegions.forEach((region, index) => {
            const tag = document.createElement('div');
            tag.className = 'region-tag';
            tag.draggable = true;
            tag.setAttribute('data-index', index);

            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.gap = '5px';

            // 위로 이동 버튼
            const upBtn = document.createElement('button');
            upBtn.className = 'move-btn';
            upBtn.textContent = '↑';
            upBtn.title = '위로 이동';
            upBtn.onclick = () => moveRegion(index, -1);
            if (index === 0) upBtn.disabled = true;

            // 아래로 이동 버튼
            const downBtn = document.createElement('button');
            downBtn.className = 'move-btn';
            downBtn.textContent = '↓';
            downBtn.title = '아래로 이동';
            downBtn.onclick = () => moveRegion(index, 1);
            if (index === selectedRegions.length - 1) downBtn.disabled = true;

            // 제거 버튼
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.textContent = '×';
            removeBtn.onclick = () => removeRegion(region);

            const span = document.createElement('span');
            span.textContent = region;

            tag.appendChild(span);
            buttonContainer.appendChild(upBtn);
            buttonContainer.appendChild(downBtn);
            buttonContainer.appendChild(removeBtn);
            tag.appendChild(buttonContainer);

            // 드래그 이벤트
            tag.addEventListener('dragstart', handleDragStart);
            tag.addEventListener('dragover', handleDragOver);
            tag.addEventListener('drop', handleDrop);
            tag.addEventListener('dragend', handleDragEnd);
            tag.addEventListener('dragenter', handleDragEnter);
            tag.addEventListener('dragleave', handleDragLeave);

            selectedRegionsDiv.appendChild(tag);
        });
    }
}

// 드래그 시작
let draggedElement = null;
function handleDragStart(e) {
    draggedElement = this;
    this.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
}

// 드래그 오버
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

// 드래그 진입
function handleDragEnter(e) {
    if (this !== draggedElement) {
        this.style.borderTop = '2px solid #4CAF50';
    }
}

// 드래그 떠남
function handleDragLeave(e) {
    this.style.borderTop = 'none';
}

// 드롭
function handleDrop(e) {
    e.preventDefault();
    if (this !== draggedElement) {
        const draggedIndex = parseInt(draggedElement.getAttribute('data-index'));
        const targetIndex = parseInt(this.getAttribute('data-index'));

        // 배열에서 요소 이동
        const [movedRegion] = selectedRegions.splice(draggedIndex, 1);
        selectedRegions.splice(targetIndex, 0, movedRegion);

        renderSelectedRegions();
        renderAllTables();
    }
    this.style.borderTop = 'none';
}

// 드래그 종료
function handleDragEnd(e) {
    this.style.opacity = '1';
    document.querySelectorAll('.region-tag').forEach(tag => {
        tag.style.borderTop = 'none';
    });
}

// 지역 순서 이동 함수
function moveRegion(index, direction) {
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < selectedRegions.length) {
        [selectedRegions[index], selectedRegions[newIndex]] = [selectedRegions[newIndex], selectedRegions[index]];
        renderSelectedRegions();
        renderAllTables();
    }
}

// 월 번호와 년도 추출 함수
function extractMonthYear(dateStr) {
    // dateStr 형식: "2025-01", "2026-02" 등
    const match = dateStr.match(/(\d{4})-(\d{2})/);
    if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        return { year, month };
    }
    return null;
}

// 캘린더 테이블 렌더링 함수
// 지역명으로 인구수를 찾는 함수
function getPopulationByRegion(regionName) {
    const found = regions.find(r => r[0] === regionName);
    return found ? parseInt(found[1]) : 0;
}

// 적정 공급량 계산 함수 (인구수 * 0.5%)
function calculateOptimalSupply(regionName) {
    const population = getPopulationByRegion(regionName);
    return Math.round(population * 0.005);
}

// 판단 등급 계산 함수
function getJudgmentGrade(totalSupply, optimalSupply) {
    if (totalSupply <= optimalSupply * 0.5) {
        return { grade: 'S (부족)', color: '#83ABD6' };
    } else if (totalSupply <= optimalSupply * 0.8) {
        return { grade: 'A (부족)', color: '#5FCEA4' };
    } else if (totalSupply <= optimalSupply * 1.0) {
        return { grade: 'A (적정)', color: '#5FCEA4' };
    } else if (totalSupply <= optimalSupply * 1.2) {
        return { grade: 'B (적정)', color: '#ECB751' };
    } else if (totalSupply <= optimalSupply * 1.4) {
        return { grade: 'B (초과)', color: '#ECB751' };
    } else if (totalSupply <= optimalSupply * 2.0) {
        return { grade: 'B (과잉)', color: '#ECB751' };
    } else {
        return { grade: 'C (적정)', color: '#ED6C69' };
    }
}

function renderTable(tableId, year, regions) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const calendarBody = table.querySelector('tbody');

    if (regions.length === 0) {
        calendarBody.innerHTML = `
            <tr>
                <td colspan="15" style="text-align: center; padding: 40px;">
                    지역을 선택하면 공급 현황이 표시됩니다
                </td>
            </tr>
        `;
        return;
    }

    calendarBody.innerHTML = '';

    regions.forEach(region => {
        const row = document.createElement('tr');
        const regionCell = document.createElement('td');
        regionCell.className = 'region-cell';
        regionCell.textContent = region;
        row.appendChild(regionCell);

        // 적정 공급 셀 추가
        const optimalCell = document.createElement('td');
        optimalCell.className = 'optimal-supply-cell';
        const optimalSupply = calculateOptimalSupply(region);
        optimalCell.textContent = optimalSupply.toLocaleString();
        row.appendChild(optimalCell);

        // 각 월별 합계 계산
        const monthlyData = [[], [], [], [], [], [], [], [], [], [], [], []]; // 각 월별 공급 데이터 저장
        const monthlyCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let totalCount = 0;

        // supplyData에서 해당 지역과 년도로 시작하는 데이터 찾기
        for (let i = 1; i < supplyData.length; i++) {
            const row_data = supplyData[i];
            const location = row_data[2]; // "소재지" 열
            const moveInDate = row_data[3]; // "입주시기" 열
            const complexName = row_data[1]; // "단지명" 열
            const households = parseInt(row_data[4], 10); // "총세대수" 열

            if (location && location.startsWith(region)) {
                const dateInfo = extractMonthYear(moveInDate);
                if (dateInfo && dateInfo.year === year && dateInfo.month >= 1 && dateInfo.month <= 12) {
                    const monthIndex = dateInfo.month - 1;
                    monthlyCounts[monthIndex] += households;
                    monthlyData[monthIndex].push({ complexName, households });
                    totalCount += households;
                }
            }
        }

        // 각 월별 셀 추가
        for (let i = 0; i < 12; i++) {
            const cell = document.createElement('td');
            cell.className = 'month-cell';
            cell.textContent = monthlyCounts[i].toLocaleString();

            // tooltip 데이터 추가
            if (monthlyData[i].length > 0) {
                const tooltipText = monthlyData[i]
                    .map(item => `${item.complexName}, ${item.households}세대`)
                    .join('\n');
                cell.setAttribute('data-tooltip', tooltipText);
                cell.classList.add('has-tooltip');
                cell.addEventListener('click', (e) => showTooltip(e, tooltipText));
            }

            row.appendChild(cell);
        }

        // 총합 셀
        const totalCell = document.createElement('td');
        totalCell.className = 'total-cell';
        totalCell.textContent = totalCount.toLocaleString();

        // 총합에 대한 tooltip 추가
        if (totalCount > 0) {
            const allComplexes = monthlyData.flat();
            const tooltipText = allComplexes
                .map(item => `${item.complexName}, ${item.households}세대`)
                .join('\n');
            totalCell.setAttribute('data-tooltip', tooltipText);
            totalCell.classList.add('has-tooltip');
            totalCell.addEventListener('click', (e) => showTooltip(e, tooltipText));
        }

        row.appendChild(totalCell);

        // 판단 셀 추가
        const judgmentCell = document.createElement('td');
        judgmentCell.className = 'judgment-cell';
        const judgment = getJudgmentGrade(totalCount, optimalSupply);
        judgmentCell.textContent = judgment.grade;
        judgmentCell.style.backgroundColor = judgment.color;
        judgmentCell.style.color = 'white';
        judgmentCell.style.fontWeight = '600';
        judgmentCell.style.textAlign = 'center';

        row.appendChild(judgmentCell);

        calendarBody.appendChild(row);
    });
}

// 모든 테이블 렌더링 함수
function renderAllTables() {
    tablesContainer.innerHTML = '';

    yearRange.forEach(year => {
        const tableId = `calendarTable-${year}`;

        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'table-wrapper';
        tableWrapper.innerHTML = `
            <div class="table-container">
                <table id="${tableId}">
                    <thead>
                        <tr>
                            <th>${year}년</th>
                            <th>적정 공급</th>
                            <th>1월</th>
                            <th>2월</th>
                            <th>3월</th>
                            <th>4월</th>
                            <th>5월</th>
                            <th>6월</th>
                            <th>7월</th>
                            <th>8월</th>
                            <th>9월</th>
                            <th>10월</th>
                            <th>11월</th>
                            <th>12월</th>
                            <th>총합</th>
                            <th>판단</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;

        tablesContainer.appendChild(tableWrapper);
        renderTable(tableId, year, selectedRegions);
    });

    // 기존에 그래프가 표시되어 있으면 자동 갱신
    if (document.getElementById('chartContainer') && document.getElementById('chartContainer').style.display !== 'none') {
        generateChart();
    }

    // 년도별 그래프 갱신
    generateYearlyChart();

    // 3개년 요약 테이블 갱신
    renderThreeYearSummary();
}

// 3개년 공급 현황 테이블 렌더링 함수
function renderThreeYearSummary() {
    const tbody = document.getElementById('threeYearSummaryBody');

    if (!tbody) return;

    if (selectedRegions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #999;">
                    지역을 선택하면 3개년 공급 현황이 표시됩니다
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';

    selectedRegions.forEach(region => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #ddd';

        // 지역명 셀
        const regionCell = document.createElement('td');
        regionCell.style.padding = '12px';
        regionCell.style.fontWeight = '500';
        regionCell.style.border = '1px solid #ddd';
        regionCell.textContent = region;
        row.appendChild(regionCell);

        // 적정 공급량 계산 (인구수 * 0.5%)
        const optimalSupply = calculateOptimalSupply(region);
        const optimalCell = document.createElement('td');
        optimalCell.style.padding = '12px';
        optimalCell.style.textAlign = 'right';
        optimalCell.style.border = '1px solid #ddd';
        optimalCell.style.background = '#fff9e6';
        optimalCell.textContent = optimalSupply.toLocaleString();
        row.appendChild(optimalCell);

        // regionYearlyData에서 해당 지역 찾기
        const regionData = regionYearlyData.find(r => r[0] === region);
        const yearlyData = regionData ? regionData[1] : {};

        // 2026, 2027, 2028년 데이터 가져오기
        const supply2026 = yearlyData['2026'] || 0;
        const supply2027 = yearlyData['2027'] || 0;
        const supply2028 = yearlyData['2028'] || 0;

        // 3개년 평균 계산
        const average = Math.round((supply2026 + supply2027 + supply2028) / 3);

        // 2026년 셀
        const cell2026 = document.createElement('td');
        cell2026.style.padding = '12px';
        cell2026.style.textAlign = 'right';
        cell2026.style.border = '1px solid #ddd';
        cell2026.textContent = supply2026.toLocaleString();
        row.appendChild(cell2026);

        // 2027년 셀
        const cell2027 = document.createElement('td');
        cell2027.style.padding = '12px';
        cell2027.style.textAlign = 'right';
        cell2027.style.border = '1px solid #ddd';
        cell2027.textContent = supply2027.toLocaleString();
        row.appendChild(cell2027);

        // 2028년 셀
        const cell2028 = document.createElement('td');
        cell2028.style.padding = '12px';
        cell2028.style.textAlign = 'right';
        cell2028.style.border = '1px solid #ddd';
        cell2028.textContent = supply2028.toLocaleString();
        row.appendChild(cell2028);

        // 평균 셀
        const avgCell = document.createElement('td');
        avgCell.style.padding = '12px';
        avgCell.style.textAlign = 'right';
        avgCell.style.border = '1px solid #ddd';
        avgCell.style.fontWeight = '600';
        avgCell.style.background = '#f8f9fa';
        avgCell.textContent = average.toLocaleString();
        row.appendChild(avgCell);

        // 판단 셀 (3개년 평균을 기준으로 판단)
        const judgment = getJudgmentGrade(average, optimalSupply);
        const judgmentCell = document.createElement('td');
        judgmentCell.style.padding = '12px';
        judgmentCell.style.textAlign = 'center';
        judgmentCell.style.border = '1px solid #ddd';
        judgmentCell.style.fontWeight = '600';
        judgmentCell.style.backgroundColor = judgment.color;
        judgmentCell.style.color = 'white';
        judgmentCell.textContent = judgment.grade;
        row.appendChild(judgmentCell);

        tbody.appendChild(row);
    });
}



// 그래프 관련 변수
let chartInstance = null;

// 그래프 생성 함수
function generateChart() {
    const startYear = parseInt(document.getElementById('startYear').value);
    const yearCount = parseInt(document.getElementById('yearCount').value);
    const chartContainer = document.getElementById('chartContainer');

    if (selectedRegions.length === 0) {
        alert('선택된 지역이 없습니다.');
        return;
    }

    // 연도 배열 생성
    const yearsToDisplay = [];
    for (let i = 0; i < yearCount; i++) {
        yearsToDisplay.push(startYear + i);
    }

    // 지역별 연도별 데이터 수집
    const chartData = {
        labels: selectedRegions,
        datasets: []
    };

    // 색상 팔레트
    const colors = [
        '#667eea',
        '#764ba2',
        '#f093fb',
        '#4facfe',
        '#43e97b',
        '#fa709a'
    ];

    // 각 연도별 데이터셋 생성
    yearsToDisplay.forEach((year, index) => {
        const yearData = [];

        selectedRegions.forEach(region => {
            let totalCount = 0;

            // supplyData에서 해당 지역과 년도의 데이터 찾기
            for (let i = 1; i < supplyData.length; i++) {
                const row = supplyData[i];
                if (row.length < 5) continue;

                const location = row[2]; // "소재지"
                const moveInDate = row[3]; // "입주시기"
                const households = parseInt(row[4], 10); // "총세대수"

                if (location && location.startsWith(region)) {
                    const dateInfo = extractMonthYear(moveInDate);
                    if (dateInfo && dateInfo.year === year) {
                        totalCount += households;
                    }
                }
            }

            yearData.push(totalCount);
        });

        chartData.datasets.push({
            label: `${year}년`,
            data: yearData,
            backgroundColor: colors[index % colors.length],
            borderColor: colors[index % colors.length],
            borderWidth: 1
        });
    });

    // 기존 차트 제거
    if (chartInstance) {
        chartInstance.destroy();
    }

    // 차트 생성
    const ctx = document.getElementById('supplyChart').getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                title: {
                    display: true,
                    text: `지역별 연도별 아파트 공급량`,
                    font: { size: 16, weight: 'bold' }
                },
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '공급 세대수'
                    },
                    ticks: {
                        callback: function (value) {
                            return value.toLocaleString();
                        }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '지역'
                    }
                }
            }
        }
    });

    chartContainer.style.display = 'block';
    chartContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 그래프 생성 버튼 이벤트
if (document.getElementById('generateGraphBtn')) {
    document.getElementById('generateGraphBtn').addEventListener('click', generateChart);

    // 선택 옵션 변경 시 자동 생성 (선택사항)
    document.getElementById('startYear').addEventListener('change', () => {
        if (document.getElementById('chartContainer').style.display !== 'none') {
            generateChart();
        }
    });

    document.getElementById('yearCount').addEventListener('change', () => {
        if (document.getElementById('chartContainer').style.display !== 'none') {
            generateChart();
        }
    });
}

// 년도별 공급량 그래프 생성 (모든 지역 합산)
let yearlyChartInstance = null;

function generateYearlyChart() {
    // regionYearlyData가 있는지 확인
    if (typeof regionYearlyData === 'undefined') {
        console.error('regionYearlyData를 불러올 수 없습니다.');
        return;
    }

    // selectedRegions이 없으면 표시하지 않음
    if (selectedRegions.length === 0) {
        if (yearlyChartInstance) {
            yearlyChartInstance.destroy();
        }
        return;
    }

    // 선택된 지역의 총 인구수 계산
    let totalPopulation = 0;
    selectedRegions.forEach(region => {
        const found = regions.find(r => r[0] === region);
        if (found) {
            totalPopulation += parseInt(found[1]);
        }
    });

    // 적정 공급량 (인구 × 0.5%)
    const optimalSupply = Math.round(totalPopulation * 0.005);

    // 색상 팔레트 (선택된 지역 개수만큼)
    const colors = [
        '#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#fa709a',
        '#feca57', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#dfe6e9',
        '#a29bfe', '#6c5ce7', '#0984e3', '#00b894', '#fdcb6e', '#e17055',
        '#74b9ff', '#a29bfe', '#6c5ce7', '#fd79a8', '#fdcb6e', '#6c5ce7'
    ];

    // 연도별 데이터 구조
    const years = [];
    for (let year = 2000; year <= 2030; year++) {
        years.push(`${year}년`);
    }

    // 적정 공급량 선을 먼저 추가 (레이어 맨 앞)
    const datasets = [];
    const optimalSupplyArray = years.map(() => optimalSupply);
    datasets.push({
        label: `적정 공급량 (${(Math.round(optimalSupply / 1000) / 10).toFixed(1) + '만'})`,
        data: optimalSupplyArray,
        type: 'line',
        borderColor: '#E94549',
        borderWidth: 2,
        backgroundColor: 'transparent',
        pointRadius: 0,
        tension: 0,
        order: 0
    });

    // 선택된 지역의 데이터셋 생성
    selectedRegions.forEach((selectedRegion, regionIndex) => {
        // regionYearlyData에서 선택된 지역 찾기
        const regionData = regionYearlyData.find(r => r[0] === selectedRegion);

        if (regionData) {
            const regionName = regionData[0];
            const yearlyData = regionData[1];
            const regionData_array = [];

            for (let year = 2000; year <= 2030; year++) {
                regionData_array.push(yearlyData[year.toString()] || 0);
            }

            datasets.push({
                label: regionName,
                data: regionData_array,
                type: 'bar',
                backgroundColor: colors[regionIndex % colors.length],
                borderColor: colors[regionIndex % colors.length],
                borderWidth: 0
            });
        }
    });

    // 기존 차트 제거
    if (yearlyChartInstance) {
        yearlyChartInstance.destroy();
    }

    // 차트 생성
    const ctx = document.getElementById('yearlySupplyChart').getContext('2d');

    // Custom 플러그인 정의 - 각 연도별 총합을 막대 맨 위에 표시
    const labelPlugin = {
        id: 'customLabel',
        afterDatasetsDraw(chart) {
            const { ctx: canvasCtx, data, chartArea } = chart;

            canvasCtx.font = 'bold 11px Arial';
            canvasCtx.fillStyle = '#000';
            canvasCtx.textAlign = 'center';
            canvasCtx.textBaseline = 'bottom';

            // 각 연도(dataIndex)별로 총합 계산 및 표시
            const numDataPoints = data.labels.length;

            for (let dataIndex = 0; dataIndex < numDataPoints; dataIndex++) {
                let total = 0;
                let topY = null;
                let x = null;

                // 모든 데이터셋(지역)을 순회하며 해당 연도의 총합 계산
                data.datasets.forEach((dataset, datasetIndex) => {
                    // line 타입은 스킵
                    if (dataset.type === 'line') return;

                    const meta = chart.getDatasetMeta(datasetIndex);
                    if (meta.hidden) return;

                    const value = dataset.data[dataIndex];
                    if (value && value > 0) {
                        total += value;

                        // 가장 위쪽 막대의 y 좌표 찾기
                        const datapoint = meta.data[dataIndex];
                        if (datapoint) {
                            const { x: barX, y: barY } = datapoint.getProps(['x', 'y'], true);
                            x = barX;
                            if (topY === null || barY < topY) {
                                topY = barY;
                            }
                        }
                    }
                });

                // 총합이 0보다 크고 위치를 찾았으면 레이블 표시
                if (total > 0 && topY !== null && x !== null) {
                    // 1000 단위로 반올림하여 소수점 표기 (예: 15000 -> 1.5만)
                    const rounded = Math.round(total / 1000) / 10;
                    const displayValue = rounded.toFixed(1) + '만';

                    // 막대 맨 위에 표시 (5px 위)
                    canvasCtx.fillText(displayValue, x, topY - 5);
                }
            }
        }
    };

    yearlyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: years,
            datasets: datasets
        },
        plugins: [labelPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                title: {
                    display: true,
                    text: '연도별 아파트 공급량 추이 (2000~2030)',
                    font: { size: 16, weight: 'bold' }
                },
                legend: {
                    display: true,
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        font: { size: 10 }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    title: {
                        display: true,
                        text: '연도'
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '공급 세대수'
                    },
                    ticks: {
                        callback: function (value) {
                            return value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

// 페이지 로드 후 년도별 그래프 생성
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        generateYearlyChart();
    }, 100);
});
