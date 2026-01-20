import { state } from './state.js';
import { elements } from './dom.js';
import { parsePlayerId, formatRank, getDisplayName, getPlayerSide } from './utils.js';
import { clearSessionCache } from './storage.js';
import { fetchPlayerGamesPage, fetchAnalysisForGame, fetchAiReviewList } from './api.js';
import { aggregateReports, buildGameReport, computeMoveQuality } from './analysis.js';
import {
    renderProfileHeader,
    renderStatsGrid,
    renderAnalysisReport,
    renderGamesTable,
    setStatus,
    setGamesStatus,
    setView,
    renderViewerMeta,
    renderViewerAnalysis,
} from './render.js';
import { resetBoard, renderGame, applyMoveQualityMarks } from './viewer.js';
import { getResultForPlayer, getGameLabel } from './utils.js';

function getFilteredGames() {
    const includeRanked = elements.filterRanked?.checked;
    const includeFree = elements.filterFree?.checked;
    return state.games.filter(game => {
        if (game.ranked && includeRanked) return true;
        if (!game.ranked && includeFree) return true;
        return false;
    });
}

function renderAll() {
    renderProfileHeader(elements, state);
    const filtered = getFilteredGames();
    const aggregate = aggregateReports(filtered, state.analyses, state.playerId);
    const totals = {
        total: filtered.length,
        ranked: filtered.filter(game => game.ranked).length,
        free: filtered.filter(game => !game.ranked).length,
    };

    renderStatsGrid(elements, [
        { label: 'Total games', value: totals.total },
        { label: 'Ranked', value: totals.ranked },
        { label: 'Free', value: totals.free },
        { label: 'Wins', value: aggregate.combined.wins },
        { label: 'Losses', value: aggregate.combined.losses },
        { label: 'Accuracy', value: `${aggregate.combined.phases.total.accuracy}%` },
    ]);

    renderAnalysisReport(elements, aggregate);
    renderGamesTable(elements, filtered, state.analyses, state.analysisErrors, state.playerId, loadGameToViewer);
    syncGamesPanelHeight();
}

