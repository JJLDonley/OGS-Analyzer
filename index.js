const logEl = document.getElementById('log');
const connectBtn = document.getElementById('connect');
const disconnectBtn = document.getElementById('disconnect');
const urlInput = document.getElementById('gameUrl');
const qualityBlackNameEl = document.getElementById('qualityBlackName');
const qualityWhiteNameEl = document.getElementById('qualityWhiteName');
const qualityRowsEl = document.getElementById('qualityRows');
const currentScoreEl = document.getElementById('currentScore');
const currentWinrateEl = document.getElementById('currentWinrate');

const QUALITY_BUCKETS = [
    { id: 'best', label: 'Best', max: 0.5, color: '#3b82f6' },
    { id: 'good', label: 'Good', max: 1.5, color: '#22c55e' },
    { id: 'ok', label: 'Ok', max: 3, color: '#facc15' },
    { id: 'bad', label: 'Bad', max: 5, color: '#fb923c' },
    { id: 'terrible', label: 'Terrible', max: 8, color: '#ef4444' },
    { id: 'blunder', label: 'Blunder', max: Infinity, color: '#a855f7' },
];

const state = {
    ws: null,
    meta: null,
    editor: null,
    nodesByMove: new Map(),
    pendingAnalysis: new Map(),
    analysisByMove: new Map(),
    usingScoreSeries: false,
    scoreSeries: [],
    winrateSeries: [],
    playerInfo: null,
    qualityCounts: {
        black: initQualityCounts(),
        white: initQualityCounts(),
    },
};

function initQualityCounts() {
    return Object.fromEntries(QUALITY_BUCKETS.map(bucket => [bucket.id, 0]));
}

function resetQualityCounts() {
    state.qualityCounts.black = initQualityCounts();
    state.qualityCounts.white = initQualityCounts();
    state.analysisByMove.clear();
    state.usingScoreSeries = false;
    state.scoreSeries = [];
    state.winrateSeries = [];
    updateQualityChart();
}

function buildQualityRows() {
    if (!qualityRowsEl) return;
    qualityRowsEl.innerHTML = '';
    QUALITY_BUCKETS.forEach((bucket) => {
        const section = document.createElement('div');
        section.className = 'quality-section';
        section.dataset.bucket = bucket.id;

        const threshold = document.createElement('div');
        threshold.className = 'quality-threshold';
        threshold.textContent = bucket.max === Infinity ? '>8' : String(bucket.max);

        const blackLine = document.createElement('div');
        blackLine.className = 'quality-line';
        blackLine.dataset.side = 'black';
        const blackLabel = document.createElement('div');
        blackLabel.className = 'quality-side';
        blackLabel.textContent = 'Black';
        const blackBar = document.createElement('div');
        blackBar.className = 'quality-bar';
        const blackFill = document.createElement('div');
        blackFill.className = 'quality-fill';
        blackFill.style.background = bucket.color;
        blackBar.appendChild(blackFill);
        const blackCount = document.createElement('div');
        blackCount.className = 'quality-count';
        blackLine.appendChild(blackLabel);
        blackLine.appendChild(blackBar);
        blackLine.appendChild(blackCount);

        const whiteLine = document.createElement('div');
        whiteLine.className = 'quality-line';
        whiteLine.dataset.side = 'white';
        const whiteLabel = document.createElement('div');
        whiteLabel.className = 'quality-side';
        whiteLabel.textContent = 'White';
        const whiteBar = document.createElement('div');
        whiteBar.className = 'quality-bar';
        const whiteFill = document.createElement('div');
        whiteFill.className = 'quality-fill';
        whiteFill.style.background = bucket.color;
        whiteBar.appendChild(whiteFill);
        const whiteCount = document.createElement('div');
        whiteCount.className = 'quality-count';
        whiteLine.appendChild(whiteLabel);
        whiteLine.appendChild(whiteBar);
        whiteLine.appendChild(whiteCount);

        section.appendChild(threshold);
        section.appendChild(blackLine);
        section.appendChild(whiteLine);
        qualityRowsEl.appendChild(section);
    });
}

