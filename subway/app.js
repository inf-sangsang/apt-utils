(() => {
  'use strict';
  const data = window.SUBWAY_DATA;
  const byId = new Map(data.map(row => [row.id, row]));
  const stationGroups = new Map();
  for (const row of data) {
    if (!stationGroups.has(row.station)) stationGroups.set(row.station, {id: 'station|' + row.station, station: row.station, members: [], lines: [], notes: [], regions: [], boarding: Array(7).fill(0), alighting: Array(7).fill(0)});
    const group = stationGroups.get(row.station);
    group.members.push(row.id);
    group.lines.push(row.line);
    for (const region of row.regions) {
      if (!group.regions.some(existing => existing.province === region.province && existing.city === region.city && existing.dong === region.dong)) group.regions.push(region);
    }
    if (row.note) group.notes.push(row.line + ' ' + row.note);
    for (let i = 0; i < 7; i++) { group.boarding[i] += row.boarding[i]; group.alighting[i] += row.alighting[i]; }
  }
  const mergedData = [...stationGroups.values()].map(group => ({...group, line: group.lines.join(' · '), note: group.notes.join(' / ')}));
  mergedData.forEach(row => byId.set(row.id, row));
  const storageKey = 'apt-utils-subway-selection-v1';
  const checked = new Set();
  let mergeLines = false;
  let selected = [];
  try { const saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (Array.isArray(saved)) selected = [...new Set(saved)].filter(id => byId.has(id)); } catch { /* Storage can be unavailable in private browsing. */ }
  const sort = { search: { key: 'station', direction: 1 }, selected: null };
  const $ = id => document.getElementById(id);
  const members = row => row.members || [row.id];
  const isSelected = row => members(row).some(id => selected.includes(id));
  const visibleData = () => mergeLines ? mergedData : data;
  const selectedRows = () => mergeLines ? [...new Set(selected.map(id => byId.get(id).station))].map(station => byId.get('station|' + station)) : selected.map(id => byId.get(id));
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const lineColors = {
    '1호선': '#0052A4', '2호선': '#00A84D', '3호선': '#EF7C1C',
    '4호선': '#00A4E3', '5호선': '#996CAC', '6호선': '#CD7C2F',
    '7호선': '#747F00', '8호선': '#E6186C', '9호선': '#BDB092',
    '인천1호선': '#759CCE', '인천2호선': '#F5A251',
    '경의중앙선': '#77C4A3', '경춘선': '#178C72', '수인분당선': '#FABE00',
    '경강선': '#0054A6', '서해선': '#8FC31F', '공항철도': '#0090D2',
    '신분당선': '#D20F46', '우이신설경전철': '#B7C450', '신림선': '#6789CA',
    '김포골드라인': '#AD8605', '용인에버라인': '#56AD2D',
    '의정부경전철': '#F39C00', 'GTX-A': '#9A6292'
  };
  const lineTag = line => {
    const color = lineColors[line] || '#60788A';
    const rgb = color.match(/[a-f\d]{2}/gi).map(hex => parseInt(hex, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    return `<span class="line-badge" style="--line-color:${color};--line-text:${luminance > .179 ? '#000000' : '#FFFFFF'}">${escape(line)}</span>`;
  };
  const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
  const collator = new Intl.Collator('ko', { numeric: true });
  const value = (row, key) => { const [component, index] = key.split(':'); return row[component][Number(index)]; };
  const announce = text => { $('status').textContent = text; };
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(selected)); } catch { $('save-note').textContent = '브라우저 저장을 사용할 수 없어 현재 창에서만 유지됩니다.'; } };
  const regionLabel = row => [...new Set(row.regions.map(region => [region.province, region.city].filter(Boolean).join(' ')))].join(' · ');
  const filtered = () => { const terms = $('search').value.trim().toLocaleLowerCase().split(/\s+/).map(term => term.replace(/역$/, '')).filter(Boolean); return visibleData().filter(row => (!$('line').value || (row.lines || [row.line]).includes($('line').value)) && terms.every(term => (row.station + row.line + row.regions.map(region => region.province + region.city + region.dong).join(' ')).replace(/\s/g, '').toLocaleLowerCase().includes(term))); };
  const sorted = (rows, kind) => { const s = sort[kind]; return s ? [...rows].sort((a, b) => (s.key === 'station' ? collator.compare(a.station, b.station) || collator.compare(a.line, b.line) : value(a, s.key) - value(b, s.key) || collator.compare(a.station, b.station)) * s.direction) : rows; };
  const sortHead = (key, text, kind, label = text, rowspan = 1) => { const active = sort[kind]?.key === key; const direction = active ? (sort[kind].direction === 1 ? 'ascending' : 'descending') : 'none'; return `<th scope="col" rowspan="${rowspan}" class="${key === 'station' ? 'station' : key.startsWith('boarding:') ? 'pair-start boarding' : 'alighting'}" aria-sort="${direction}"><button class="sort-button ${active ? 'active' : ''}" data-sort="${key}" aria-label="${label} 정렬">${text}${active ? (direction === 'ascending' ? ' ↑' : ' ↓') : ''}</button></th>`; };
  function header(kind) {
    const labels = ['07~08시', '08~09시', '17~18시', '18~19시', '평일 평균', '주말 평균', '일주일 이용량'];
    return `<tr>${kind === 'search' ? '<th class="check" rowspan="3"><input type="checkbox" id="check-visible" aria-label="검색 결과 모두 체크"></th>' : ''}${sortHead('station', '역 / 호선', kind, '역 / 호선', 3)}<th class="morning" colspan="4" scope="colgroup">출근 · 평일 평균</th><th class="evening" colspan="4" scope="colgroup">퇴근 · 평일 평균</th><th colspan="6" scope="colgroup">하루 평균 / 주간 합계</th><th rowspan="3" scope="col">${kind === 'search' ? '담기' : '삭제'}</th></tr><tr>${labels.map(label => `<th class="metric-group" colspan="2" scope="colgroup">${label}</th>`).join('')}</tr><tr>${labels.map((label, i) => sortHead('boarding:' + i, '승차', kind, label + ' 승차') + sortHead('alighting:' + i, '하차', kind, label + ' 하차')).join('')}</tr>`;
  }
  function rowHtml(row, kind) {
    const exists = isSelected(row);
    return `<tr>${kind === 'search' ? `<td class="check"><input type="checkbox" data-check="${escape(row.id)}" aria-label="${escape(row.station + ' ' + row.line)} 선택" ${checked.has(row.id) ? 'checked' : ''} ${exists ? 'disabled' : ''}></td>` : ''}<td class="station"><small class="station-region">${escape(regionLabel(row))}</small>${escape(row.station)}${(row.lines || [row.line]).map(lineTag).join('')}${row.note ? `<small class="data-note">${escape(row.note)}</small>` : ''}</td>${row.boarding.map((_, i) => ['boarding', 'alighting'].map(component => `<td class="${component === 'boarding' ? 'pair-start boarding' : 'alighting'}${i === 6 ? ' week' : ''}">${number.format(value(row, component + ':' + i))}</td>`).join('')).join('')}<td><button class="row-action ${kind === 'selected' ? 'remove' : ''}" data-${kind === 'search' ? 'add' : 'remove'}="${escape(row.id)}" aria-label="${escape(row.station + ' ' + row.line)} ${kind === 'search' ? '담기' : '삭제'}" ${kind === 'search' && exists ? 'disabled' : ''}>${kind === 'selected' ? '삭제' : exists ? '담음' : '담기'}</button></td></tr>`;
  }
  function updateChecked() {
    $('checked-count').textContent = checked.size;
    $('add-checked').disabled = !checked.size;
    const available = filtered().filter(row => !isSelected(row));
    const count = available.filter(row => checked.has(row.id)).length;
    const box = $('check-visible');
    box.checked = available.length > 0 && count === available.length;
    box.indeterminate = count > 0 && count < available.length;
    box.disabled = !available.length;
  }
  function render() {
    const results = filtered();
    for (const kind of ['search', 'selected']) {
      const table = $(kind + '-table');
      table.querySelector('thead').innerHTML = header(kind);
      const rows = sorted(kind === 'search' ? results : selectedRows(), kind);
      table.querySelector('tbody').innerHTML = rows.length ? rows.map(row => rowHtml(row, kind)).join('') : `<tr><td colspan="${kind === 'search' ? 17 : 16}" class="empty">${kind === 'search' ? '<strong>검색 결과가 없습니다.</strong>역명, 지역명 또는 호선을 바꿔 검색해 보세요.' : '<strong>아직 담은 역이 없습니다.</strong>위 표에서 비교할 역을 담아주세요.'}</td></tr>`;
    }
    $('result-count').textContent = results.length + '개 검색됨';
    $('selected-count').textContent = selectedRows().length;
    $('merge-lines').setAttribute('aria-checked', String(mergeLines));
    $('merge-note').textContent = mergeLines ? '이름이 같은 역의 모든 호선을 합산합니다. 호선 필터는 역 검색에만 적용됩니다.' : '같은 이름의 역은 호선별로 구분합니다.';
    $('clear').disabled = !selected.length;
    updateChecked();
  }
  function add(ids) { const added = ids.filter(id => byId.has(id) && !isSelected(byId.get(id))); selected = [...new Set([...selected, ...added.flatMap(id => members(byId.get(id)))])]; ids.forEach(id => checked.delete(id)); sort.selected = null; save(); render(); announce(added.length + '개 역을 비교 표에 담았습니다.'); }
  [...new Set(data.map(row => row.line))].sort(collator.compare).forEach(line => { const option = document.createElement('option'); option.value = line; option.textContent = line; $('line').append(option); });
  $('search').addEventListener('input', render);
  $('line').addEventListener('change', render);
  $('merge-lines').addEventListener('click', () => { mergeLines = !mergeLines; checked.clear(); render(); announce(mergeLines ? '같은 이름의 역을 모든 호선 합계로 표시합니다.' : '역을 호선별로 표시합니다.'); });
  $('add-checked').addEventListener('click', () => add([...checked]));
  $('clear').addEventListener('click', () => { selected = []; save(); render(); announce('비교 표를 비웠습니다.'); });
  for (const kind of ['search', 'selected']) {
    $(kind + '-table').addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.sort !== undefined) { const key = button.dataset.sort; sort[kind] = { key, direction: sort[kind]?.key === key ? -sort[kind].direction : key === 'station' ? 1 : -1 }; render(); }
      if (button.dataset.add) add([button.dataset.add]);
      if (button.dataset.remove) { const removed = new Set(members(byId.get(button.dataset.remove))); selected = selected.filter(id => !removed.has(id)); save(); render(); announce('선택한 역을 비교 표에서 삭제했습니다.'); }
    });
  }
  $('search-table').addEventListener('change', event => {
    const input = event.target;
    if (input.id === 'check-visible') { filtered().filter(row => !isSelected(row)).forEach(row => input.checked ? checked.add(row.id) : checked.delete(row.id)); render(); }
    else if (input.dataset.check) { input.checked ? checked.add(input.dataset.check) : checked.delete(input.dataset.check); updateChecked(); }
  });
  render();
})();
