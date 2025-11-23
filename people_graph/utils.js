// 유틸리티 함수들

function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());

    return lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = values[index] || '';
        });
        return obj;
    });
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

function cleanRegionName(name) {
    return name.replace(/\s*\([^)]*\)/g, '').trim();
}

function getShortRegionName(name) {
    const cleaned = cleanRegionName(name);
    const parts = cleaned.split(' ').filter(p => p.length > 0);
    return parts[parts.length - 1] || cleaned;
}

function getRegionLevel(regionName) {
    const cleaned = cleanRegionName(regionName);
    const parts = cleaned.split(' ').filter(p => p.length > 0);
    return parts.length;
}

function calculateAgePercentages(row) {
    const ageGroupMapping = {
        '영유아': ['0~9세'],
        '10대': ['10~19세'],
        '20대': ['20~29세'],
        '30대': ['30~39세'],
        '40대': ['40~49세'],
        '50대': ['50~59세'],
        '60대이상': ['60~69세', '70~79세', '80~89세', '90~99세', '100세 이상']
    };

    const totalPop = parseInt(row['총인구수'].replace(/,/g, '')) || 1;
    const percentages = {};

    Object.keys(ageGroupMapping).forEach(groupLabel => {
        const ageKeys = ageGroupMapping[groupLabel];
        let groupTotal = 0;

        ageKeys.forEach(ageKey => {
            const value = parseInt(row[`${ageKey}`].replace(/,/g, '')) || 0;
            groupTotal += value;
        });

        percentages[groupLabel] = (groupTotal / totalPop) * 100;
    });

    return percentages;
}

function calculateAgeCounts(row) {
    const ageGroupMapping = {
        '영유아': ['0~9세'],
        '10대': ['10~19세'],
        '20대': ['20~29세'],
        '30대': ['30~39세'],
        '40대': ['40~49세'],
        '50대': ['50~59세'],
        '60대이상': ['60~69세', '70~79세', '80~89세', '90~99세', '100세 이상']
    };

    const counts = {};

    Object.keys(ageGroupMapping).forEach(groupLabel => {
        const ageKeys = ageGroupMapping[groupLabel];
        let groupTotal = 0;

        ageKeys.forEach(ageKey => {
            const value = parseInt(row[`${ageKey}`].replace(/,/g, '')) || 0;
            groupTotal += value;
        });

        counts[groupLabel] = groupTotal;
    });

    return counts;
}