function updateQualityChart() {
    if (!qualityRowsEl) return;
    const totalBlack = Object.values(state.qualityCounts.black).reduce((sum, value) => sum + value, 0);
    const totalWhite = Object.values(state.qualityCounts.white).reduce((sum, value) => sum + value, 0);

    QUALITY_BUCKETS.forEach(bucket => {
        const section = qualityRowsEl.querySelector(`[data-bucket="${bucket.id}"]`);
        if (!section) return;
        const blackLine = section.querySelector('[data-side="black"]');
        const whiteLine = section.querySelector('[data-side="white"]');
        const blackFill = blackLine?.querySelector('.quality-fill');
        const whiteFill = whiteLine?.querySelector('.quality-fill');
        const blackCount = blackLine?.querySelector('.quality-count');
        const whiteCount = whiteLine?.querySelector('.quality-count');

        const blackVal = state.qualityCounts.black[bucket.id] || 0;
        const whiteVal = state.qualityCounts.white[bucket.id] || 0;
        const blackPct = totalBlack ? (blackVal / totalBlack) * 100 : 0;
        const whitePct = totalWhite ? (whiteVal / totalWhite) * 100 : 0;

        if (blackCount) blackCount.textContent = blackVal ? `${blackVal} moves` : '0 moves';
        if (whiteCount) whiteCount.textContent = whiteVal ? `${whiteVal} moves` : '0 moves';
        if (blackFill) blackFill.style.width = `${blackPct}%`;
        if (whiteFill) whiteFill.style.width = `${whitePct}%`;
    });
}

function getQualityBucket(scoreLoss) {
    for (const bucket of QUALITY_BUCKETS) {
        if (scoreLoss <= bucket.max) {
            return bucket;
        }
    }
    return QUALITY_BUCKETS[QUALITY_BUCKETS.length - 1];
}

function log(message, level = 'info') {
    if (!logEl) return;
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.textContent = `[${time}] ${message}`;
    entry.style.color = level === 'error' ? '#f87171' : '#9ba3b4';
    logEl.prepend(entry);
}

function getViewerEl() {
    return document.querySelector('.besogo-viewer');
}

function resetBoard(size = 19) {
    const currentViewer = getViewerEl();
    if (!currentViewer) {
        log('Besogo viewer not found in the page', 'error');
        return;
    }

    const host = currentViewer.parentElement || document.body;
    const height = currentViewer.style.height || '625px';
    const width = currentViewer.style.width || '552px';
    const panels = currentViewer.getAttribute('panels') || 'control+names';
    const resize = currentViewer.getAttribute('resize') || 'fixed';

    const nextViewer = document.createElement('div');
    nextViewer.className = 'besogo-viewer';
    nextViewer.style.height = height;
    nextViewer.style.width = width;
    nextViewer.setAttribute('resize', resize);
    nextViewer.setAttribute('panels', panels);
    nextViewer.setAttribute('size', String(size));
    nextViewer.setAttribute('coord', 'none');
    nextViewer.setAttribute('realstones', 'on');
    nextViewer.setAttribute('shadows', 'auto');

    host.replaceChild(nextViewer, currentViewer);
    try {
        besogo.autoInit();
        state.editor = nextViewer.besogoEditor || null;
        if (!state.editor) {
            log('Besogo init failed: editor not found', 'error');
        }
    } catch (err) {
        log(`Besogo init failed: ${err.message}`, 'error');
    }
}

function formatRank(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (value >= 30) {
        const dan = Math.max(1, Math.round(value - 29));
        return `${dan}d`;
    }
    const kyu = Math.max(1, Math.round(30 - value));
    return `${kyu}k`;
}

