/**
 * Harvest Track — the score/point track. A vertical ladder (0..100, looped
 * visually) with each player's harvest token sitting at their score. The token
 * animates up/down on score change via CSS transition (token `bottom`).
 *
 * When a player gains points, GameBoard passes the live `popups` from
 * useScoreDeltas; we render a floating "+N" beside that player's token and add a
 * brief pulse class so the moving number reads as "scoring", like the physical
 * table. All motion collapses under prefers-reduced-motion (token durations).
 */
import type React from 'react';
import type { PlayerState } from './boardModel';
import type { ScorePopup } from './useScoreDeltas';

interface HarvestTrackProps {
  players: PlayerState[];
  max?: number;
  /** Live "+N" popups (one per recent positive score delta) from the score hook. */
  popups?: ScorePopup[];
}

const PLAYER_COLORS = [
  'var(--tg-player-0, #e8b53d)',
  'var(--tg-player-1, #cf5b6b)',
  'var(--tg-player-2, #5b8fd0)',
  'var(--tg-player-3, #5fa86a)',
];

export function HarvestTrack({
  players,
  max = 100,
  popups = [],
}: HarvestTrackProps): React.ReactElement {
  const ticks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  return (
    <section className="tg-track" aria-label="Harvest track (scores)">
      <div className="tg-track-head">Harvest Track</div>
      <div className="tg-track-rail">
        {ticks.map((t) => (
          <div
            key={t}
            className="tg-track-tick"
            style={{ bottom: `${(t / max) * 100}%` }}
          >
            <span>{t}</span>
          </div>
        ))}
        {players.map((p, i) => {
          const pct = Math.min(100, (p.score / max) * 100);
          const popping = popups.some((pop) => pop.playerId === p.id);
          const left = 18 + i * 16;
          return (
            <div
              key={p.id}
              className={`tg-track-token${popping ? ' is-scoring' : ''}`}
              title={`${p.name}: ${p.score}`}
              style={{
                bottom: `${pct}%`,
                left: `${left}px`,
                background: PLAYER_COLORS[i % 4],
              }}
            >
              {p.score}
            </div>
          );
        })}
        {popups.map((pop) => {
          const p = players[pop.playerIndex];
          const pct = p ? Math.min(100, (p.score / max) * 100) : 0;
          return (
            <div
              key={pop.key}
              className="tg-score-popup"
              style={{
                bottom: `${pct}%`,
                left: `${18 + pop.playerIndex * 16 + 24}px`,
              }}
              aria-hidden
            >
              +{pop.delta}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export { PLAYER_COLORS };
