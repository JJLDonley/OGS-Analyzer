import { ACCURACY_THRESHOLD } from './state.js';
import { getPlayerSide, getResultForPlayer, getGameLabel } from './utils.js';

export function initPhaseStats() {
    return {
        moves: 0,
        accurate: 0,
        scoreLossTotal: 0,
        winrateLossTotal: 0,
        mistakes: { total: 0, severe: 0, blunders: 0 },
        scoreBuckets: initQualityCounts(),
        winrateBuckets: initWinrateCounts(),
    };
}

export function initPlayerStats() {
    return {
        total: initPhaseStats(),
        opening: initPhaseStats(),
        middle: initPhaseStats(),
        end: initPhaseStats(),
    };
}

export function updatePhaseStats(stats, scoreLoss, winrateLoss) {
    stats.moves += 1;
    stats.scoreLossTotal += scoreLoss;
    if (scoreLoss <= ACCURACY_THRESHOLD) {
        stats.accurate += 1;
    }
    const scoreBucket = getQualityBucket(scoreLoss);
    stats.scoreBuckets[scoreBucket.id] += 1;

    if (typeof winrateLoss === 'number') {
        stats.winrateLossTotal += winrateLoss;
        const winrateBucket = getWinrateBucket(winrateLoss * 100);
        stats.winrateBuckets[winrateBucket.id] += 1;
        if (winrateLoss >= 0.1) stats.mistakes.total += 1;
        if (winrateLoss >= 0.2) stats.mistakes.severe += 1;
        if (winrateLoss >= 0.4) stats.mistakes.blunders += 1;
    }
}

export function finalizePhaseStats(stats) {
    const accuracy = stats.moves ? (stats.accurate / stats.moves) * 100 : 0;
    const avgLoss = stats.moves ? stats.scoreLossTotal / stats.moves : 0;
    const avgWinLoss = stats.moves ? (stats.winrateLossTotal / stats.moves) * 100 : 0;
    return {
        moves: stats.moves,
        accuracy: Number(accuracy.toFixed(1)),
        avgLoss: Number(avgLoss.toFixed(2)),
        avgWinLoss: Number(avgWinLoss.toFixed(2)),
        mistakes: stats.mistakes,
        scoreBuckets: stats.scoreBuckets,
        winrateBuckets: stats.winrateBuckets,
    };
}

export function getPhaseId(moveNumber) {
    if (moveNumber <= 60) return 'opening';
    if (moveNumber <= 150) return 'middle';
    return 'end';
}

export function getMoveColor(moveNumber, initialPlayer) {
    const initial = (initialPlayer || 'black').toLowerCase();
    const isOdd = moveNumber % 2 === 1;
    if (initial === 'white') {
        return isOdd ? 'white' : 'black';
    }
    return isOdd ? 'black' : 'white';
}

export function computeScoreLosses(scores, movesLength) {
    const losses = new Array(movesLength).fill(null);
    if (!Array.isArray(scores) || scores.length < 2) return losses;
    const hasInitial = scores.length >= movesLength + 1;
    for (let moveNumber = 1; moveNumber <= movesLength; moveNumber += 1) {
        const prevIndex = hasInitial ? moveNumber - 1 : moveNumber - 2;
        const nextIndex = hasInitial ? moveNumber : moveNumber - 1;
        if (prevIndex < 0 || nextIndex >= scores.length) continue;
        const prevScore = scores[prevIndex];
        const nextScore = scores[nextIndex];
        if (typeof prevScore !== 'number' || typeof nextScore !== 'number') continue;
        losses[moveNumber - 1] = Math.abs(nextScore - prevScore);
    }
    return losses;
}

export const QUALITY_BUCKETS = [
    { id: 'best', label: 'Best (<=0.5)', max: 0.5, color: '#3b82f6' },
    { id: 'good', label: 'Good (0.5-1.5)', max: 1.5, color: '#22c55e' },
    { id: 'ok', label: 'Ok (1.5-3)', max: 3, color: '#facc15' },
    { id: 'bad', label: 'Bad (3-6)', max: 6, color: '#ef4444' },
    { id: 'blunder', label: 'Blunder (6-12+)', max: Infinity, color: '#a855f7' },
];

function initQualityCounts() {
    return Object.fromEntries(QUALITY_BUCKETS.map(bucket => [bucket.id, 0]));
}

export const WINRATE_BUCKETS = [
    { id: 'lt1', label: '<1%', max: 1 },
    { id: '1-3', label: '1-3%', max: 3 },
    { id: '3-6', label: '3-6%', max: 6 },
    { id: '6-12', label: '6-12%', max: 12 },
    { id: '12-24', label: '12-24%', max: 24 },
    { id: '24+', label: '24%+', max: Infinity },
];

function initWinrateCounts() {
    return Object.fromEntries(WINRATE_BUCKETS.map(bucket => [bucket.id, 0]));
}

export function getQualityBucket(scoreLoss) {
    for (const bucket of QUALITY_BUCKETS) {
        if (scoreLoss <= bucket.max) return bucket;
    }
    return QUALITY_BUCKETS[QUALITY_BUCKETS.length - 1];
}

function getWinrateBucket(winrateLossPct) {
    for (const bucket of WINRATE_BUCKETS) {
        if (winrateLossPct <= bucket.max) return bucket;
    }
    return WINRATE_BUCKETS[WINRATE_BUCKETS.length - 1];
}

