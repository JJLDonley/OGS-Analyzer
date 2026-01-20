import { PHASES } from './state.js';
import { QUALITY_BUCKETS, WINRATE_BUCKETS } from './analysis.js';
import { formatGameDate, formatRank, getDisplayName, getOpponent, formatResultForPlayer, getGameLabel, getPlayerSide } from './utils.js';

export function setStatus(elements, message) {
    if (elements.status) elements.status.textContent = message;
}

export function setGamesStatus(elements, message) {
    if (elements.gamesStatus) elements.gamesStatus.textContent = message;
}

export function renderProfileHeader(elements, state) {
    elements.profileName.textContent = state.playerName || 'Player loaded';
    elements.profileMeta.textContent = state.playerId
        ? `OGS ID ${state.playerId} • ${state.playerRank || '?'}`
        : 'Enter a player URL to begin.';
    if (state.playerAvatar) {
        elements.profileAvatar.style.backgroundImage = `url(${state.playerAvatar})`;
    } else {
        elements.profileAvatar.style.backgroundImage = '';
    }
}

export function renderStatsGrid(elements, stats) {
    if (!elements.profileStats) return;
    elements.profileStats.innerHTML = '';
    stats.forEach(item => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML = `${item.label}<span>${item.value}</span>`;
        elements.profileStats.appendChild(card);
    });
}

export function renderAnalysisReport(elements, aggregate) {
    if (!elements.phaseReport || !elements.analysisSummary) return;

    const blackTotalMoves = aggregate.black?.phases?.total?.moves || 0;
    const whiteTotalMoves = aggregate.white?.phases?.total?.moves || 0;
    const blackGames = aggregate.black?.games || 0;
    const whiteGames = aggregate.white?.games || 0;

    elements.analysisSummary.innerHTML = `
        <div><strong>Games Analyzed:</strong> Black ${blackGames} | White ${whiteGames}</div>
        <div><strong>Moves Analyzed:</strong> Black ${blackTotalMoves} | White ${whiteTotalMoves}</div>
    `;

    elements.phaseReport.innerHTML = PHASES.map(phase => {
        const blackPhase = aggregate.black?.phases?.[phase.id];
        const whitePhase = aggregate.white?.phases?.[phase.id];
        const title = phase.id === 'total'
            ? 'TOTAL'
            : `${phase.label.toUpperCase()} (B:${blackPhase?.moves || 0} W:${whitePhase?.moves || 0} moves)`;
        return `
            <div class="phase-section">
                <div class="phase-title">--- ${title} ---</div>
                ${renderMetricRow(blackPhase, whitePhase, 'Accuracy', 'accuracy', '%', 100)}
                ${renderMetricRow(blackPhase, whitePhase, 'AvgScoreLoss', 'avgLoss', '', 12)}
                ${renderMetricRow(blackPhase, whitePhase, 'AvgWinLoss', 'avgWinLoss', '%', 50)}
                <div class="mistake-row">
                    <div>Black Mistakes: ${formatMistakes(blackPhase)}</div>
                    <div>White Mistakes: ${formatMistakes(whitePhase)}</div>
                </div>
            </div>
        `;
    }).join('');

    renderDistribution(elements.scoreDistribution, QUALITY_BUCKETS, aggregate.black?.phases?.total, aggregate.white?.phases?.total, true, 'score');
    renderDistribution(elements.winrateDistribution, WINRATE_BUCKETS, aggregate.black?.phases?.total, aggregate.white?.phases?.total, false, 'winrate');
}

function renderMetricRow(blackPhase, whitePhase, label, key, suffix, maxValue) {
    const blackValue = key ? (blackPhase?.[key] ?? 0) : 0;
    const whiteValue = key ? (whitePhase?.[key] ?? 0) : 0;
    const blackPct = maxValue ? Math.min(100, (blackValue / maxValue) * 100) : 0;
    const whitePct = maxValue ? Math.min(100, (whiteValue / maxValue) * 100) : 0;
    return `
        <div class="metric-row">
            <div class="metric-side left">
                <div class="metric-value">${blackValue}${suffix}</div>
            </div>
            <div class="metric-center">
                <div class="metric-label">${label}</div>
                <div class="metric-bar-split">
                    <div class="metric-half left"><div class="metric-fill" style="width:${blackPct}%"></div></div>
                    <div class="metric-half right"><div class="metric-fill" style="width:${whitePct}%"></div></div>
                </div>
            </div>
            <div class="metric-side right">
                <div class="metric-value">${whiteValue}${suffix}</div>
            </div>
        </div>
    `;
}

