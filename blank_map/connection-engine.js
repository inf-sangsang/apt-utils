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
    function districtLabelBox(rings, features) {
        // Center the name on the main landmass, so distant islands do not
        // drag it into the sea. Use local coordinates for stable area sums.
        const centers = rings.map(ring => {
            const [ox, oy] = ring[0];
            let area = 0, cx = 0, cy = 0;
            for (let i = 1; i < ring.length; i++) {
                const ax = ring[i-1][0]-ox, ay = ring[i-1][1]-oy;
                const bx = ring[i][0]-ox, by = ring[i][1]-oy;
                const cross = ax*by-bx*ay;
                area += cross; cx += (ax+bx)*cross; cy += (ay+by)*cross;
            }
            return { ring, area: Math.abs(area), x: ox+cx/(3*area), y: oy+cy/(3*area) };
        });
        const main = centers.reduce((a, b) => a.area >= b.area ? a : b);
        const xs = main.ring.map(p => p[0]), ys = main.ring.map(p => p[1]);
        const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
        function clearance(x, y) {
            let inside = false, distance2 = Infinity;
            for (const ring of rings) for (let i = 1; i < ring.length; i++) {
                const [ax, ay] = ring[i-1], [bx, by] = ring[i];
                if ((ay > y) !== (by > y) && x < (bx-ax)*(y-ay)/(by-ay)+ax) inside = !inside;
                const dx = bx-ax, dy = by-ay;
                const t = Math.max(0, Math.min(1, ((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy || 1)));
                distance2 = Math.min(distance2, (x-ax-t*dx)**2+(y-ay-t*dy)**2);
            }
            return (inside ? 1 : -1)*Math.sqrt(distance2);
        }
        const margin = Math.min(x1-x0, y1-y0)*.06;
        let best = { x: main.x, y: main.y, radius: clearance(main.x, main.y) };
        if (best.radius < margin) {
            // Concave outlines and holes may put the centroid outside. Pick
            // the nearest interior point with enough room for the name.
            const points = features.map(f => f.labelBox.slice(0, 2));
            for (let ix = 0; ix < 33; ix++) for (let iy = 0; iy < 33; iy++) {
                points.push([x0+(ix+.5)*(x1-x0)/33, y0+(iy+.5)*(y1-y0)/33]);
            }
            let nearest = Infinity;
            for (const [x, y] of points) {
                const radius = clearance(x, y), distance = (x-main.x)**2+(y-main.y)**2;
                if (radius >= margin ? distance < nearest : nearest === Infinity && radius > best.radius) {
                    best = { x, y, radius };
                    if (radius >= margin) nearest = distance;
                }
            }
        }
        const size = Math.SQRT2*best.radius;
        return [best.x, best.y, size, size];
    }
    function districtRings(region, kind = 'admin') {
        // Administrative geometry shares exact vertices. Cancel shared edges
        // within each region, retaining borders between selected districts.
        const edges = new Map();
        for (const f of region[kind].features) for (const poly of f.polygons) for (const ring of poly) {
            for (let i = 1; i < ring.length; i++) {
                const a = ring[i-1].join(','), b = ring[i].join(',');
                if (a === b) continue;
                const key = [a, b].sort().join('|');
                if (edges.has(key)) edges.delete(key);
                else edges.set(key, [a, b]);
            }
        }
        const adjacent = new Map();
        for (const [key, ends] of edges) for (const p of ends) {
            if (!adjacent.has(p)) adjacent.set(p, []);
            adjacent.get(p).push(key);
        }
        const rings = [];
        while (edges.size) {
            const start = edges.values().next().value[0], ring = [start];
            let current = start;
            do {
                const key = adjacent.get(current).find(k => edges.has(k));
                if (!key) throw new Error('Unclosed district boundary');
                const [a, b] = edges.get(key); edges.delete(key);
                current = a === current ? b : a; ring.push(current);
            } while (current !== start);
            rings.push(ring.map(p => p.split(',').map(Number)));
        }
        return rings;
    }
    function districtFeature(region) {
        const rings = districtRings(region);
        return { name: region.name, polygons: [rings], labelBox: districtLabelBox(rings, region.admin.features) };
    }
    function svg(data, kind, labeled, title, viewport) {
        const all = kind === 'district' ? data.map(districtFeature) : data.flatMap(region => region[kind].features.map((f, i) =>
            kind === 'legal' && region.legal.displayLabelBoxes ? { ...f, labelBox: region.legal.displayLabelBoxes[i] } : f));
        const bounds = data.map(region => region[kind === 'district' ? 'admin' : kind].bounds);
        const minX = Math.min(...bounds.map(b => b[0])), minY = Math.min(...bounds.map(b => b[1]));
        const maxX = Math.max(...bounds.map(b => b[2])), maxY = Math.max(...bounds.map(b => b[3]));
        // Keep the first region's standalone scale as neighbors are added.
        // Grow the canvas instead of shrinking every region into a fixed frame.
        // District outlines use the same reference scale as administrative maps.
        const reference = data[0][kind === 'district' ? 'admin' : kind];
        const [x0, y0, x1, y1] = reference.bounds;
        const referenceHeight = Math.max(1400, reference.features.length * 17 + 100);
        const scale = Math.min(1280 / (x1-x0), (referenceHeight-120) / (y1-y0));
        // Reserve side columns even without names so both views share geometry.
        const width = Math.max(1800, Math.ceil((maxX-minX)*scale+520));
        const height = Math.max(1400, Math.ceil((maxY-minY)*scale+120), all.length * 17 + 100);
        const tx = x => (width-(maxX-minX)*scale)/2+(x-minX)*scale;
        const ty = y => (height-(maxY-minY)*scale)/2+(y-minY)*scale;
        const point = p => `${tx(p[0]).toFixed(2)},${ty(p[1]).toFixed(2)}`;
        const displayScale = viewport ? Math.min(1, viewport.width/width, viewport.height/height) : 1;
        // District/city outlines grow heavier independently of dong boundaries.
        const canvasGrowth = Math.max(1, width/1800, height/referenceHeight);
        const outlineWidth = Math.max(1.6*canvasGrowth, displayScale > 0 && viewport ? 1.2/displayScale : 0);
        const strokeWidth = kind === 'district' ? outlineWidth : 1.6;
        const paths = kind === 'legal' && data.every(region => region.legal.boundarySegments) ? data.map(region =>
            `<path data-dong-boundaries="${escape(region.id ?? '')}" d="${region.legal.boundarySegments.map(segment => `M ${segment.map(point).join(' L ')}`).join(' ')}"/>`).join('') :
            all.map(f => `<path data-name="${escape(f.name)}" d="${f.polygons.flatMap(poly => poly.map(ring => `M ${ring.map(point).join(' L ')} Z`)).join(' ')}"/>`).join('');
        // Legal thin boundaries and thick outlines share one cleaned coverage.
        const outlines = kind === 'district' ? '' : data.map(region => {
            const segments = kind === 'legal' && region.legal.outlineSegments ? region.legal.outlineSegments : districtRings(region, kind);
            return `<path data-region="${escape(region.id ?? region.name ?? '')}" d="${segments.map(segment => `M ${segment.map(point).join(' L ')}`).join(' ')}"/>`;
        }).join('');
        const labels = [], external = [];
        for (const f of all) {
            const [x, y, w, h] = f.labelBox;
            const baseSize = Math.min(22, h*scale*.78, w*scale/f.name.length*.9);
            // District names remain readable when the whole map is fitted
            // into a small card or dialog, while native exports stay intact.
            const size = kind === 'district' && displayScale > 0 ? Math.max(baseSize, Math.min(14, baseSize)/displayScale) : baseSize;
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
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title><rect width="100%" height="100%" fill="white"/><g fill="none" stroke="#111" stroke-width="${strokeWidth}" stroke-linejoin="round">${paths}</g>${outlines ? `<g data-layer="region-outlines" fill="none" stroke="#111" stroke-width="${outlineWidth}" stroke-linejoin="round">${outlines}</g>` : ''}${labeled ? `<g fill="#666" stroke="#888" stroke-width=".8">${leaders.join('')}</g><g font-family="Noto Sans KR,Apple SD Gothic Neo,sans-serif" font-weight="500" text-anchor="middle" dominant-baseline="central" fill="#111">${labels.join('')}</g>` : ''}</svg>`;
    }
    const api = { connected, candidates, svg, districtFeature };
    if (typeof module !== 'undefined') module.exports = api;
    else root.BlankMapConnection = api;
})(typeof window === 'undefined' ? globalThis : window);
