import { mapLinkParams, parseMapLink } from './model.mjs';
const frame = document.querySelector('.campus-map iframe');
const separate = document.querySelector('.map-source-link');
if (frame) {
    const query = mapLinkParams(parseMapLink(location.search));
    frame.src = '/map/view/' + (query ? '?' + query : '');
    separate.href = frame.src;
    window.addEventListener('message', (event) => {
        if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== 'campus-map-position') {
            return;
        }
        const current = mapLinkParams(parseMapLink(event.data.query));
        const url = '/map/' + (current ? '?' + current : '');
        if (location.pathname + location.search !== url) { history.replaceState(null, '', url); }
        separate.href = '/map/view/' + (current ? '?' + current : '');
    });
}
