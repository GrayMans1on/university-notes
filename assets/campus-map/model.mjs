// Captured floors use different local origins; calibration absorbs these offsets.
export const sourceFloorOffsets = Object.freeze([
    { x: 317.5, y: 872.5 }, { x: 0, y: 0 }, { x: 0, y: -0.5 },
    { x: -7, y: 529.925 }, { x: -6.9, y: 499.691 },
]);
export function campusFloorOffset() { return { x: 0, y: 0 }; }
export function campusMapPalette(theme) {
    return theme === 'dark'
        ? { background: '#0f1827', room: '#1d2b40', line: '#8495b0', ink: '#e4ebf5', muted: '#a9b7cc',
            active: '#a8bcff', selected: 'rgba(168,188,255,.28)', route: '#a8bcff', stair: '#253557', path: '#8495b0',
            today: '#253f3c', todayLine: '#6c9b8c' }
        : { background: '#f5f7fb', room: '#ffffff', line: '#68758a', ink: '#182333', muted: '#68758a',
            active: '#254cce', selected: 'rgba(37,76,206,.18)', route: '#254cce', stair: '#edf2ff', path: '#68758a',
            today: '#e5f1ed', todayLine: '#739c91' };
}
export function roomName(value) {
    return String(value || '').trim().toLowerCase().replace(/а/g, 'a').replace(/б/g, 'b').replace(/[\s–—-]/g, '');
}
export function campusRoomsForLessons(lessons, rooms) {
    const ids = new Set();
    for (const lesson of lessons) {
        if (lesson.onlineCourse || /онлайн/i.test(lesson.note || '')) { continue; }
        if (lesson.place === 'ФОК ЧелГУ') {
            for (const id of ['fok', 'fok-hall']) { if (rooms.some((room) => room.id === id)) { ids.add(id); } }
        }
        for (const name of (lesson.room || '').split('/').filter(Boolean)) {
            const room = rooms.find((item) => roomName(item.name) === roomName(name));
            if (room) { ids.add(room.id); }
        }
    }
    return [...ids];
}
export function scheduleMapUrl(lesson, rooms) {
    if (lesson.place === 'ФОК ЧелГУ') { return '/map/?place=fok'; }
    if (!lesson.room || lesson.onlineCourse) { return null; }
    const matches = lesson.room.split('/').map((name) => rooms.find((room) => roomName(room.name) === roomName(name)));
    if (matches.some((room) => !room)) { throw new Error('Unmapped schedule room: ' + lesson.room); }
    const params = new URLSearchParams();
    params.set(matches.length > 1 ? 'rooms' : 'room', matches.map((room) => room.id).join(','));
    return '/map/?' + params;
}
export function parseMapLink(search) {
    const params = new URLSearchParams(search);
    const result = {};
    const validId = (value) => /^[\p{L}\p{N}_/-]{1,100}$/u.test(value);
    for (const key of ['room', 'from']) {
        const value = params.get(key);
        if (value && validId(value)) { result[key] = value; }
    }
    if (params.get('place') === 'fok') { result.place = 'fok'; }
    const rooms = (params.get('rooms') || '').split(',').filter(validId);
    if (rooms.length) { result.rooms = [...new Set(rooms)].slice(0, 10); }
    const floor = Number(params.get('floor'));
    if (params.has('floor') && Number.isInteger(floor) && floor >= 0 && floor <= 4) { result.floor = floor; }
    const zoom = Number(params.get('zoom'));
    const x = Number(params.get('x'));
    const y = Number(params.get('y'));
    if (['zoom', 'x', 'y'].every((key) => params.has(key)) && Number.isFinite(zoom) && zoom >= 0.1 && zoom <= 3
        && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 100000 && Math.abs(y) <= 100000) {
        result.camera = { scale: zoom, x, y };
    }
    return result;
}
export function mapLinkParams({ floor, camera, room, from, rooms, place }) {
    const params = new URLSearchParams();
    if (place) { params.set('place', place); }
    if (rooms?.length) { params.set('rooms', rooms.join(',')); }
    if (room) { params.set('room', room); }
    if (from) { params.set('from', from); }
    if (Number.isInteger(floor)) { params.set('floor', floor); }
    if (camera) {
        params.set('zoom', camera.scale.toFixed(4));
        params.set('x', camera.x.toFixed(2));
        params.set('y', camera.y.toFixed(2));
    }
    return params.toString();
}
export function boundsForRoom(room) {
    if (Number.isFinite(room.x) && Number.isFinite(room.y)) {
        return { x: room.x + (room.width || 0) / 2, y: room.y + (room.height || 0) / 2 };
    }
    // Room polygons use absolute M/L/H/V commands in the captured map.
    const commands = (room.data || '').match(/[MLHV][^MLHVZ]*/gi) || [];
    const points = [];
    let x = 0;
    let y = 0;
    for (const command of commands) {
        const numbers = (command.slice(1).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        const type = command[0].toUpperCase();
        if (type === 'H') { for (const value of numbers) { x = value; points.push([x, y]); } }
        else if (type === 'V') { for (const value of numbers) { y = value; points.push([x, y]); } }
        else { for (let i = 0; i + 1 < numbers.length; i += 2) { x = numbers[i]; y = numbers[i + 1]; points.push([x, y]); } }
    }
    if (!points.length) { return null; }
    return { x: (Math.min(...points.map((point) => point[0])) + Math.max(...points.map((point) => point[0]))) / 2,
        y: (Math.min(...points.map((point) => point[1])) + Math.max(...points.map((point) => point[1]))) / 2 };
}

export function imageToCampus(point, calibration) {
    const p = calibration.image_projection;
    return { x: p.source_anchor[0] + (point[0] - p.image_anchor[0]) / p.scale,
        y: p.source_anchor[1] + (point[1] - p.image_anchor[1]) / p.scale };
}
function rigidCampusPoint(x, y, calibration, region) {
    if (region === 'main') { return { x, y }; }
    if (region === 'lecture') {
        const box = calibration.lecture.source_box;
        const target = calibration.lecture.image_box;
        return imageToCampus([target[0] + (x - box[0]) * (target[2] - target[0]) / (box[2] - box[0]),
            target[1] + (y - box[1]) * (target[3] - target[1]) / (box[3] - box[1])], calibration);
    }
    const theatre = calibration.theatre;
    const anchor = imageToCampus(theatre.image_anchor, calibration);
    return { x: anchor.x + (x - theatre.source_anchor[0]) * theatre.scale,
        y: anchor.y + (y - theatre.source_anchor[1]) * theatre.scale };
}
export function calibrateCampusPoint(point, floor, calibration, region = 'auto') {
    const offset = sourceFloorOffsets[floor];
    let x = point.x + offset.x;
    let y = point.y + offset.y;
    if (floor === 0) {
        const [a, b] = calibration.basement.source_stairs;
        const [c, d] = calibration.basement.target_stairs;
        x = c[0] + (x - a[0]) * (d[0] - c[0]) / (b[0] - a[0]);
        y = c[1] + (y - a[1]) * (d[1] - c[1]) / (b[1] - a[1]);
    }
    if (['main', 'lecture', 'theatre'].includes(region)) { return rigidCampusPoint(x, y, calibration, region); }
    if (region === 'auto') {
        for (const passage of calibration.passages || []) {
            const [left, top, right, bottom] = passage.bounds;
            if (!passage.floors.includes(floor) || x < left || x > right || y < top || y > bottom) { continue; }
            const [sourceA, sourceB] = passage.anchors;
            const a = { ...sourceA, point: [sourceA.point[0], passage.start_by_floor?.[floor] ?? sourceA.point[1]] };
            const b = { ...sourceB, point: [sourceB.point[0], passage.end_by_floor?.[floor] ?? sourceB.point[1]] };
            const p = rigidCampusPoint(...a.point, calibration, a.region);
            const q = rigidCampusPoint(...b.point, calibration, b.region);
            const ratio = Math.max(0, (y - a.point[1]) / (b.point[1] - a.point[1]));
            const projectedY = passage.join_y ? (y >= passage.join_y ? y
                : p.y + (passage.join_y - p.y) * (y - a.point[1]) / (passage.join_y - a.point[1]))
                : ratio > 1 ? rigidCampusPoint(x, y, calibration, b.region).y : p.y + (q.y - p.y) * ratio;
            const shift = (p.x - a.point[0]) + ((q.x - b.point[0]) - (p.x - a.point[0]))
                * (projectedY - p.y) / (q.y - p.y);
            // A shared shear keeps both corridor walls parallel and preserves their original width.
            return { x: x + shift, y: projectedY };
        }
    }
    const top = rigidCampusPoint(x, y, calibration, 'lecture');
    const bottom = rigidCampusPoint(x, y, calibration, 'theatre');
    const [upper, lower] = calibration.transition_bands;
    if (y <= upper[0]) { return top; }
    if (y < upper[1]) {
        const ratio = (y - upper[0]) / (upper[1] - upper[0]);
        return { x: top.x * (1 - ratio) + x * ratio, y: top.y * (1 - ratio) + y * ratio };
    }
    if (y <= lower[0]) { return { x, y }; }
    if (y < lower[1]) {
        const ratio = (y - lower[0]) / (lower[1] - lower[0]);
        return { x: x * (1 - ratio) + bottom.x * ratio, y: y * (1 - ratio) + bottom.y * ratio };
    }
    return bottom;
}
function calibratedPath(data, project, projectCurve = project) {
    let x = 0;
    let y = 0;
    let start = { x: 0, y: 0 };
    const number = (value) => Number(value.toFixed(5));
    const pair = (point) => `${number(point.x)} ${number(point.y)}`;
    return (data.match(/[MLHVCSZ][^MLHVCSZ]*/gi) || []).map((command) => {
        const type = command[0];
        const values = (command.slice(1).match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) || []).map(Number);
        if (type === 'Z') { x = start.x; y = start.y; return 'Z'; }
        if (type === 'H' || type === 'V') {
            return values.map((value) => {
                if (type === 'H') { x = value; } else { y = value; }
                return 'L' + pair(project({ x, y }));
            }).join('');
        }
        const points = [];
        const segmentStart = { x, y };
        const segmentEnd = { x: values.at(-2), y: values.at(-1) };
        for (let i = 0; i < values.length; i += 2) {
            const point = { x: values[i], y: values[i + 1] };
            points.push(pair(type === 'C' || type === 'S' ? projectCurve(point, segmentStart, segmentEnd) : project(point)));
        }
        x = values.at(-2); y = values.at(-1);
        if (type === 'M') { start = { x, y }; }
        return type + points.join(' ');
    }).join('');
}
export function mergeCampusPaths(paths, width, widths = {}) {
    const rectangles = [];
    const endpoints = new Map();
    for (const [index, points] of paths.entries()) {
        const half = (widths[index] || width) / 2;
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1];
            const b = points[i];
            if (a[0] !== b[0] && a[1] !== b[1]) { throw new Error('Outdoor path is not on the grid'); }
            if (a[0] === b[0]) {
                rectangles.push([a[0] - half, Math.min(a[1], b[1]), a[0] + half, Math.max(a[1], b[1])]);
            } else {
                rectangles.push([Math.min(a[0], b[0]), a[1] - half, Math.max(a[0], b[0]), a[1] + half]);
            }
            for (const point of [a, b]) {
                const key = point.join(',');
                endpoints.set(key, { point, half: Math.max(half, endpoints.get(key)?.half || 0),
                    count: (endpoints.get(key)?.count || 0) + 1 });
            }
        }
    }
    for (const { point, count, half } of endpoints.values()) {
        if (count > 1) {
            rectangles.push([point[0] - half, point[1] - half, point[0] + half, point[1] + half]);
        }
    }
    // Trace the union boundary, so connected paths have no internal seams or overlapping strokes.
    const xs = [...new Set(rectangles.flatMap((rect) => [rect[0], rect[2]]))].sort((a, b) => a - b);
    const ys = [...new Set(rectangles.flatMap((rect) => [rect[1], rect[3]]))].sort((a, b) => a - b);
    const cells = new Set();
    for (let i = 0; i < xs.length - 1; i++) {
        for (let j = 0; j < ys.length - 1; j++) {
            const x = (xs[i] + xs[i + 1]) / 2;
            const y = (ys[j] + ys[j + 1]) / 2;
            if (rectangles.some(([left, top, right, bottom]) => x > left && x < right && y > top && y < bottom)) {
                cells.add(`${i},${j}`);
            }
        }
    }
    const edges = new Map();
    const add = (a, b) => {
        const key = a.join(',');
        if (edges.has(key)) { throw new Error('Outdoor path has an ambiguous boundary'); }
        edges.set(key, b);
    };
    for (const cell of cells) {
        const [i, j] = cell.split(',').map(Number);
        if (!cells.has(`${i},${j - 1}`)) { add([xs[i], ys[j]], [xs[i + 1], ys[j]]); }
        if (!cells.has(`${i + 1},${j}`)) { add([xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]]); }
        if (!cells.has(`${i},${j + 1}`)) { add([xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]); }
        if (!cells.has(`${i - 1},${j}`)) { add([xs[i], ys[j + 1]], [xs[i], ys[j]]); }
    }
    const contours = [];
    while (edges.size) {
        const start = edges.keys().next().value;
        let key = start;
        const contour = [];
        do {
            contour.push(key.split(',').map(Number));
            const next = edges.get(key);
            if (!next) { throw new Error('Outdoor path boundary is open'); }
            edges.delete(key); key = next.join(',');
        } while (key !== start);
        contours.push(contour.filter((point, i) => {
            const prev = contour[(i + contour.length - 1) % contour.length];
            const next = contour[(i + 1) % contour.length];
            return (point[0] - prev[0]) * (next[1] - point[1]) !== (point[1] - prev[1]) * (next[0] - point[0]);
        }));
    }
    return contours;
}
function straightPathSegments(data) {
    const result = [];
    let point = { x: 0, y: 0 };
    let start = point;
    for (const command of data.match(/[MLHVCSZ][^MLHVCSZ]*/gi) || []) {
        const type = command[0];
        const values = (command.slice(1).match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) || []).map(Number);
        if (type === 'Z') { result.push([point, start]); point = start; }
        else if (type === 'C' || type === 'S') { point = { x: values.at(-2), y: values.at(-1) }; }
        else {
            for (let i = 0; i < values.length; i += type === 'H' || type === 'V' ? 1 : 2) {
                const next = type === 'H' ? { x: values[i], y: point.y }
                    : type === 'V' ? { x: point.x, y: values[i] } : { x: values[i], y: values[i + 1] };
                if (type === 'M' && i === 0) { start = next; } else { result.push([point, next]); }
                point = next;
            }
        }
    }
    return result;
}
function openedStroke(data, gaps) {
    let point = { x: 0, y: 0 };
    let start = point;
    const pair = (p) => `${Number(p.x.toFixed(5))} ${Number(p.y.toFixed(5))}`;
    const line = (a, b) => {
        let intervals = [[0, 1]];
        for (const gap of gaps) {
            const tangent = gap.axis === 'x' ? 'y' : 'x';
            if (Math.abs(a[tangent] - b[tangent]) < 1e-9
                && Math.abs(Math.abs(a[tangent] - gap.point[tangent]) - gap.width / 2) < 0.0001) { continue; }
            const boxes = gap.axis === 'x' ? [[gap.point.x - 1, gap.point.x + 1],
                [gap.point.y - gap.width / 2, gap.point.y + gap.width / 2]]
                : [[gap.point.x - gap.width / 2, gap.point.x + gap.width / 2], [gap.point.y - 1, gap.point.y + 1]];
            let low = 0;
            let high = 1;
            for (const [i, axis] of ['x', 'y'].entries()) {
                const delta = b[axis] - a[axis];
                if (Math.abs(delta) < 1e-9) {
                    if (a[axis] < boxes[i][0] || a[axis] > boxes[i][1]) { low = 2; break; }
                } else {
                    const t = boxes[i].map((value) => (value - a[axis]) / delta).sort((u, v) => u - v);
                    low = Math.max(low, t[0]); high = Math.min(high, t[1]);
                }
            }
            if (high <= low) { continue; }
            intervals = intervals.flatMap(([lo, hi]) => {
                if (hi <= low || lo >= high) { return [[lo, hi]]; }
                return [...(lo < low ? [[lo, low]] : []), ...(hi > high ? [[high, hi]] : [])];
            });
        }
        return intervals.filter(([lo, hi]) => (hi - lo) * Math.hypot(b.x - a.x, b.y - a.y) > 0.00001).map(([lo, hi]) => {
            const at = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
            return `M${pair(at(lo))}L${pair(at(hi))}`;
        }).join('');
    };
    return (data.match(/[MLHVCSZ][^MLHVCSZ]*/gi) || []).map((command) => {
        const type = command[0];
        const values = (command.slice(1).match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) || []).map(Number);
        if (type === 'Z') { const result = line(point, start); point = start; return result; }
        if (type === 'C' || type === 'S') {
            const result = `M${pair(point)}${command}`;
            point = { x: values.at(-2), y: values.at(-1) }; return result;
        }
        let result = '';
        for (let i = 0; i < values.length; i += type === 'H' || type === 'V' ? 1 : 2) {
            const next = type === 'H' ? { x: values[i], y: point.y }
                : type === 'V' ? { x: point.x, y: values[i] } : { x: values[i], y: values[i + 1] };
            if (type === 'M' && i === 0) { start = next; } else { result += line(point, next); }
            point = next;
        }
        return result;
    }).join('');
}
export function calibrateCampusMap(original, calibration, outdoors, materialIcons = {}) {
    const data = structuredClone(original);
    for (const layer of data.layers) {
        for (const item of layer.vectors) {
            const icon = materialIcons[item.id];
            if (icon) { Object.assign(item, { data: icon.data, materialSymbol: icon.symbol }); }
        }
    }
    for (const layer of data.layers) {
        for (const key of ['rooms', 'walls', 'vectors', 'decor', 'roads']) {
            const project = (point) => calibrateCampusPoint(point, layer.floorIndex, calibration,
                key === 'rooms' || key === 'vectors' || key === 'decor' ? 'building' : 'auto');
            layer[key] = layer[key].filter((item) => !item.id?.startsWith('parking')
                && !(key === 'vectors' && calibration.hidden_vectors?.includes(item.id))).map((item) => {
                const result = { ...item };
                if (item.data) {
                    const local = (point) => ({ x: point.x + (item.x || 0), y: point.y + (item.y || 0) });
                    result.data = calibratedPath(item.data, (point) => project(local(point)), (point, start, end) => {
                        const offset = sourceFloorOffsets[layer.floorIndex];
                        const region = Math.min(local(start).y, local(end).y) + offset.y >= calibration.transition_bands[1][1]
                            ? 'theatre' : Math.max(local(start).y, local(end).y) + offset.y <= calibration.transition_bands[0][0]
                                ? 'lecture' : 'building';
                        // Curve handles follow their building, even when a handle extends across a transition band.
                        return calibrateCampusPoint(local(point), layer.floorIndex, calibration, region);
                    });
                    delete result.x; delete result.y;
                } else if (Number.isFinite(item.x) && Number.isFinite(item.y)) {
                    const a = project(item);
                    const b = project({ x: item.x + (item.width || 0), y: item.y + (item.height || 0) });
                    Object.assign(result, { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y });
                }
                if (Number.isFinite(item.x1)) {
                    const a = project({ x: item.x1, y: item.y1 });
                    const b = project({ x: item.x2, y: item.y2 });
                    Object.assign(result, { x1: a.x, y1: a.y, x2: b.x, y2: b.y });
                }
                return result;
            });
        }
    }
    const layer = data.layers[1];
    // Replace the captured exterior with only the paths and buildings in the user overlay.
    layer.decor.shift();
    const polygon = (points) => points.map((point, i) => {
        const p = imageToCampus(point, calibration);
        return `${i ? 'L' : 'M'}${p.x.toFixed(5)} ${p.y.toFixed(5)}`;
    }).join('');
    layer.decor.push(...outdoors.buildings.map((points) => ({ type: 'path', campusKind: 'building',
        data: polygon(points) + 'Z', fill: true, strokeWidth: 2, strokeOpacity: 0.8 })));
    for (const place of outdoors.places) {
        layer.rooms.push({ id: place.id, name: place.name, map_label: place.map_label, aliases: place.aliases,
            description: place.description, outdoor: true, type: 'vectorized_room', data: polygon(place.polygon) + 'Z' });
    }
    const paths = structuredClone(outdoors.paths);
    const routingNodes = structuredClone(outdoors.routing_nodes);
    const gaps = [];
    for (const entrance of outdoors.entrances || []) {
        const outline = entrance.room ? layer.rooms.find((item) => item.id === entrance.room)
            : layer.walls.find((item) => (item.id || 'main') === entrance.wall);
        if (!outline) { throw new Error('Missing entrance wall: ' + entrance.id); }
        const points = paths[entrance.path];
        const index = entrance.end === 'start' ? 0 : points.length - 1;
        const end = imageToCampus(points[index], calibration);
        const previous = imageToCampus(points[index === 0 ? 1 : index - 1], calibration);
        const axis = end.x === previous.x ? 'y' : 'x';
        const tangent = axis === 'x' ? 'y' : 'x';
        const candidates = straightPathSegments(outline.data).flatMap(([a, b]) => {
            if (Math.abs(b[tangent] - a[tangent]) < 1e-9) { return []; }
            const ratio = (end[tangent] - a[tangent]) / (b[tangent] - a[tangent]);
            if (ratio < 0 || ratio > 1) { return []; }
            return [{ ...end, [axis]: a[axis] + (b[axis] - a[axis]) * ratio }];
        }).sort((a, b) => Math.abs(a[axis] - end[axis]) - Math.abs(b[axis] - end[axis]));
        if (!candidates.length || Math.abs(candidates[0][axis] - end[axis]) > 30) {
            throw new Error('Entrance does not meet its wall: ' + entrance.id);
        }
        const point = candidates[0];
        const p = calibration.image_projection;
        points[index] = [p.image_anchor[0] + (point.x - p.source_anchor[0]) * p.scale,
            p.image_anchor[1] + (point.y - p.source_anchor[1]) * p.scale];
        if (entrance.node) { routingNodes[entrance.node] = points[index]; }
        const width = (outdoors.path_widths?.[entrance.path] || outdoors.path_width) / p.scale;
        const gap = { point, axis, width };
        if (entrance.room) { outline.border_data = openedStroke(outline.data, [gap]); }
        else { outline.data = openedStroke(outline.data, [gap]); }
        gaps.push(gap);
    }
    const roadOutline = mergeCampusPaths(paths, outdoors.path_width, outdoors.path_widths)
        // A touching facade is drawn once by the building, without a second overlapping road border.
        .filter((points) => !outdoors.buildings.some((building) => points.length === building.length
            && points.every((point) => building.some((corner) => point[0] === corner[0] && point[1] === corner[1]))))
        .map((points) => polygon(points) + 'Z').join('');
    layer.decor.unshift({ type: 'path', campusKind: 'path', data: openedStroke(roadOutline, gaps),
        strokeWidth: 2, opacity: 0.8 });
    for (const icon of outdoors.icons) {
        const source = { ...original.layers[1].vectors.find((item) => item.id === icon.source_id) };
        if (materialIcons[icon.source_id]) { source.data = materialIcons[icon.source_id].data; }
        const points = [];
        calibratedPath(source.data, (point) => { points.push(point); return point; });
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const x = (Math.min(...xs) + Math.max(...xs)) / 2;
        const y = (Math.min(...ys) + Math.max(...ys)) / 2;
        const scale = icon.width / (Math.max(...xs) - Math.min(...xs));
        const center = imageToCampus(icon.position, calibration);
        layer.vectors.push({ id: icon.id, name: icon.name, description: icon.description, aliases: icon.aliases,
            type: 'icon', outdoor: true, strokeWidth: 1, materialSymbol: materialIcons[icon.source_id]?.symbol,
            data: calibratedPath(source.data, (point) => ({ x: center.x + (point.x - x) * scale,
                y: center.y + (point.y - y) * scale })) });
    }
    data.routing_layers = original.layers;
    data.calibration = calibration;
    data.outdoors = {
        nodes: Object.fromEntries([...Object.entries(routingNodes),
            ...[...outdoors.places, ...outdoors.icons].map((place) => ['icon-' + place.id, place.route_point])]
            .map(([id, point]) => [id, { ...imageToCampus(point, calibration), floorIndex: 1 }])),
        edges: outdoors.routing_edges, connections: outdoors.connections,
    };
    return data;
}
export function projectCampusGraph(original, calibration, outdoors) {
    const nodeCoords = new Map([...original.nodeCoords].map(([id, point]) => [id,
        { ...point, ...calibrateCampusPoint(point, point.floorIndex, calibration) }]));
    const graph = new Map([...original.graph].map(([id, edges]) => [id, new Map(edges)]));
    // Preserve source connectivity; update same-floor costs to match corrected geometry.
    for (const [id, edges] of graph) {
        for (const [other, weight] of edges) {
            const a = nodeCoords.get(id);
            const b = nodeCoords.get(other);
            if (weight > 0 && a.floorIndex === b.floorIndex) {
                edges.set(other, Math.hypot(a.x - b.x, a.y - b.y));
            }
        }
    }
    for (const [id, point] of Object.entries(outdoors.nodes)) {
        if (nodeCoords.has(id)) { throw new Error('Duplicate outdoor node: ' + id); }
        nodeCoords.set(id, point); graph.set(id, new Map());
    }
    for (const [a, b] of [...outdoors.edges, ...outdoors.connections]) {
        if (!nodeCoords.has(a) || !nodeCoords.has(b)) { throw new Error('Missing outdoor anchor'); }
        const p = nodeCoords.get(a);
        const q = nodeCoords.get(b);
        if (p.floorIndex !== q.floorIndex) { throw new Error('Outdoor connection crosses floors'); }
        const weight = Math.hypot(p.x - q.x, p.y - q.y);
        graph.get(a).set(b, weight); graph.get(b).set(a, weight);
    }
    return { graph, nodeCoords };
}