function setPlayerNames(meta) {
    if (!state.editor) return;
    const blackName = meta?.black?.username || meta?.black?.name || meta?.black?.display_name || meta?.black?.id;
    const whiteName = meta?.white?.username || meta?.white?.name || meta?.white?.display_name || meta?.white?.id;
    const blackRankValue = meta?.black?.ranking ?? meta?.black?.rank ?? meta?.black?.rank_label;
    const whiteRankValue = meta?.white?.ranking ?? meta?.white?.rank ?? meta?.white?.rank_label;
    const blackRank = typeof blackRankValue === 'string' ? blackRankValue : formatRank(blackRankValue);
    const whiteRank = typeof whiteRankValue === 'string' ? whiteRankValue : formatRank(whiteRankValue);
    if (!blackName && !whiteName) {
        console.log('Besogo player info skipped (missing names)', meta);
        return;
    }
    const info = {
        PB: blackName || 'Black',
        PW: whiteName || 'White',
        BR: blackRank || '?',
        WR: whiteRank || '?',
    };
    console.log('Besogo player info', info, meta);
    state.playerInfo = info;
    state.editor.setGameInfo(info);
    if (qualityBlackNameEl) qualityBlackNameEl.textContent = info.PB;
    if (qualityWhiteNameEl) qualityWhiteNameEl.textContent = info.PW;
}

function parseGameId(url) {
    try {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/game\/(\d+)/);
        return match ? match[1] : null;
    } catch (_) {
        return null;
    }
}

async function fetchAnonJwt() {
    const res = await fetch('https://online-go.com/api/v1/ui/config');
    if (!res.ok) throw new Error(`Failed to fetch UI config (${res.status})`);
    const data = await res.json();
    return data.anon_jwt || null;
}

async function fetchAiReview(gameId) {
    const res = await fetch(`https://online-go.com/api/v1/games/${gameId}/ai_reviews`);
    if (!res.ok) throw new Error(`Failed to fetch ai_reviews (${res.status})`);
    const body = await res.json();
    const list = Array.isArray(body?.results) ? body.results : Array.isArray(body) ? body : [];
    if (!list.length) throw new Error('No AI reviews found for this game');
    // Use latest review
    return list[list.length - 1];
}

async function fetchGameInfo(gameId) {
    const res = await fetch(`https://online-go.com/api/v1/games/${gameId}`);
    if (!res.ok) throw new Error(`Failed to fetch game info (${res.status})`);
    return res.json();
}

function renderGame(gameState) {
    const width = gameState.width || 19;
    const height = gameState.height || 19;
    resetBoard(width);
    const editor = state.editor;
    const root = besogo.makeGameRoot(width, height);
    let current = root;
    const initialPlayer = (gameState.initial_player || 'black').toLowerCase() === 'white' ? 1 : -1;
    let color = initialPlayer;
    state.nodesByMove = new Map();

    (gameState.moves || []).forEach((move, index) => {
        const child = current.makeChild();
        const x = (move.x ?? -1) >= 0 ? move.x + 1 : 0;
        const y = (move.y ?? -1) >= 0 ? move.y + 1 : 0;
        child.playMove(x, y, color, true);
        current.addChild(child);
        current = child;
        state.nodesByMove.set(index + 1, { node: child, x, y, color });
        color = -color;
    });

    editor.loadRoot(root);
    editor.setCurrent(current);
    if (state.playerInfo) {
        editor.setGameInfo(state.playerInfo);
    }
    applyPendingAnalysis();
    if (state.editor) {
        state.editor.addListener(msg => {
            if (msg.navChange) {
                const moveNumber = state.editor.getCurrent().moveNumber || 0;
                updateCurrentMetrics(moveNumber);
            }
        });
    }
    log(`Loaded ${gameState.moves?.length || 0} moves on a ${width}x${height} board`);
}

function applyPendingAnalysis() {
    if (!state.pendingAnalysis.size) return;
    for (const [moveNumber, scoreLoss] of state.pendingAnalysis.entries()) {
        applyMoveAnalysis(moveNumber, scoreLoss);
    }
    state.pendingAnalysis.clear();
}

