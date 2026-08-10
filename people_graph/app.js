// 메인 애플리케이션 로직

let csvDataParsed = [];
let csvHouseholdDataParsed = [];
let currentLevel = 1;
let currentRegion = '';
let currentSortBy = '60대이상';
let currentHouseholdSortBy = 'name';
let currentDataDate = window.currentDataDate || '202511'; // Default to latest data
let currentAgeGrouping = 'default'; // default, group1, group2

// 전역 차트 변수
window.chart = null;
window.barChart = null;
window.ageGroupChart = null;
window.householdChart = null;

const PROVINCE_ALIASES = {
    '경기': '경기도',
    '강원': '강원특별자치도',
    '경북': '경상북도',
    '경남': '경상남도',
    '충북': '충청북도',
    '충남': '충청남도',
    '전북': '전북특별자치도',
    // 광주광역시 + 전라남도 통합 (구 명칭 '광주'/'전남' 모두 검색 가능하도록 유지)
    '전남': '전남광주통합특별시',
    '제주': '제주특별자치도',
    '대전': '대전광역시',
    '대구': '대구광역시',
    '광주': '전남광주통합특별시',
    '부산': '부산광역시',
    '울산': '울산광역시',
    '인천': '인천광역시',
    '서울': '서울특별시',
    '세종': '세종특별자치시'
};

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
    if (typeof window.regions !== 'undefined') {
        return window.regions;
    }
    return [];
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

function resolveRegionName(region) {
    // 1. Check exact alias match (e.g. '경기' -> '경기도')
    if (PROVINCE_ALIASES[region]) {
        return PROVINCE_ALIASES[region];
    }

    // 2. Check prefix match for composite names (e.g. '경기 수원시' -> '경기도 수원시')
    // Split by space to check the first part
    const parts = region.split(' ');
    const province = parts[0];

    if (PROVINCE_ALIASES[province]) {
        parts[0] = PROVINCE_ALIASES[province];
        return parts.join(' ');
    }

    return region;
}

function selectRegion(region) {
    const resolvedRegion = resolveRegionName(region);
    currentRegion = resolvedRegion;
    currentLevel = getRegionLevel(resolvedRegion); // Update level based on the RESOLVED name
    document.getElementById('regionSearch').value = region; // Keep user's selection visible
    hideDropdown();
    updateAllViews();
}

function getAllRegions() {
    const regions = new Set();
    csvDataParsed.forEach(row => {
        regions.add(cleanRegionName(row['행정구역']));
    });
    return Array.from(regions).sort();
}

function normalizeQuery(query) {
    let normalized = query.trim();
    for (const [alias, fullName] of Object.entries(PROVINCE_ALIASES)) {
        // 이미 전체 명칭으로 입력된 경우는 치환하지 않음 ('경기도' -> '경기도도' 방지)
        if (normalized.startsWith(fullName)) {
            break;
        }
        if (normalized.startsWith(alias)) {
            normalized = normalized.replace(alias, fullName);
            break;
        }
    }
    return normalized;
}

