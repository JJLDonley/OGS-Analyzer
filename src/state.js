export const PHASES = [
    { id: 'total', label: 'Total', start: 1, end: Infinity },
    { id: 'opening', label: 'Opening (0-60)', start: 1, end: 60 },
    { id: 'middle', label: 'Middle (61-150)', start: 61, end: 150 },
    { id: 'end', label: 'End (151+)', start: 151, end: Infinity },
];

export const ACCURACY_THRESHOLD = 0.5;

export const state = {
    playerId: null,
    playerName: null,
    playerRank: null,
    playerAvatar: null,
    games: [],
    analyses: new Map(),
    analysisErrors: new Map(),
    selectedGameId: null,
    jwt: null,
    viewerPhase: 'all',
    viewerQuality: null,
    viewerReport: null,
    viewerScores: [],
    viewerWinrates: [],
    viewerMovesLength: 0,
    editorListenerTarget: null,
    viewerNodesByMove: null,
};
