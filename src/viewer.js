import { formatRank, getDisplayName } from './utils.js';
import { getQualityBucket } from './analysis.js';

export function resetBoard(state, size = 19) {
    const currentViewer = document.querySelector('.besogo-viewer');
    if (!currentViewer) return;

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
    } catch (err) {
        console.warn('Besogo init failed', err);
    }
}

export function setViewerNames(state, game) {
    if (!state.editor || !game) return;
    const black = game.players?.black || {};
    const white = game.players?.white || {};
    const info = {
        PB: getDisplayName(black),
        PW: getDisplayName(white),
        BR: formatRank(black?.ranking) || '?',
        WR: formatRank(white?.ranking) || '?',
    };
    state.editor.setGameInfo(info);
}

export function renderGame(state, gameState, game) {
    const width = gameState.width || 19;
    const height = gameState.height || 19;
    resetBoard(state, width);
    const editor = state.editor;
    if (!editor) return;

    const root = besogo.makeGameRoot(width, height);
    let current = root;
    const initialPlayer = (gameState.initial_player || 'black').toLowerCase() === 'white' ? 1 : -1;
    let color = initialPlayer;
    state.viewerNodesByMove = new Map();

    (gameState.moves || []).forEach((move, index) => {
        const child = current.makeChild();
        const x = (move.x ?? -1) >= 0 ? move.x + 1 : 0;
        const y = (move.y ?? -1) >= 0 ? move.y + 1 : 0;
        child.playMove(x, y, color, true);
        current.addChild(child);
        current = child;
        color = -color;
        state.viewerNodesByMove.set(index + 1, { node: child, x, y });
    });

    editor.loadRoot(root);
    editor.setCurrent(current);
    setViewerNames(state, game);
}

export function applyMoveQualityMarks(state, analysis) {
    if (!analysis || !state.viewerNodesByMove) return;
    const losses = analysis.scoreLosses || [];
    losses.forEach((scoreLoss, index) => {
        if (scoreLoss === null || scoreLoss === undefined) return;
        const info = state.viewerNodesByMove.get(index + 1);
        if (!info || info.x <= 0 || info.y <= 0) return;
        const bucket = getQualityBucket(scoreLoss);
        info.node.addMarkup(info.x, info.y, {
            type: 'analysis',
            color: bucket.color,
            label: bucket.label,
            value: scoreLoss,
        });
    });
    state.editor?.refreshMarkup?.();
}
