// 메인 애플리케이션 로직

let csvDataParsed = [];
let csvHouseholdDataParsed = [];
let currentLevel = 1;
let currentRegion = '';
let currentSortBy = '60대이상';
let currentHouseholdSortBy = 'name';

// 전역 차트 변수
window.chart = null;
window.barChart = null;
window.ageGroupChart = null;
window.householdChart = null;

function loadCSV() {
    try {
        csvDataParsed = parseCSV(csvData);
        csvHouseholdDataParsed = parseCSV(csvData_202510_family);
        initializeRegionSelect();
    } catch (error) {
        console.error('CSV 로드 오류:', error);
        document.getElementById('tableContainer').innerHTML =
            '<div class="no-data">CSV 파일을 로드할 수 없습니다.</div>';
    }
}

function initializeRegionSelect() {
    document.getElementById('regionSearch').value = '';
    hideDropdown();
}

function getRegionList() {
    const regions = new Set();
    csvDataParsed.forEach(row => {
        const regionName = cleanRegionName(row['행정구역']);
        const level = getRegionLevel(regionName);

        if (level === currentLevel) {
            regions.add(regionName);
        }
    });
    return Array.from(regions).sort();
}

function showDropdown(filteredRegions) {
    const dropdown = document.getElementById('dropdownList');
    dropdown.innerHTML = '';

    if (filteredRegions.length === 0) {
        dropdown.innerHTML = '<div class="no-results">검색 결과가 없습니다</div>';
        dropdown.classList.add('show');
        return;
    }

    filteredRegions.forEach(region => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = region;
        if (region === currentRegion) {
            item.classList.add('selected');
        }
        item.addEventListener('click', () => selectRegion(region));
        dropdown.appendChild(item);
    });

    dropdown.classList.add('show');
}

function hideDropdown() {
    const dropdown = document.getElementById('dropdownList');
    dropdown.classList.remove('show');
}

function selectRegion(region) {
    currentRegion = region;
    document.getElementById('regionSearch').value = region;
    hideDropdown();
    updateAllViews();
}

function searchRegions(query) {
    const regions = getRegionList();
    if (!query.trim()) {
        return regions;
    }
    return regions.filter(region =>
        region.toLowerCase().includes(query.toLowerCase())
    );
}

function getFilteredData() {
    if (!currentRegion) return [];

    const results = [];

    csvDataParsed.forEach(row => {
        const regionName = cleanRegionName(row['행정구역']);
        if (regionName === currentRegion) {
            results.push(row);
        }
    });

    csvDataParsed.forEach(row => {
        const regionName = cleanRegionName(row['행정구역']);

        if (regionName.startsWith(currentRegion) && regionName !== currentRegion) {
            const level = getRegionLevel(regionName);
            if (level === currentLevel + 1) {
                results.push(row);
            }
        }
    });

    return results;
}

function getFilteredHouseholdData() {
    if (!currentRegion) return [];

    const results = [];

    csvHouseholdDataParsed.forEach(row => {
        const regionName = cleanRegionName(row['행정구역']);
        if (regionName === currentRegion) {
            results.push(row);
        }
    });

    csvHouseholdDataParsed.forEach(row => {
        const regionName = cleanRegionName(row['행정구역']);

        if (regionName.startsWith(currentRegion) && regionName !== currentRegion) {
            const level = getRegionLevel(regionName);
            if (level === currentLevel + 1) {
                results.push(row);
            }
        }
    });

    return results;
}