function applyMoveAnalysis(moveNumber, scoreLoss) {
    const info = state.nodesByMove.get(moveNumber);
    if (!info) {
        state.pendingAnalysis.set(moveNumber, scoreLoss);
        return;
    }
    if (info.x <= 0 || info.y <= 0) return;
    const bucket = getQualityBucket(scoreLoss);
    info.node.addMarkup(info.x, info.y, {
        type: 'analysis',
        color: bucket.color,
        label: bucket.label,
        value: scoreLoss,
    });
    const side = info.color === -1 ? 'black' : 'white';
    const existing = state.analysisByMove.get(moveNumber);
    if (existing) {
        if (existing.bucketId === bucket.id) {
            return;
        }
        state.qualityCounts[side][existing.bucketId] = Math.max(
            0,
            state.qualityCounts[side][existing.bucketId] - 1,
        );
    }
    state.analysisByMove.set(moveNumber, { bucketId: bucket.id, side });
    state.qualityCounts[side][bucket.id] += 1;
    updateQualityChart();
    if (state.editor?.getCurrent() === info.node) {
        state.editor.refreshMarkup?.();
    }
}

function extractScoreLoss(movePayload) {
    if (!movePayload) return null;
    const direct = getNumber(
        movePayload.score_loss,
        movePayload.scoreLoss,
        movePayload.loss,
        movePayload.point_loss,
    );
    if (direct !== null) return Math.abs(direct);

    const best = Array.isArray(movePayload.branches) ? movePayload.branches[0] : null;
    const playedMove = movePayload.move || movePayload.coordinate || movePayload.player_move || movePayload.played;
    const playedBranch = Array.isArray(movePayload.branches)
        ? movePayload.branches.find(branch =>
            branch.move === playedMove ||
            branch.coordinate === playedMove ||
            branch.played === true)
        : null;

    const bestScore = getNumber(best?.score, best?.scoreLead, best?.score_lead);
    const playedScore = getNumber(
        movePayload.score,
        movePayload.scoreLead,
        movePayload.score_lead,
        playedBranch?.score,
        playedBranch?.scoreLead,
        playedBranch?.score_lead,
    );
    if (bestScore !== null && playedScore !== null) {
        return Math.abs(bestScore - playedScore);
    }
    return null;
}

function getNumber(...values) {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
    }
    return null;
}

function applyScoreSeries(scores, movesLength) {
    if (!Array.isArray(scores) || scores.length < 2) return;
    const hasInitial = scores.length >= movesLength + 1;
    for (let moveNumber = 1; moveNumber <= movesLength; moveNumber += 1) {
        const prevIndex = hasInitial ? moveNumber - 1 : moveNumber - 2;
        const nextIndex = hasInitial ? moveNumber : moveNumber - 1;
        if (prevIndex < 0 || nextIndex >= scores.length) {
            continue;
        }
        const prevScore = scores[prevIndex];
        const nextScore = scores[nextIndex];
        if (typeof prevScore !== 'number' || typeof nextScore !== 'number') {
            continue;
        }
        const scoreLoss = Math.abs(nextScore - prevScore);
        applyMoveAnalysis(moveNumber, scoreLoss);
    }
    state.usingScoreSeries = true;
}

function applyWinrateSeries(winrates) {
    if (!Array.isArray(winrates)) return;
    state.winrateSeries = winrates;
}

function updateCurrentMetrics(moveNumber) {
    const idx = Math.max(0, Math.min(state.scoreSeries.length - 1, moveNumber));
    const score = state.scoreSeries[idx];
    const winrate = state.winrateSeries[idx];
    if (currentScoreEl) {
        currentScoreEl.textContent = typeof score === 'number' ? score.toFixed(2) : '--';
    }
    if (currentWinrateEl) {
        currentWinrateEl.textContent = typeof winrate === 'number' ? `${(winrate * 100).toFixed(1)}%` : '--';
    }
}

