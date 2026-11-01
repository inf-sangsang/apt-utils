/* Shared geometry and connectivity rules for preview, download and tests. */
(function (root) {
    'use strict';
    const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
    function connected(ids, graph) {
        if (!ids.length || new Set(ids).size !== ids.length) return false;
        const seen = new Set([ids[0]]), pending = [ids[0]];
        while (pending.length) {
            for (const id of graph[pending.pop()] || []) {
                if (ids.includes(id) && !seen.has(id)) { seen.add(id); pending.push(id); }
            }
        }
        return seen.size === ids.length;
    }
    function candidates(ids, graph) {
        return [...new Set(ids.flatMap(id => graph[id] || []))].filter(id => !ids.includes(id));
    }
    function svg(data, kind, labeled, title) {
        const width = 1800;
        const all = data.flatMap(region => region[kind].features);
        const bounds = data.map(region => region[kind].bounds);
        const minX = Math.min(...bounds.map(b => b[0])), minY = Math.min(...bounds.map(b => b[1]));
        const maxX = Math.max(...bounds.map(b => b[2])), maxY = Math.max(...bounds.map(b => b[3]));
        // Reserve side columns even without names so named and blank views share scale.
        const height = Math.max(1400, all.length * 17 + 100);
        const scale = Math.min(1280 / (maxX-minX), (height-120) / (maxY-minY));
        const tx = x => (width-(maxX-minX)*scale)/2+(x-minX)*scale;
        const ty = y => (height-(maxY-minY)*scale)/2+(y-minY)*scale;
        const point = p => `${tx(p[0]).toFixed(2)},${ty(p[1]).toFixed(2)}`;
        const paths = all.map(f => `<path data-name="${escape(f.name)}" d="${f.polygons.flatMap(poly => poly.map(ring => `M ${ring.map(point).join(' L ')} Z`)).join(' ')}"/>`).join('');
        const labels = [], external = [];
        for (const f of all) {
            const [x, y, w, h] = f.labelBox;
            const size = Math.min(22, h*scale*.78, w*scale/f.name.length*.9);
            if (size >= 12) {
                labels.push(`<text x="${tx(x)}" y="${ty(y)}" font-size="${size}">${escape(f.name)}</text>`);
            } else external.push({ name: f.name, x: tx(x), y: ty(y) });
        }
        const leaders = [];
        for (const left of [true, false]) {
            const items = external.filter(f => (f.x < width/2) === left).sort((a, b) => a.y-b.y);
            const labelX = left ? 125 : width-125, endX = left ? 235 : width-235;
            let previous = 25;
            const positions = items.map(f => { previous = Math.max(previous+30, f.y); return previous; });
            for (let i = positions.length-1; i >= 0; i--) positions[i] = Math.min(positions[i], height-30-(positions.length-1-i)*30);
            items.forEach((f, i) => {
                leaders.push(`<path d="M ${f.x},${f.y} L ${endX},${positions[i]}"/><circle cx="${f.x}" cy="${f.y}" r="2"/>`);
                labels.push(`<text x="${labelX}" y="${positions[i]}" font-size="20">${escape(f.name)}</text>`);
            });
        }
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title><rect width="100%" height="100%" fill="white"/><g fill="none" stroke="#111" stroke-width="1.6" stroke-linejoin="round">${paths}</g>${labeled ? `<g fill="#666" stroke="#888" stroke-width=".8">${leaders.join('')}</g><g font-family="Noto Sans KR,Apple SD Gothic Neo,sans-serif" font-weight="500" text-anchor="middle" dominant-baseline="central" fill="#111">${labels.join('')}</g>` : ''}</svg>`;
    }
    const api = { connected, candidates, svg };
    if (typeof module !== 'undefined') module.exports = api;
    else root.BlankMapConnection = api;
})(typeof window === 'undefined' ? globalThis : window);