function updateStats() {
    const filteredData = getFilteredData();
    const filteredHouseholdData = getFilteredHouseholdData();
    const statsGrid = document.getElementById('statsGrid');

    if (filteredData.length === 0) {
        statsGrid.innerHTML = '';
        return;
    }

    const totalPopulation = filteredData.reduce((sum, row) => {
        const pop = parseInt(row['2025년10월_계_총인구수'].replace(/,/g, '')) || 0;
        return sum + pop;
    }, 0);

    // Get the selected region's household data
    let avgHouseholdSize = '-';
    if (filteredHouseholdData.length > 0 && currentRegion) {
        const selectedRegionData = filteredHouseholdData.find(row => {
            const regionName = cleanRegionName(row['행정구역']);
            return regionName === currentRegion;
        });

        if (selectedRegionData) {
            const avgSize = parseFloat(selectedRegionData['2025년10월_세대당 인구'].trim());
            if (!isNaN(avgSize)) {
                avgHouseholdSize = avgSize.toFixed(2);
            }
        }
    }

    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-label">총 인구</div>
            <div class="stat-value">${totalPopulation.toLocaleString()}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">표시 지역 수</div>
            <div class="stat-value">${filteredData.length}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">지역 평균 세대당 인구수</div>
            <div class="stat-value">${avgHouseholdSize}</div>
        </div>
    `;
}

function updateTable() {
    const filteredData = getFilteredData();
    const container = document.getElementById('tableContainer');

    if (filteredData.length === 0) {
        container.innerHTML = '<div class="no-data">지역을 검색하거나 선택하면 데이터가 표시됩니다.</div>';
        return;
    }

    const sortedData = sortFilteredData([...filteredData], currentSortBy);

    const ageGroupMapping = {
        '영유아': ['0~9세'],
        '10대': ['10~19세'],
        '20대': ['20~29세'],
        '30대': ['30~39세'],
        '40대': ['40~49세'],
        '50대': ['50~59세'],
        '60대이상': ['60~69세', '70~79세', '80~89세', '90~99세', '100세 이상']
    };

    const ageGroupLabels = ['영유아', '10대', '20대', '30대', '40대', '50대', '60대이상'];

    let tableHTML = '<table><thead><tr>';
    tableHTML += '<th>행정구역</th>';
    tableHTML += '<th>총인구수</th>';
    ageGroupLabels.forEach(label => {
        tableHTML += `<th>${label}</th>`;
    });
    tableHTML += '</tr></thead><tbody>';

    sortedData.forEach(row => {
        tableHTML += '<tr>';
        tableHTML += `<td>${getShortRegionName(row['행정구역'])}</td>`;
        tableHTML += `<td>${row['2025년10월_계_총인구수']}</td>`;

        const totalPop = parseInt(row['2025년10월_계_총인구수'].replace(/,/g, '')) || 1;

        ageGroupLabels.forEach(groupLabel => {
            const ageKeys = ageGroupMapping[groupLabel];
            let groupTotal = 0;

            ageKeys.forEach(ageKey => {
                const value = parseInt(row[`2025년10월_계_${ageKey}`].replace(/,/g, '')) || 0;
                groupTotal += value;
            });

            const percentage = ((groupTotal / totalPop) * 100).toFixed(1);
            tableHTML += `<td>${groupTotal.toLocaleString()} (${percentage}%)</td>`;
        });
        tableHTML += '</tr>';
    });

    tableHTML += '</tbody></table>';
    container.innerHTML = tableHTML;
}

function updateAllViews() {
    const filteredData = getFilteredData();
    const filteredHouseholdData = getFilteredHouseholdData();
    updateStats();
    updateChart(filteredData, currentSortBy);
    updateBarChart(filteredData, currentSortBy);
    updateAgeGroupChart(filteredData, currentSortBy);
    updateHouseholdChart(filteredHouseholdData, currentSortBy, currentRegion, currentHouseholdSortBy);
    updateTable();
}

// 이벤트 리스너 설정
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.region-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentLevel = parseInt(this.dataset.level);
            currentRegion = '';
            document.getElementById('regionSearch').value = '';
            hideDropdown();
            updateAllViews();
        });
    });

    document.getElementById('sortSelect').addEventListener('change', function () {
        currentSortBy = this.value;
        updateAllViews();
    });

    document.getElementById('householdSortSelect').addEventListener('change', function () {
        currentHouseholdSortBy = this.value;
        updateAllViews();
    });

    const searchInput = document.getElementById('regionSearch');
    searchInput.addEventListener('input', function () {
        const query = this.value;
        const filteredRegions = searchRegions(query);
        showDropdown(filteredRegions);
    });

    searchInput.addEventListener('focus', function () {
        const query = this.value;
        const filteredRegions = searchRegions(query);
        showDropdown(filteredRegions);
    });

    document.addEventListener('click', function (e) {
        if (!e.target.closest('.search-container')) {
            hideDropdown();
        }
    });

    searchInput.addEventListener('keydown', function (e) {
        const dropdown = document.getElementById('dropdownList');
        const items = dropdown.querySelectorAll('.dropdown-item:not(.no-results)');
        let highlighted = dropdown.querySelector('.dropdown-item.highlight');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!highlighted) {
                items[0]?.classList.add('highlight');
            } else {
                highlighted.classList.remove('highlight');
                const next = highlighted.nextElementSibling;
                if (next && next.classList.contains('dropdown-item')) {
                    next.classList.add('highlight');
                } else {
                    items[0]?.classList.add('highlight');
                }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (highlighted) {
                highlighted.classList.remove('highlight');
                const prev = highlighted.previousElementSibling;
                if (prev && prev.classList.contains('dropdown-item')) {
                    prev.classList.add('highlight');
                } else {
                    items[items.length - 1]?.classList.add('highlight');
                }
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlighted) {
                highlighted.click();
            } else if (items.length === 1) {
                items[0].click();
            }
        } else if (e.key === 'Escape') {
            hideDropdown();
        }
    });

    loadCSV();
});
