(() => {
    const key = 'study-reading-settings';
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    let saved = {};
    try {
        saved = JSON.parse(localStorage.getItem(key) || '{}');
    } catch {
        saved = {};
    }
    let preferences = {
        theme: ['auto', 'light', 'dark'].includes(saved?.theme) ? saved.theme : 'auto',
        scale: ['1', '1.12', '1.25'].includes(saved?.scale) ? saved.scale : '1',
        width: ['normal', 'narrow', 'wide'].includes(saved?.width) ? saved.width : 'normal',
    };
    function apply() {
        const root = document.documentElement;
        root.dataset.theme = preferences.theme === 'auto' ? (media.matches ? 'dark' : 'light') : preferences.theme;
        root.dataset.readingWidth = preferences.width;
        root.style.setProperty('--reader-scale', preferences.scale);
    }
    window.StudyPreferences = {
        get() {
            return { ...preferences };
        },
        set(field, value) {
            const allowed = { theme: ['auto', 'light', 'dark'], scale: ['1', '1.12', '1.25'], width: ['normal', 'narrow', 'wide'] };
            if (!allowed[field]?.includes(value)) {
                return;
            }
            preferences = { ...preferences, [field]: value };
            try {
                localStorage.setItem(key, JSON.stringify(preferences));
            } catch {
                // Keep settings active when browser storage is unavailable.
            }
            apply();
        },
    };
    media.addEventListener('change', apply);
    window.addEventListener('storage', (event) => {
        if (event.key === key) {
            try {
                const next = JSON.parse(event.newValue || '{}');
                for (const field of ['theme', 'scale', 'width']) {
                    const allowed = { theme: ['auto', 'light', 'dark'], scale: ['1', '1.12', '1.25'], width: ['normal', 'narrow', 'wide'] };
                    if (allowed[field].includes(next[field])) {
                        preferences[field] = next[field];
                    }
                }
                apply();
            } catch {
                // Ignore malformed preferences from other tabs.
            }
        }
    });
    apply();
})();