function resetState() {
    state.games = [];
    state.analyses = new Map();
    state.analysisErrors = new Map();
    state.selectedGameId = null;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function processGamesSequential(playerId, targetCount = 50) {
    let analyzed = 0;
    let page = 1;
    let hasNext = true;
    const includeRanked = elements.filterRanked?.checked;
    const includeFree = elements.filterFree?.checked;
    const rankedFilter = includeRanked && !includeFree ? true : (!includeRanked && includeFree ? false : null);

    while (analyzed < targetCount && hasNext) {
        const data = await fetchPlayerGamesPage(playerId, page, {
            pageSize: 25,
            ranked: rankedFilter === null ? undefined : rankedFilter,
        });
        const results = Array.isArray(data?.results) ? data.results : [];

        for (const game of results) {
            if (analyzed >= targetCount) break;
            if (game.width !== 19 || game.height !== 19) continue;

            let reviewList = [];
            try {
                reviewList = await fetchAiReviewList(game.id);
            } catch (err) {
                setGamesStatus(elements, `Throttled on reviews. Waiting...`);
                await wait(1000);
                continue;
            }
            if (!reviewList.length) continue;

            try {
                const analysis = await fetchAnalysisForGame(game.id, reviewList);
                state.games.push(game);
                state.analyses.set(game.id, analysis);
                analyzed += 1;
                renderAll();
                setGamesStatus(elements, `Analyzed ${analyzed} of ${targetCount}...`);
                await wait(600);
            } catch (err) {
                state.analysisErrors.set(game.id, err.message || 'Analysis failed');
                await wait(600);
            }
        }

        hasNext = Boolean(data?.next);
        page += 1;
    }
}

async function loadPlayerProfile() {
    const playerId = parsePlayerId(elements.playerInput.value);
    if (!playerId) {
        setStatus(elements, 'Please enter a valid player URL or ID.');
        return;
    }

    resetState();
    state.playerId = playerId;
    setStatus(elements, 'Loading 19x19 AI-reviewed games...');

    try {
        state.games = [];
        state.analyses = new Map();
        state.analysisErrors = new Map();
        setGamesStatus(elements, 'Analyzing games one by one...');
        await processGamesSequential(playerId, 50);
    } catch (err) {
        setStatus(elements, `Failed to load games: ${err.message}`);
        return;
    }

    const sampleGame = state.games.find(game => getPlayerSide(game, playerId));
    if (sampleGame) {
        const isBlack = getPlayerSide(sampleGame, playerId) === 'black';
        const player = isBlack ? sampleGame.players?.black : sampleGame.players?.white;
        state.playerName = getDisplayName(player);
        const rank = formatRank(player?.ranking || player?.rank);
        state.playerRank = rank || 'Unknown rank';
        state.playerAvatar = player?.icon || null;
    } else {
        state.playerName = `Player ${playerId}`;
        state.playerRank = null;
        state.playerAvatar = null;
    }

    renderAll();

    setGamesStatus(elements, `Loaded ${state.games.length} games.`);
    setStatus(elements, `Profile loaded for ${state.playerName || playerId}.`);
}

async function loadGameToViewer(gameId) {
    const game = state.games.find(item => String(item.id) === String(gameId));
    if (!game) return;

    setStatus(elements, `Loading game ${gameId}...`);
    let analysis = state.analyses.get(game.id);
    if (!analysis) {
        try {
            analysis = await fetchAnalysisForGame(game.id);
            state.analyses.set(game.id, analysis);
        } catch (err) {
            setStatus(elements, `Failed to load game ${gameId}: ${err.message}`);
            return;
        }
    }

    const gameState = analysis.metadata?.game_state;
    if (gameState) {
        renderGame(state, gameState, game);
        state.selectedGameId = game.id;
        const report = buildGameReport(game, analysis, state.playerId);
        state.viewerReport = report;
        state.viewerQuality = computeMoveQuality(analysis);
        state.viewerScores = Array.isArray(analysis.metadata?.scores) ? analysis.metadata.scores : [];
        state.viewerWinrates = Array.isArray(analysis.metadata?.win_rates) ? analysis.metadata.win_rates : [];
        state.viewerMovesLength = gameState.moves?.length || 0;
        attachViewerListener(gameState.initial_player || 'black');
        applyMoveQualityMarks(state, analysis);
        renderViewerMeta(elements, report, getGameLabel(game), getResultForPlayer(game, state.playerId));
        renderViewerAnalysis(elements, state.viewerQuality, state.viewerPhase, report);
        setView(elements, 'viewer');
        setStatus(elements, `Loaded game ${gameId}.`);
    } else {
        setStatus(elements, `Missing game state for ${gameId}.`);
    }
}

function attachViewerListener(initialPlayer) {
    if (!state.editor || state.editorListenerTarget === state.editor) return;
    state.editorListenerTarget = state.editor;
    state.editor.addListener(msg => {
        if (msg.navChange) {
            const moveNumber = state.editor.getCurrent().moveNumber || 0;
            updateCurrentMetrics(moveNumber, initialPlayer);
        }
    });
    updateCurrentMetrics(state.viewerMovesLength, initialPlayer);
}

function updateCurrentMetrics(moveNumber, initialPlayer) {
    if (!elements.currentScore || !elements.currentWinrate) return;
    const hasInitial = state.viewerScores.length >= state.viewerMovesLength + 1;
    const index = Math.max(0, Math.min(state.viewerScores.length - 1, hasInitial ? moveNumber : moveNumber - 1));
    const score = state.viewerScores[index];
    const winrate = state.viewerWinrates[index];
    elements.currentScore.textContent = typeof score === 'number' ? score.toFixed(2) : '--';
    elements.currentWinrate.textContent = typeof winrate === 'number' ? `${(winrate * 100).toFixed(1)}%` : '--';
}

function handleBack() {
    setView(elements, 'home');
}

function setActivePhase(phaseId) {
    state.viewerPhase = phaseId;
    if (elements.analysisTabs) {
        elements.analysisTabs.querySelectorAll('.tab').forEach(button => {
            const isActive = button.dataset.phase === phaseId;
            button.classList.toggle('active', isActive);
            button.setAttribute('tabindex', isActive ? '0' : '-1');
        });
    }
    renderViewerAnalysis(elements, state.viewerQuality, state.viewerPhase, state.viewerReport);
}

function attachHandlers() {
    elements.loadPlayer?.addEventListener('click', loadPlayerProfile);
    elements.clearSession?.addEventListener('click', () => {
        clearSessionCache();
        setStatus(elements, 'Session cache cleared.');
    });
    elements.filterRanked?.addEventListener('change', renderAll);
    elements.filterFree?.addEventListener('change', renderAll);
    elements.backToHome?.addEventListener('click', handleBack);
    window.addEventListener('resize', syncGamesPanelHeight);
    elements.analysisTabs?.addEventListener('click', event => {
        const button = event.target.closest('.tab');
        if (!button) return;
        const phase = button.dataset.phase || 'all';
        setActivePhase(phase);
    });
}

function syncGamesPanelHeight() {
    const reportPanel = document.querySelector('.tables-panel');
    const gamesPanel = document.querySelector('.games-panel');
    if (!reportPanel || !gamesPanel) return;
    const height = reportPanel.getBoundingClientRect().height;
    if (height > 0) {
        gamesPanel.style.height = `${height}px`;
    }
}

attachHandlers();
renderProfileHeader(elements, state);
resetBoard(state, 19);
setStatus(elements, 'Ready to load a player.');