function attachSocketHandlers() {
    const { ws, meta } = state;
    ws.onopen = () => {
        if (meta.jwt) {
            log('WebSocket open, authenticating…');
            ws.send(JSON.stringify([
                'authenticate',
                {
                    jwt: meta.jwt,
                    device_id: meta.deviceId,
                    user_agent: navigator.userAgent,
                    language: 'en',
                    language_version: '56583ff4aa3a8b724c611b750e451d61',
                    client_version: '5.1-8955-gf723043f',
                },
            ]));
        } else {
            log('WebSocket open (no jwt provided, continuing unauthenticated)…');
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
                const metaData = payload.metadata;
                state.metaData = metaData;
                log(`AI metadata received (engine ${metaData.engine || 'unknown'})`);
                setPlayerNames(metaData);
                resetQualityCounts();
                renderGame(metaData.game_state);
                if (Array.isArray(metaData.scores)) {
                    state.scoreSeries = metaData.scores;
                    applyScoreSeries(metaData.scores, metaData.game_state?.moves?.length || 0);
                }
                if (Array.isArray(metaData.win_rates)) {
                    applyWinrateSeries(metaData.win_rates);
                }
                updateCurrentMetrics(metaData.game_state?.moves?.length || 0);
                // Also surface any detailed move stats in the same payload
                Object.entries(payload).forEach(([k, v]) => {
                    if (k.startsWith('move-') && v?.move_number !== undefined) {
                        const best = Array.isArray(v.branches) && v.branches[0];
                        if (best) {
                            const wr = (best.win_rate * 100).toFixed(1);
                            log(`AI move ${v.move_number}: best winrate ${wr}% score ${best.score?.toFixed?.(2) ?? 'n/a'}`);
                        }
                        if (!state.usingScoreSeries) {
                            const scoreLoss = extractScoreLoss(v);
                            if (scoreLoss !== null) {
                                applyMoveAnalysis(v.move_number, scoreLoss);
                            }
                        }
                    }
                });
            } else if (typeof type === 'string') {
                log(`Event ${type}`);
                if (!state.usingScoreSeries && type.startsWith('move-') && payload?.move_number !== undefined) {
                    const scoreLoss = extractScoreLoss(payload);
                    if (scoreLoss !== null) {
                        applyMoveAnalysis(payload.move_number, scoreLoss);
                    }
                }
            }
        } catch (err) {
            log(`Message parse error: ${err.message}`, 'error');
        }
    };

    ws.onerror = () => log('WebSocket error', 'error');
    ws.onclose = () => log('WebSocket closed');
}

function disconnect() {
    if (state.ws) {
        state.ws.close();
        state.ws = null;
        log('Disconnected');
    }
}

async function startConnection() {
    disconnect();
    const gameUrl = urlInput.value.trim();
    const gameId = parseGameId(gameUrl);
    if (!gameId) {
        log('Please enter a valid OGS game URL', 'error');
        return;
    }
    try {
        let jwt = null;
        try {
            log('Fetching anon JWT…');
            jwt = await fetchAnonJwt();
        } catch (err) {
            log(`JWT fetch failed, continuing without: ${err.message}`, 'error');
        }
        try {
            const gameInfo = await fetchGameInfo(gameId);
            const players = gameInfo?.players || gameInfo;
            if (players?.black || players?.white) {
                setPlayerNames({
                    black: players.black,
                    white: players.white,
                });
            }
        } catch (err) {
            log(`Game info fetch failed: ${err.message}`, 'error');
        }
        log('Fetching AI review info…');
        const review = await fetchAiReview(gameId);
        const meta = {
            jwt,
            gameId,
            aiReviewId: review.id || review.ai_review_id,
            uuid: review.uuid,
            deviceId: crypto.randomUUID(),
        };
        state.meta = meta;
        state.pendingAnalysis = new Map();
        state.analysisByMove = new Map();
        resetQualityCounts();
        log(`Connecting to AI review ${meta.aiReviewId} (uuid ${meta.uuid})…`);
        state.ws = new WebSocket('wss://ai.online-go.com/');
        attachSocketHandlers();
    } catch (err) {
        log(err.message || String(err), 'error');
    }
}

connectBtn?.addEventListener('click', startConnection);
disconnectBtn?.addEventListener('click', disconnect);

// Initialize board on load
buildQualityRows();
updateQualityChart();
resetBoard(19);
log('Ready. Paste an OGS game link and press connect.');
