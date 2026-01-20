# Implementation Plan: Player Profile Overview

## Goals
- Build a static, GitHub Pages-friendly player profile overview that loads OGS games client-side.
- Aggregate AI analysis and game outcomes into summary tables and detailed reports.
- Provide session-only storage via `sessionStorage` to avoid persistence.

## Data Sources
- OGS player games JSON: `https://online-go.com/api/v1/players/{playerId}/games?page={n}`.
- Per-game AI analysis: define and document a source (endpoint or local JSON) before wiring aggregation.
  - OGS AI review WebSocket + `ai_reviews` list (already in `index.js`).

## Data Model
- Player: `id`, `name`, `rank`, `avatar`.
- Game: `id`, `result` (W/L), `PW`, `PB`, `ranked` boolean, `moves`, `analysis` (per-move score/winrate).
- Phases: Opening (0-60), Middle (60-150), End (150+).

## Aggregation Rules
- Compute totals for all games and per phase.
- Separate totals for Ranked vs Free; allow both via checkbox filters.
- Group by player color to compute W/L for `PW` and `PB`.
- Provide per-game summary rows: `[W||L, PW, PB, Ranked/Free, Moves, AI summary]`.
- Accuracy metric: % of moves with score loss <= 0.5 (ignore best-move / visits data).

## UI Layout
- Profile header: player name/id, rank, avatar, summary stats.
- Filter panel: Ranked/Free checkboxes (both can be on/off).
- Summary tables: All games, Opening, Middle, End.
- Games list: sortable table with W/L, PW, PB, Ranked/Free, moves, and AI quality.
- Each game row includes a link/button that loads the game into the Besogo minimal viewer.
- Detailed report section: per-game deep dive, then combined report.

## Storage (Ephemeral)
- Use `sessionStorage` for:
  - Cached game pages.
  - Cached AI analysis results.
  - Active filters and selected game.
- Provide a "Clear session" button to reset.

## Implementation Steps
1. Create data loader for paged games; cache pages in `sessionStorage`.
2. Add analysis loader (placeholder until source is confirmed).
3. Build aggregation utilities (phase split, W/L by color, ranked/free splits).
4. Replace `index.html` layout with profile + filters + tables + lists.
5. Wire UI to render from aggregates and live filters.
6. Add report generator (per-game + combined).
7. Test with `games-page-1.json` and real API data.

## Open Questions
- Exact AI analysis source (endpoint or local file)?
- Preferred fields for AI summary (e.g., accuracy, blunders, winrate loss)?
