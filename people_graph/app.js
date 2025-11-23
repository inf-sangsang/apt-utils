// 메인 애플리케이션 로직

let csvDataParsed = [];
let csvHouseholdDataParsed = [];
let currentLevel = 1;
let currentRegion = '';
let currentSortBy = '60대이상';
let currentHouseholdSortBy = 'name';
let currentDataDate = window.currentDataDate || '202510'; // Default to latest data

// 전역 차트 변수
window.chart = null;
window.barChart = null;
window.ageGroupChart = null;
window.householdChart = null;

function loadCSV() {
    try {
        // Dynamically load data based on currentDataDate
        const ageDataVar = `csvData_${currentDataDate}_age`;
        const familyDataVar = `csvData_${currentDataDate}_family`;

        console.log(`Loading CSV for date: ${currentDataDate}`);
        console.log(`Looking for variables: ${ageDataVar}, ${familyDataVar}`);
        console.log(`Window keys starting with csvData:`, Object.keys(window).filter(k => k.startsWith('csvData')));

        // Check if data variables exist in global scope
        if (typeof window[ageDataVar] === 'undefined') {
            throw new Error(`Age data for ${currentDataDate} not found`);
        }
        if (typeof window[familyDataVar] === 'undefined') {
            throw new Error(`Family data for ${currentDataDate} not found`);
        }

        csvDataParsed = parseCSV(window[ageDataVar]);
        csvHouseholdDataParsed = parseCSV(window[familyDataVar]);
        initializeRegionSelect();
    } catch (error) {
        console.error('CSV 로드 오류:', error);
        document.getElementById('tableContainer').innerHTML =
            '<div class="no-data">CSV 파일을 로드할 수 없습니다: ' + error.message + '</div>';
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

    // Calculate total population
    // If a specific region is selected, use its data directly
    // Otherwise (e.g. '전체'), sum up the child regions
    let totalPopulation = 0;
    const selectedRegionRow = filteredData.find(row => cleanRegionName(row['행정구역']) === currentRegion);

    if (selectedRegionRow) {
        totalPopulation = parseInt(selectedRegionRow['총인구수'].replace(/,/g, '')) || 0;
    } else {
        totalPopulation = filteredData.reduce((sum, row) => {
            const pop = parseInt(row['총인구수'].replace(/,/g, '')) || 0;
            return sum + pop;
        }, 0);
    }

    // Get the selected region's household data
    let avgHouseholdSize = '-';
    if (filteredHouseholdData.length > 0 && currentRegion) {
        const selectedRegionData = filteredHouseholdData.find(row => {
            const regionName = cleanRegionName(row['행정구역']);
            return regionName === currentRegion;
        });

        if (selectedRegionData) {
            const avgSize = parseFloat(selectedRegionData['세대당 인구'].trim());
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
        tableHTML += `<td>${row['총인구수']}</td>`;

        const totalPop = parseInt(row['총인구수'].replace(/,/g, '')) || 1;

        ageGroupLabels.forEach(groupLabel => {
            const ageKeys = ageGroupMapping[groupLabel];
            let groupTotal = 0;

            ageKeys.forEach(ageKey => {
                const value = parseInt(row[`${ageKey}`].replace(/,/g, '')) || 0;
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
function initApp() {
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

    // Date selector event listener
    document.getElementById('dateSelect').addEventListener('change', function () {
        const selectedDate = this.value;
        if (selectedDate !== currentDataDate) {
            // Store selected date and reload
            sessionStorage.setItem('selectedDataDate', selectedDate);
            window.location.reload();
        }
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

    // Check if there's a stored data date selection
    const storedDate = sessionStorage.getItem('selectedDataDate');
    if (storedDate && window.availableDates && window.availableDates.includes(storedDate)) {
        currentDataDate = storedDate;
        const dateSelect = document.getElementById('dateSelect');
        if (dateSelect) {
            dateSelect.value = storedDate;
        }
    }

    loadCSV();
}

// Initialize app when document is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
