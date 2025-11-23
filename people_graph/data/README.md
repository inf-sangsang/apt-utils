# 데이터 추가 가이드

## 새로운 월별 데이터 추가 방법

### 1. 데이터 파일 준비
새로운 월의 데이터를 추가하려면 다음 두 파일이 필요합니다:
- `csvData_YYYYMM_age.js` - 연령별 인구 데이터
- `csvData_YYYYMM_family.js` - 세대 데이터

예: 2025년 9월 데이터의 경우
- `csvData_202509_age.js`
- `csvData_202509_family.js`

### 2. 파일 형식
각 파일은 다음과 같은 형식이어야 합니다:

```javascript
// csvData_202509_age.js
const csvData = `
행정구역,총인구수,...
서울특별시,9876543,...
...
`;
```

```javascript
// csvData_202509_family.js
const csvData_202509_family = `
행정구역,총인구수,...
서울특별시,9876543,...
...
`;
```

**중요**: 
- 연령 데이터 파일은 항상 `csvData` 변수를 사용합니다
- 세대 데이터 파일은 `csvData_YYYYMM_family` 형식의 변수명을 사용합니다

### 3. 파일 위치
두 파일을 `people_graph/data/` 폴더에 저장합니다.

### 4. HTML 파일 업데이트
`peopleGraph.html` 파일을 열고 다음을 수정합니다:

#### a) 스크립트 태그 추가
```html
<script>
    // Available data dates configuration
    window.availableDates = ['202510', '202509']; // 새 날짜 추가
    window.currentDataDate = '202510'; // 최신 데이터로 유지
</script>
<script src="data/csvData_202510_age.js"></script>
<script src="data/csvData_202510_family.js"></script>
<script src="data/csvData_202509_age.js"></script> <!-- 새 파일 추가 -->
<script src="data/csvData_202509_family.js"></script> <!-- 새 파일 추가 -->
```

#### b) 날짜 선택 옵션 추가
```html
<select id="dateSelect">
    <option value="202510" selected>2025년 10월</option>
    <option value="202509">2025년 9월</option> <!-- 새 옵션 추가 -->
</select>
```

### 5. 기본 데이터 설정
가장 최신 데이터를 기본값으로 설정하려면:
- `window.currentDataDate`를 최신 날짜로 설정
- 해당 옵션에 `selected` 속성 추가

## 예시: 2025년 9월 데이터 추가

1. `people_graph/data/csvData_202509_age.js` 생성
2. `people_graph/data/csvData_202509_family.js` 생성
3. `peopleGraph.html` 수정:
   - `availableDates` 배열에 `'202509'` 추가
   - 스크립트 태그 2개 추가
   - select 옵션 추가

완료! 사용자는 이제 드롭다운에서 2025년 9월 데이터를 선택할 수 있습니다.