function formatMistakes(phase) {
    if (!phase?.mistakes) return '0/0/0';
    const { total, severe, blunders } = phase.mistakes;
    return `${total}/${severe}/${blunders}`;
}

function renderDistribution(container, buckets, blackPhase, whitePhase, useColors, bucketType) {
    if (!container) return;
    const blackMoves = blackPhase?.moves || 0;
    const whiteMoves = whitePhase?.moves || 0;
    const blackBuckets = bucketType === 'winrate' ? (blackPhase?.winrateBuckets || {}) : (blackPhase?.scoreBuckets || {});
    const whiteBuckets = bucketType === 'winrate' ? (whitePhase?.winrateBuckets || {}) : (whitePhase?.scoreBuckets || {});

    container.innerHTML = buckets.map(bucket => {
        const blackCount = blackBuckets[bucket.id] || 0;
        const whiteCount = whiteBuckets[bucket.id] || 0;
        const blackPct = blackMoves ? (blackCount / blackMoves) * 100 : 0;
        const whitePct = whiteMoves ? (whiteCount / whiteMoves) * 100 : 0;
        const color = useColors ? bucket.color || '#4fd1c5' : '#4fd1c5';
        return `
            <div class="dist-row">
                <div>
                    <div class="dist-bar left"><div class="dist-fill" style="width:${blackPct}%; background:${color};"></div></div>
                    <div class="metric-value">${blackPct.toFixed(1)}%</div>
                </div>
                <div class="dist-label">${bucket.label}</div>
                <div>
                    <div class="dist-bar right"><div class="dist-fill" style="width:${whitePct}%; background:${color};"></div></div>
                    <div class="metric-value">${whitePct.toFixed(1)}%</div>
                </div>
            </div>
        `;
    }).join('');
}

export function renderGamesTable(elements, games, analyses, analysisErrors, playerId, onLoad) {
    if (!elements.gamesTable) return;
    if (!games.length) {
        elements.gamesTable.innerHTML = '<div class="status">No games to display for current filters.</div>';
        return;
    }
    const rows = games.map(game => {
        const analysis = analyses.get(game.id);
        const playerSide = getPlayerSide(game, playerId);
        const status = analysis ? 'Ready' : (analysisErrors.get(game.id) || 'Pending');
        const opponent = getOpponent(game, playerId);
        const opponentName = opponent ? getDisplayName(opponent) : 'Unknown';
        const opponentRank = formatRank(opponent?.ranking || opponent?.rank);
        const userRank = formatRank((playerSide === 'black' ? game.players?.black?.ranking : game.players?.white?.ranking) || null);
        const userLabel = playerSide === 'black' ? `\u25cf ${userRank || ''}`.trim() : `\u26aa ${userRank || ''}`.trim();
        const resultLabel = formatResultForPlayer(game, playerId);
        const isLoss = resultLabel.startsWith('L+');
        const pillClass = isLoss ? 'pill danger' : 'pill success';
        const dateLabel = formatGameDate(game.ended || game.started);
        const sizeLabel = `${game.width || 0}x${game.height || 0}`;
        const handicapLabel = game.handicap ? String(game.handicap) : '-';
        return `
            <tr>
                <td class="col-user">${userLabel}</td>
                <td class="col-date">${dateLabel}</td>
                <td class="col-opponent">${opponentName}${opponentRank ? ` [${opponentRank}]` : ''}</td>
                <td class="col-size">${sizeLabel}</td>
                <td class="col-hc">${handicapLabel}</td>
                <td class="col-name">${game.name || getGameLabel(game)}</td>
                <td class="col-result"><span class="${pillClass}">${resultLabel}</span></td>
                <td class="col-analysis">${status}</td>
                <td class="col-viewer"><button class="small" data-game-id="${game.id}">Load</button></td>
            </tr>
        `;
    }).join('');
    elements.gamesTable.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th class="col-user">User</th>
                    <th class="col-date">Date</th>
                    <th class="col-opponent">Opponent</th>
                    <th class="col-size">Size</th>
                    <th class="col-hc">HC</th>
                    <th class="col-name">Name</th>
                    <th class="col-result">Result</th>
                    <th class="col-analysis">Analysis</th>
                    <th class="col-viewer">Viewer</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    elements.gamesTable.querySelectorAll('button[data-game-id]').forEach(button => {
        button.addEventListener('click', () => {
            const gameId = button.getAttribute('data-game-id');
            if (gameId) onLoad(gameId);
        });
    });
}

