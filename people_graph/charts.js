// 차트 관련 함수들

const AGE_GROUP_MAPPING = {
    '영유아': ['0~9세'],
    '10대': ['10~19세'],
    '20대': ['20~29세'],
    '30대': ['30~39세'],
    '40대': ['40~49세'],
    '50대': ['50~59세'],
    '60대이상': ['60~69세', '70~79세', '80~89세', '90~99세', '100세 이상']
};

const AGE_GROUP_LABELS = ['영유아', '10대', '20대', '30대', '40대', '50대', '60대이상'];

const COLORS = [
    '#f94144',
    '#f3722c',
    '#f8961e',
    '#f9c74f',
    '#90be6d',
    '#43aa8b',
    '#577590'
];

// 지역별 비교 차트용 확장 색상 팔레트 (35개)
const REGION_COLORS = [
    '#f94144', '#f3722c', '#f8961e', '#f9c74f', '#90be6d', '#43aa8b', '#577590',
    '#e76f51', '#e63946', '#f77f00', '#fcbf49', '#80b918', '#52b788', '#4d908e',
    '#277da1', '#3a86ff', '#8338ec', '#fb5607', '#ff006e', '#ffbe0b', '#006400',
    '#38b000', '#70e000', '#9b5de5', '#f15bb5', '#fee440', '#00bbf9', '#00f5d4',
    '#bd1e51', '#6a4c93', '#1982c4', '#8ac926', '#ff595e', '#ffca3a', '#c9ada7'
];