function searchRegions(query) {
    if (!query.trim()) {
        return getRegionList(); // Return all provided regions
    }

    const allRegions = getRegionList();
    const normalizedQuery = normalizeQuery(query).toLowerCase();
    const rawQuery = query.toLowerCase().trim();

    // Filter matches
    const matches = allRegions.filter(region => {
        const regionLower = region.toLowerCase();
        // Check both raw query and normalized query (so '경기' matches '경기...' and '경기도...')
        // Also check if the aliased version of the region matches
        // But simply: does the region name from the list contain the query?
        return regionLower.includes(normalizedQuery) || regionLower.includes(rawQuery);
    });

    return matches;
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

            tableHTML += `<td>${groupTotal.toLocaleString()}</td>`;
        });
        tableHTML += '</tr>';
    });

    tableHTML += '</tbody></table>';

    // Add Household Data Table
    const filteredHouseholdData = getFilteredHouseholdData();
    if (filteredHouseholdData.length > 0) {
        tableHTML += '<h3 style="margin-top: 30px; margin-bottom: 10px; color: #5a6c7d;">🏘️ 세대 현황</h3>';

        // Sort household data based on currentHouseholdSortBy
        const sortedHouseholdData = [...filteredHouseholdData].sort((a, b) => {
            if (currentHouseholdSortBy === 'name') {
                const nameA = cleanRegionName(a['행정구역']);
                const nameB = cleanRegionName(b['행정구역']);
                return nameA.localeCompare(nameB);
            } else if (currentHouseholdSortBy === 'population') {
                const popA = parseInt(a['총인구수'].replace(/,/g, '')) || 0;
                const popB = parseInt(b['총인구수'].replace(/,/g, '')) || 0;
                return popB - popA;
            } else if (currentHouseholdSortBy === 'households') {
                const houseA = parseInt(a['세대수'].replace(/,/g, '')) || 0;
                const houseB = parseInt(b['세대수'].replace(/,/g, '')) || 0;
                return houseB - houseA;
            } else if (currentHouseholdSortBy === 'avgSize') {
                const avgA = parseFloat(a['세대당 인구'].trim()) || 0;
                const avgB = parseFloat(b['세대당 인구'].trim()) || 0;
                return avgB - avgA;
            }
            return 0;
        });

        tableHTML += '<table><thead><tr>';
        tableHTML += '<th>행정구역</th>';
        tableHTML += '<th>총인구수</th>';
        tableHTML += '<th>세대수</th>';
        tableHTML += '<th>세대당 인구</th>';
        tableHTML += '</tr></thead><tbody>';

        sortedHouseholdData.forEach(row => {
            tableHTML += '<tr>';
            tableHTML += `<td>${getShortRegionName(row['행정구역'])}</td>`;
            tableHTML += `<td>${row['총인구수']}</td>`;
            tableHTML += `<td>${row['세대수']}</td>`;
            tableHTML += `<td>${row['세대당 인구']}</td>`;
            tableHTML += '</tr>';
        });

        tableHTML += '</tbody></table>';
    }

    container.innerHTML = tableHTML;
}

function updateAllViews() {
    const filteredData = getFilteredData();
    const filteredHouseholdData = getFilteredHouseholdData();
    updateStats();
    updateChart(filteredData, currentSortBy);
    updateBarChart(filteredData, currentSortBy, currentRegion, currentAgeGrouping);
    updateAgeGroupChart(filteredData, currentSortBy, currentRegion, currentAgeGrouping);
    updateHouseholdChart(filteredHouseholdData, currentSortBy, currentRegion, currentHouseholdSortBy);
    updateTable();
}

// 이벤트 리스너 설정
function initApp() {


    document.getElementById('sortSelect').addEventListener('change', function () {
        currentSortBy = this.value;
        updateAllViews();
    });

    document.getElementById('householdSortSelect').addEventListener('change', function () {
        currentHouseholdSortBy = this.value;
        updateAllViews();
    });

    document.getElementById('ageGroupSelect').addEventListener('change', function () {
        currentAgeGrouping = this.value;
        updateAllViews();
    });

    // Font selector event listener
    document.getElementById('fontSelect').addEventListener('change', function () {
        const selectedFont = this.value;
        // Update body font
        document.body.style.fontFamily = `'${selectedFont}', sans-serif`;

        // Update all elements that have explicit font-family
        const elementsWithFont = document.querySelectorAll('button, input, select, #regionSearch, .sort-section select');
        elementsWithFont.forEach(element => {
            element.style.fontFamily = `'${selectedFont}', sans-serif`;
        });

        // Save font preference
        localStorage.setItem('selectedFont', selectedFont);

        // Update charts to use new font
        updateAllViews();
    });

    // Load saved font preference
    const savedFont = localStorage.getItem('selectedFont');
    if (savedFont) {
        document.getElementById('fontSelect').value = savedFont;
        document.body.style.fontFamily = `'${savedFont}', sans-serif`;
        const elementsWithFont = document.querySelectorAll('button, input, select, #regionSearch, .sort-section select');
        elementsWithFont.forEach(element => {
            element.style.fontFamily = `'${savedFont}', sans-serif`;
        });
    }

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