export function setView(elements, view) {
    if (!elements.homeView || !elements.viewerView) return;
    elements.homeView.classList.toggle('active', view === 'home');
    elements.viewerView.classList.toggle('active', view === 'viewer');
}

export function renderViewerMeta(elements, report, label, result) {
    if (elements.viewerGameTitle) elements.viewerGameTitle.textContent = label || 'Game loaded';
    if (elements.viewerGameMeta) elements.viewerGameMeta.textContent = report ? `Accuracy ${report.phases.total.accuracy}%` : 'AI data loaded';
    if (elements.viewerGameResult) elements.viewerGameResult.textContent = result || '--';

    if (!elements.viewerGameReport) return;
    if (!report) {
        elements.viewerGameReport.innerHTML = '<div class="status">No analysis available.</div>';
        return;
    }
    elements.viewerGameReport.innerHTML = `
        <div class="report-block">
            <div><strong>Opening</strong> • ${report.phases.opening.accuracy}% accuracy</div>
            <div><strong>Middle</strong> • ${report.phases.middle.accuracy}% accuracy</div>
            <div><strong>End</strong> • ${report.phases.end.accuracy}% accuracy</div>
            <div>Average score loss: ${report.phases.total.avgLoss}</div>
        </div>
    `;
}

export function renderViewerAnalysis(elements, qualityData, phaseId, report) {
    if (!elements.qualityTable) return;
    const phaseKey = phaseId === 'all' ? 'all' : phaseId;
    const phase = qualityData?.[phaseKey] || { black: {}, white: {} };
    const blackTotal = Object.values(phase.black || {}).reduce((sum, val) => sum + val, 0);
    const whiteTotal = Object.values(phase.white || {}).reduce((sum, val) => sum + val, 0);

    elements.qualityTable.innerHTML = QUALITY_BUCKETS.map(bucket => {
        const blackCount = phase.black?.[bucket.id] || 0;
        const whiteCount = phase.white?.[bucket.id] || 0;
        const blackPct = blackTotal ? (blackCount / blackTotal) * 100 : 0;
        const whitePct = whiteTotal ? (whiteCount / whiteTotal) * 100 : 0;
        return `
            <div class="quality-row">
                <div class="metric-value">${bucket.label}</div>
                <div class="quality-line">
                    <div>Black</div>
                    <div class="bar"><div class="fill" style="width:${blackPct}%; background:${bucket.color};"></div></div>
                    <div>${blackCount}</div>
                </div>
                <div class="quality-line">
                    <div>White</div>
                    <div class="bar"><div class="fill" style="width:${whitePct}%; background:${bucket.color};"></div></div>
                    <div>${whiteCount}</div>
                </div>
            </div>
        `;
    }).join('');

    if (!elements.viewerGameReport) return;
    if (!report) {
        elements.viewerGameReport.innerHTML = '<div class="status">No analysis available.</div>';
        return;
    }
    const phaseStats = phaseId === 'all' ? report.phases.total : report.phases[phaseId];
    elements.viewerGameReport.innerHTML = `
        <div class="report-block">
            <div><strong>${phaseId.toUpperCase()}</strong> • ${phaseStats.accuracy}% accuracy</div>
            <div>Average score loss: ${phaseStats.avgLoss}</div>
            <div>Moves analyzed: ${phaseStats.moves}</div>
        </div>
    `;
}