function updateChart(filteredData, currentSortBy) {
    if (filteredData.length === 0) {
        if (window.chart) {
            window.chart.destroy();
            window.chart = null;
        }
        return;
    }

    const sortedData = sortFilteredData(filteredData, currentSortBy);
    const regionLabels = sortedData.map(row => getShortRegionName(row['행정구역']));
    const datasets = [];

    AGE_GROUP_LABELS.forEach((label, index) => {
        datasets.push({
            label: label,
            data: sortedData.map(row => {
                const percentages = calculateAgePercentages(row);
                return percentages[label];
            }),
            backgroundColor: COLORS[index],
            borderColor: COLORS[index],
            borderWidth: 1
        });
    });

    const chartHeight = Math.min(Math.max(sortedData.length * 40, 300), 800);
    document.querySelector('#ageChart').parentElement.style.height = `${chartHeight}px`;

    const ctx = document.getElementById('ageChart').getContext('2d');

    if (window.chart) {
        window.chart.destroy();
    }

    window.chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: regionLabels,
            datasets: datasets
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: {
                            family: 'Noto Sans KR',
                            size: 11
                        },
                        padding: 10,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    padding: 10,
                    titleFont: {
                        size: 13,
                        family: 'Noto Sans KR'
                    },
                    bodyFont: {
                        size: 12,
                        family: 'Noto Sans KR'
                    },
                    callbacks: {
                        label: function (context) {
                            return context.dataset.label + ': ' + context.parsed.x.toFixed(1) + '%';
                        }
                    }
                },
                datalabels: {
                    color: '#fff',
                    font: {
                        size: 13,
                        weight: 'bold',
                        family: 'Noto Sans KR'
                    },
                    anchor: 'center',
                    align: 'center',
                    clip: false,
                    formatter: function (value) {
                        return value.toFixed(1) + '%';
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    max: 100,
                    ticks: {
                        callback: function (value) {
                            return value + '%';
                        },
                        font: {
                            family: 'Noto Sans KR',
                            size: 10
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                y: {
                    stacked: true,
                    ticks: {
                        font: {
                            family: 'Noto Sans KR',
                            size: 10
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}

function updateBarChart(filteredData, currentSortBy, currentRegion) {
    if (filteredData.length === 0) {
        if (window.barChart) {
            window.barChart.destroy();
            window.barChart = null;
        }
        return;
    }

    // Filter out the selected region itself, only show child regions
    const childRegionsOnly = filteredData.filter(row => {
        const regionName = cleanRegionName(row['행정구역']);
        return regionName !== currentRegion;
    });

    if (childRegionsOnly.length === 0) {
        if (window.barChart) {
            window.barChart.destroy();
            window.barChart = null;
        }
        return;
    }

    const sortedData = sortFilteredData(childRegionsOnly, currentSortBy, true);
    const regionLabels = sortedData.map(row => getShortRegionName(row['행정구역']));
    const datasets = [];

    AGE_GROUP_LABELS.forEach((label, index) => {
        datasets.push({
            label: label,
            data: sortedData.map(row => {
                const counts = calculateAgeCounts(row);
                return counts[label];
            }),
            backgroundColor: COLORS[index],
            borderColor: COLORS[index],
            borderWidth: 1
        });
    });

    const ctx = document.getElementById('barChart').getContext('2d');

    if (window.barChart) {
        window.barChart.destroy();
    }

    window.barChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: regionLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        font: {
                            family: 'Noto Sans KR',
                            size: 11
                        },
                        padding: 12,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    padding: 10,
                    titleFont: {
                        size: 13,
                        family: 'Noto Sans KR'
                    },
                    bodyFont: {
                        size: 12,
                        family: 'Noto Sans KR'
                    },
                    callbacks: {
                        label: function (context) {
                            return context.dataset.label + ': ' + context.parsed.y.toLocaleString() + '명';
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        font: {
                            family: 'Noto Sans KR',
                            size: 10
                        }
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            if (value >= 10000) {
                                return (value / 10000).toFixed(0) + '만';
                            }
                            return value.toLocaleString();
                        },
                        font: {
                            family: 'Noto Sans KR',
                            size: 10
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            }
        }
    });
}

function updateAgeGroupChart(filteredData, currentSortBy, currentRegion) {
    if (filteredData.length === 0) {
        if (window.ageGroupChart) {
            window.ageGroupChart.destroy();
            window.ageGroupChart = null;
        }
        return;
    }

    // Filter out the selected region itself, only show child regions
    const childRegionsOnly = filteredData.filter(row => {
        const regionName = cleanRegionName(row['행정구역']);
        return regionName !== currentRegion;
    });

    if (childRegionsOnly.length === 0) {
        if (window.ageGroupChart) {
            window.ageGroupChart.destroy();
            window.ageGroupChart = null;
        }
        return;
    }

    const sortedData = sortFilteredData(childRegionsOnly, currentSortBy, true);
    const regionLabels = sortedData.map(row => getShortRegionName(row['행정구역']));
    const datasets = [];

    regionLabels.forEach((regionLabel, regionIndex) => {
        const row = sortedData[regionIndex];
        const totalPop = parseInt(row['총인구수'].replace(/,/g, '')) || 1;
        const ageData = [];

        AGE_GROUP_LABELS.forEach(groupLabel => {
            const ageKeys = AGE_GROUP_MAPPING[groupLabel];
            let groupTotal = 0;

            ageKeys.forEach(ageKey => {
                const value = parseInt(row[`${ageKey}`].replace(/,/g, '')) || 0;
                groupTotal += value;
            });

            ageData.push(groupTotal);
        });

        datasets.push({
            label: regionLabel,
            data: ageData,
            backgroundColor: REGION_COLORS[regionIndex],
            borderColor: REGION_COLORS[regionIndex],
            borderWidth: 1
        });
    });

    const ctx = document.getElementById('ageGroupChart').getContext('2d');

    if (window.ageGroupChart) {
        window.ageGroupChart.destroy();
    }

    window.ageGroupChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: AGE_GROUP_LABELS,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        font: {
                            family: 'Noto Sans KR',
                            size: 9
                        },
                        padding: 8,
                        usePointStyle: true,
                        boxWidth: 10
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    padding: 10,
                    titleFont: {
                        size: 13,
                        family: 'Noto Sans KR'
                    },
                    bodyFont: {
                        size: 12,
                        family: 'Noto Sans KR'
                    },
                    callbacks: {
                        label: function (context) {
                            return context.dataset.label + ': ' + context.parsed.y.toLocaleString() + '명';
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        font: {
                            family: 'Noto Sans KR',
                            size: 11
                        }
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            if (value >= 10000) {
                                return (value / 10000).toFixed(0) + '만';
                            }
                            return value.toLocaleString();
                        },
                        font: {
                            family: 'Noto Sans KR',
                            size: 10
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            }
        }
    });
}

function updateHouseholdChart(filteredData, currentSortBy, currentRegion, householdSortBy = 'name') {
    if (filteredData.length === 0) {
        if (window.householdChart) {
            window.householdChart.destroy();
            window.householdChart = null;
        }
        return;
    }

    // Filter out the selected region itself, only show child regions
    const childRegionsOnly = filteredData.filter(row => {
        const regionName = cleanRegionName(row['행정구역']);
        return regionName !== currentRegion;
    });

    if (childRegionsOnly.length === 0) {
        if (window.householdChart) {
            window.householdChart.destroy();
            window.householdChart = null;
        }
        return;
    }

    // Sort household data based on selected criteria
    const sortedData = [...childRegionsOnly].sort((a, b) => {
        if (householdSortBy === 'name') {
            const nameA = cleanRegionName(a['행정구역']);
            const nameB = cleanRegionName(b['행정구역']);
            return nameA.localeCompare(nameB);
        } else if (householdSortBy === 'population') {
            const popA = parseInt(a['총인구수'].replace(/,/g, '')) || 0;
            const popB = parseInt(b['총인구수'].replace(/,/g, '')) || 0;
            return popB - popA;
        } else if (householdSortBy === 'households') {
            const houseA = parseInt(a['세대수'].replace(/,/g, '')) || 0;
            const houseB = parseInt(b['세대수'].replace(/,/g, '')) || 0;
            return houseB - houseA;
        } else if (householdSortBy === 'avgSize') {
            const avgA = parseFloat(a['세대당 인구'].trim()) || 0;
            const avgB = parseFloat(b['세대당 인구'].trim()) || 0;
            return avgB - avgA;
        }
        return 0;
    });

    const regionLabels = sortedData.map(row => getShortRegionName(row['행정구역']));
    const populationData = [];
    const householdData = [];
    const avgHouseholdSizeData = [];

    sortedData.forEach(row => {
        const population = parseInt(row['총인구수'].replace(/,/g, '')) || 0;
        const households = parseInt(row['세대수'].replace(/,/g, '')) || 0;
        const avgSize = parseFloat(row['세대당 인구'].trim()) || 0;

        populationData.push(population);
        householdData.push(households);
        avgHouseholdSizeData.push(avgSize);
    });

    const ctx = document.getElementById('householdChart').getContext('2d');

    if (window.householdChart) {
        window.householdChart.destroy();
    }

    window.householdChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: regionLabels,
            datasets: [
                {
                    type: 'bar',
                    label: '총인구수',
                    data: populationData,
                    backgroundColor: '#156082',
                    borderColor: '#156082',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    type: 'bar',
                    label: '세대수',
                    data: householdData,
                    backgroundColor: '#E97132',
                    borderColor: '#E97132',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    type: 'line',
                    label: '세대당 인구',
                    data: avgHouseholdSizeData,
                    backgroundColor: '#0A6216',
                    borderColor: '#0A6216',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    yAxisID: 'y1',
                    datalabels: {
                        display: true,
                        align: 'top',
                        color: '#000000',
                        font: {
                            size: 11,
                            weight: 'bold',
                            family: 'Noto Sans KR'
                        },
                        formatter: function (value) {
                            return value.toFixed(2);
                        }
                    }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        font: {
                            family: 'Noto Sans KR',
                            size: 11
                        },
                        padding: 12,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    padding: 10,
                    titleFont: {
                        size: 13,
                        family: 'Noto Sans KR'
                    },
                    bodyFont: {
                        size: 12,
                        family: 'Noto Sans KR'
                    },
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.dataset.yAxisID === 'y1') {
                                label += context.parsed.y.toFixed(2);
                            } else {
                                label += context.parsed.y.toLocaleString();
                            }
                            return label;
                        }
                    }
                },
                datalabels: {
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: {
                        font: {
                            family: 'Noto Sans KR',
                            size: 10
                        }
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return value.toLocaleString();
                        },
                        font: {
                            family: 'Noto Sans KR',
                            size: 10
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    title: {
                        display: true,
                        text: '인구수 / 세대수',
                        font: {
                            family: 'Noto Sans KR',
                            size: 11
                        }
                    }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    max: 4,
                    ticks: {
                        callback: function (value) {
                            return value.toFixed(1);
                        },
                        font: {
                            family: 'Noto Sans KR',
                            size: 10
                        }
                    },
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: '세대당 인구 (명)',
                        font: {
                            family: 'Noto Sans KR',
                            size: 11
                        }
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}

function sortFilteredData(data, currentSortBy, useCounts = false) {
    if (currentSortBy === 'name') {
        return data.sort((a, b) => {
            const nameA = cleanRegionName(a['행정구역']);
            const nameB = cleanRegionName(b['행정구역']);
            return nameA.localeCompare(nameB);
        });
    } else {
        return data.sort((a, b) => {
            if (useCounts) {
                const countsA = calculateAgeCounts(a);
                const countsB = calculateAgeCounts(b);
                return countsB[currentSortBy] - countsA[currentSortBy];
            } else {
                const percA = calculateAgePercentages(a);
                const percB = calculateAgePercentages(b);
                return percB[currentSortBy] - percA[currentSortBy];
            }
        });
    }
}
