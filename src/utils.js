export function parsePlayerId(input) {
    if (!input) return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return trimmed;
    const urlMatch = trimmed.match(/player\/(\d+)|user\/view\/(\d+)/);
    if (urlMatch) return urlMatch[1] || urlMatch[2];
    return null;
}

export function formatRank(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (value >= 30) {
        const dan = Math.max(1, Math.round(value - 29));
        return `${dan}d`;
    }
    const kyu = Math.max(1, Math.round(30 - value));
    return `${kyu}k`;
}

export function getDisplayName(player) {
    return player?.username || player?.name || player?.display_name || 'Unknown';
}

export function getPlayerSide(game, playerId) {
    const blackId = game.black ?? game.players?.black?.id;
    const whiteId = game.white ?? game.players?.white?.id;
    if (String(blackId) === String(playerId)) return 'black';
    if (String(whiteId) === String(playerId)) return 'white';
    return null;
}

export function getResultForPlayer(game, playerId) {
    const blackId = game.black ?? game.players?.black?.id;
    const whiteId = game.white ?? game.players?.white?.id;
    const isBlack = String(blackId) === String(playerId);
    const isWhite = String(whiteId) === String(playerId);
    if (!isBlack && !isWhite) return 'N/A';
    const lost = isBlack ? game.black_lost : game.white_lost;
    if (typeof lost === 'boolean') return lost ? 'L' : 'W';
    return 'N/A';
}

export function getGameLabel(game) {
    const blackName = getDisplayName(game.players?.black);
    const whiteName = getDisplayName(game.players?.white);
    return `${blackName} vs ${whiteName}`;
}

export function formatGameDate(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toISOString().slice(0, 10);
}

export function getOpponent(game, playerId) {
    const playerSide = getPlayerSide(game, playerId);
    if (playerSide === 'black') return game.players?.white || null;
    if (playerSide === 'white') return game.players?.black || null;
    return null;
}

export function formatResultForPlayer(game, playerId) {
    const result = getResultForPlayer(game, playerId);
    const outcome = (game.outcome || '').toLowerCase();
    const pointsMatch = outcome.match(/([0-9]+(?:\\.[0-9]+)?)/);
    const points = pointsMatch ? pointsMatch[1] : null;
    const isResign = outcome.includes('resign');
    const isTime = outcome.includes('time');

    const side = result === 'W' ? 'W' : result === 'L' ? 'L' : 'N';
    if (isResign) return `${side} + R`;
    if (isTime) return `${side} + T`;
    if (points) return `${side} + ${points}`;
    return `${side} + ?`;
}
