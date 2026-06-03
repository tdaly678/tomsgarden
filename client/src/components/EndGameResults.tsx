/**
 * EndGameResults — final standings screen shown when the game is finished
 * (phase === 'finished' / a winner is set).
 *
 * Players are sorted by final score (descending). The top score is the winning
 * score; every player matching it is highlighted as a winner (ties are shared).
 * A "New game" action routes back to the lobby via the optional onPlayAgain
 * callback. The 'win' sound cue is fired by useScoreDeltas, not here.
 *
 * Driven purely by props from GameBoard. Honors prefers-reduced-motion through
 * the design-token durations.
 */
import type React from 'react';
import type { GameState } from './boardModel';
import { PLAYER_COLORS } from './HarvestTrack';

interface EndGameResultsProps {
  state: GameState;
  /** Route back to the lobby / start a new game. Hidden when omitted. */
  onPlayAgain?: () => void;
}

export function EndGameResults({
  state,
  onPlayAgain,
}: EndGameResultsProps): React.ReactElement {
  // Standings sorted by score desc; preserve original index for color.
  const standings = state.players
    .map((p, index) => ({ ...p, index }))
    .sort((a, b) => b.score - a.score);

  const topScore = standings.length > 0 ? standings[0].score : 0;
  const isWinner = (score: number): boolean =>
    score === topScore && topScore > 0;
  const winnerCount = standings.filter((p) => isWinner(p.score)).length;
  const headline =
    winnerCount > 1 ? 'It’s a shared win!' : 'Winner!';

  return (
    <div className="tg-results" role="dialog" aria-label="Final results">
      <div className="tg-results-card">
        <div className="tg-results-trophy" aria-hidden>
          {'\u{1F3C6}'}
        </div>
        <h2 className="tg-results-head">{headline}</h2>
        <ol className="tg-results-list">
          {standings.map((p, rank) => {
            const won = isWinner(p.score);
            return (
              <li
                key={p.id}
                className={`tg-results-row${won ? ' is-winner' : ''}`}
              >
                <span className="tg-results-rank">{rank + 1}</span>
                <span
                  className="tg-round-dot"
                  style={{ background: PLAYER_COLORS[p.index % 4] }}
                />
                <span className="tg-results-name">
                  {p.name}
                  {won && <span className="tg-results-crown"> {'★'}</span>}
                </span>
                <span className="tg-results-score">{p.score}</span>
              </li>
            );
          })}
        </ol>
        {onPlayAgain && (
          <button type="button" className="tg-btn" onClick={onPlayAgain}>
            Play again / New game
          </button>
        )}
      </div>
    </div>
  );
}
