import { state } from './state.js';
import { getSessionJson, setSessionJson } from './storage.js';
import { computeScoreLosses } from './analysis.js';

let jwtPromise = null;
let lastJwtFailure = 0;

async function fetchJsonWithRetry(url, options = {}, attempts = 3) {
    let lastError = null;
    for (let i = 0; i < attempts; i += 1) {
        const res = await fetch(url, options);
        if (res.ok) return res.json();
        if (res.status === 429) {
            lastError = new Error('Request was throttled.');
            await new Promise(resolve => setTimeout(resolve, 800 * (i + 1)));
            continue;
        }
        lastError = new Error(`Request failed (${res.status})`);
        break;
    }
    throw lastError || new Error('Request failed');
}

export async function fetchAnonJwt() {
    if (state.jwt) return state.jwt;
    const now = Date.now();
    if (now - lastJwtFailure < 8000) return null;
    if (!jwtPromise) {
        jwtPromise = (async () => {
            try {
                const data = await fetchJsonWithRetry('https://online-go.com/api/v1/ui/config');
                state.jwt = data.anon_jwt || null;
                return state.jwt;
            } catch (err) {
                lastJwtFailure = Date.now();
                state.jwt = null;
                return null;
            } finally {
                jwtPromise = null;
            }
        })();
    }
    return jwtPromise;
}

function buildGamesUrl(playerId, page, options = {}) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(options.pageSize || 25));
    params.set('source', 'play');
    params.set('ended__isnull', 'false');
    params.set('annulled', 'false');
    params.set('ordering', '-ended');
    if (options.ranked === true) params.set('ranked', 'true');
    if (options.ranked === false) params.set('ranked', 'false');
    return `https://online-go.com/api/v1/players/${playerId}/games/?${params.toString()}`;
}

export async function fetchPlayerGamesPage(playerId, page, options = {}) {
    const key = `ogs.games.${playerId}.page.${page}.${options.ranked ?? 'all'}.${options.pageSize || 25}`;
    const cached = getSessionJson(key);
    if (cached) return cached;
    const data = await fetchJsonWithRetry(buildGamesUrl(playerId, page, options));
    setSessionJson(key, data);
    return data;
}

export async function fetchAiReviewList(gameId) {
    const key = `ogs.review.${gameId}`;
    const cached = getSessionJson(key);
    if (cached) return cached;
    const body = await fetchJsonWithRetry(`https://online-go.com/api/v1/games/${gameId}/ai_reviews`);
    const list = Array.isArray(body?.results) ? body.results : Array.isArray(body) ? body : [];
    setSessionJson(key, list);
    return list;
}

function connectAiReview(meta, jwt) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket('wss://ai.online-go.com/');
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('AI review timed out'));
        }, 15000);

        ws.onopen = () => {
            if (jwt) {
                ws.send(JSON.stringify([
                    'authenticate',
                    {
                        jwt,
                        device_id: crypto.randomUUID(),
                        user_agent: navigator.userAgent,
                        language: 'en',
                        language_version: '56583ff4aa3a8b724c611b750e451d61',
                        client_version: '5.1-8955-gf723043f',
                    },
                ]));
            }
            ws.send(JSON.stringify([
                'ai-review-connect',
                {
                    uuid: meta.uuid,
                    game_id: Number(meta.gameId),
                    ai_review_id: meta.aiReviewId,
                },
            ]));
        };

        ws.onmessage = event => {
            try {
                const msg = JSON.parse(event.data);
                if (!Array.isArray(msg)) return;
                const [type, payload] = msg;
                if (type === meta.uuid && payload?.metadata?.game_state) {
                    clearTimeout(timeout);
                    ws.close();
                    resolve(payload.metadata);
                }
            } catch (err) {
                clearTimeout(timeout);
                ws.close();
                reject(err);
            }
        };

        ws.onerror = () => {
            clearTimeout(timeout);
            ws.close();
            reject(new Error('WebSocket error'));
        };
    });
}

export async function fetchAnalysisForGame(gameId, reviewList = null) {
    const key = `ogs.ai.${gameId}`;
    const cached = getSessionJson(key);
    if (cached) return cached;

    const jwt = await fetchAnonJwt();
    const list = Array.isArray(reviewList) ? reviewList : await fetchAiReviewList(gameId);
    if (!list.length) throw new Error('No AI reviews found for this game');
    const review = list[list.length - 1];
    const meta = {
        gameId,
        aiReviewId: review.id || review.ai_review_id,
        uuid: review.uuid,
    };
    const metadata = await connectAiReview(meta, jwt);
    const movesLength = metadata?.game_state?.moves?.length || 0;
    const scores = Array.isArray(metadata?.scores) ? metadata.scores : [];
    const scoreLosses = computeScoreLosses(scores, movesLength);

    const analysis = {
        gameId,
        metadata,
        scoreLosses,
    };
    setSessionJson(key, analysis);
    return analysis;
}
