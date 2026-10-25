'use strict';
const version = new URL(self.location.href).searchParams.get('v') || '1';
importScripts('compute-engine/compute-engine.js', 'limits-engine.js?v=' + encodeURIComponent(version));
self.addEventListener('message', (event) => {
    try {
        const { expression, destination, direction, options, job } = event.data;
        const result = self.StudyLimits.solve(expression, destination, direction, options);
        self.postMessage({ job, result });
    } catch (error) { self.postMessage({ job: event.data.job, error: error.message }); }
});
