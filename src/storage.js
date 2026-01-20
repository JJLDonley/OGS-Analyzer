export function getSessionJson(key) {
    try {
        const raw = sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        console.warn('Session parse failed', err);
        return null;
    }
}

export function setSessionJson(key, value) {
    try {
        sessionStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
        console.warn('Session save failed', err);
    }
}

export function clearSessionCache() {
    Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('ogs.games.') || key.startsWith('ogs.ai.') || key.startsWith('ogs.review.')) {
            sessionStorage.removeItem(key);
        }
    });
}