export function computeMoveQuality(analysis) {
    const gameState = analysis?.metadata?.game_state;
    const movesLength = gameState?.moves?.length || analysis?.scoreLosses?.length || 0;
    const initialPlayer = gameState?.initial_player || 'black';
    const phases = ['all', 'opening', 'middle', 'end'];
    const quality = Object.fromEntries(phases.map(phase => [
        phase,
        { black: initQualityCounts(), white: initQualityCounts() },
    ]));

    for (let moveNumber = 1; moveNumber <= movesLength; moveNumber += 1) {
        const scoreLoss = analysis.scoreLosses?.[moveNumber - 1];
        if (scoreLoss === null || scoreLoss === undefined) continue;
        const side = getMoveColor(moveNumber, initialPlayer);
        const phase = getPhaseId(moveNumber);
        const bucket = getQualityBucket(scoreLoss);
        quality.all[side][bucket.id] += 1;
        quality[phase][side][bucket.id] += 1;
    }

    return quality;
}

export function computeWinrateLosses(winRates, movesLength) {
    const losses = new Array(movesLength).fill(null);
    if (!Array.isArray(winRates) || winRates.length < 2) return losses;
    const hasInitial = winRates.length >= movesLength + 1;
    for (let moveNumber = 1; moveNumber <= movesLength; moveNumber += 1) {
        const prevIndex = hasInitial ? moveNumber - 1 : moveNumber - 2;
        const nextIndex = hasInitial ? moveNumber : moveNumber - 1;
        if (prevIndex < 0 || nextIndex >= winRates.length) continue;
        const prevRate = winRates[prevIndex];
        const nextRate = winRates[nextIndex];
        if (typeof prevRate !== 'number' || typeof nextRate !== 'number') continue;
        losses[moveNumber - 1] = Math.abs(nextRate - prevRate);
    }
    return losses;
}

export function buildGameReport(game, analysis, playerId) {
    const playerSide = getPlayerSide(game, playerId);
    const phases = initPlayerStats();
    if (!analysis || !playerSide) return null;

    const gameState = analysis.metadata?.game_state;
    const movesLength = gameState?.moves?.length || analysis.scoreLosses.length;
    const initialPlayer = gameState?.initial_player || 'black';

    const winrateLosses = computeWinrateLosses(analysis.metadata?.win_rates, movesLength);

    for (let moveNumber = 1; moveNumber <= movesLength; moveNumber += 1) {
        const scoreLoss = analysis.scoreLosses[moveNumber - 1];
        const winrateLoss = winrateLosses[moveNumber - 1];
        if (scoreLoss === null || scoreLoss === undefined) continue;
        const moveColor = getMoveColor(moveNumber, initialPlayer);
        if (moveColor !== playerSide) continue;
        const phaseId = getPhaseId(moveNumber);
        updatePhaseStats(phases.total, scoreLoss, winrateLoss);
        updatePhaseStats(phases[phaseId], scoreLoss, winrateLoss);
    }

    const finalized = {
        total: finalizePhaseStats(phases.total),
        opening: finalizePhaseStats(phases.opening),
        middle: finalizePhaseStats(phases.middle),
        end: finalizePhaseStats(phases.end),
    };

    return {
        id: game.id,
        label: getGameLabel(game),
        result: getResultForPlayer(game, playerId),
        playerSide,
        ranked: game.ranked,
        phases: finalized,
        rawPhases: phases,
    };
}

export function aggregateReports(games, analyses, playerId) {
    const baseAggregate = () => ({
        games: 0,
        wins: 0,
        losses: 0,
        phases: {
            total: initPhaseStats(),
            opening: initPhaseStats(),
            middle: initPhaseStats(),
            end: initPhaseStats(),
        },
    });

    const combined = baseAggregate();
    const black = baseAggregate();
    const white = baseAggregate();
    const reports = [];

    games.forEach(game => {
        const analysis = analyses.get(game.id);
        const report = buildGameReport(game, analysis, playerId);
        if (!report) return;
        reports.push(report);

        const aggTarget = report.playerSide === 'black' ? black : white;
        const result = report.result;

        [combined, aggTarget].forEach(target => {
            target.games += 1;
            if (result === 'W') target.wins += 1;
            if (result === 'L') target.losses += 1;

            Object.keys(target.phases).forEach(phaseId => {
                const phase = report.rawPhases[phaseId];
                const acc = target.phases[phaseId];
                acc.moves += phase.moves;
                acc.accurate += phase.accurate;
                acc.scoreLossTotal += phase.scoreLossTotal;
                acc.winrateLossTotal += phase.winrateLossTotal;
                acc.mistakes.total += phase.mistakes.total;
                acc.mistakes.severe += phase.mistakes.severe;
                acc.mistakes.blunders += phase.mistakes.blunders;
                Object.keys(acc.scoreBuckets).forEach(bucketId => {
                    acc.scoreBuckets[bucketId] += phase.scoreBuckets[bucketId] || 0;
                });
                Object.keys(acc.winrateBuckets).forEach(bucketId => {
                    acc.winrateBuckets[bucketId] += phase.winrateBuckets[bucketId] || 0;
                });
            });
        });
    });

    function finalizeAggregate(agg) {
        return {
            ...agg,
            phases: {
                total: finalizePhaseStats(agg.phases.total),
                opening: finalizePhaseStats(agg.phases.opening),
                middle: finalizePhaseStats(agg.phases.middle),
                end: finalizePhaseStats(agg.phases.end),
            },
        };
    }

    return {
        combined: finalizeAggregate(combined),
        black: finalizeAggregate(black),
        white: finalizeAggregate(white),
        reports,
    };
}
