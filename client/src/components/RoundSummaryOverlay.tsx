/**
 * RoundSummaryOverlay — a brief scoring-summary moment shown when a round
 * finishes. It lists what each player scored that round (the per-player delta
 * derived in useScoreDeltas) sorted high-to-low, plus their running total.
 *
 * Driven purely by props from GameBoard; the 'roundEnd' sound cue is fired by
 * the hook, not here. Honors prefers-reduced-motion via the design tokens
 * (animation durations collapse to 0).
 */
import type React from 'react';
import type { RoundSummary } from './useScoreDeltas';
import { PLAYER_COLORS } from './HarvestTrack';

interface RoundSummaryOverlayProps {
  summary: RoundSummary;
  onDismiss: () => void;
}

export function RoundSummaryOverlay({
  summary,
  onDismiss,
}: RoundSummaryOverlayProps): React.ReactElement {
  const ranked = [...summary.lines].sort((a, b) => b.delta - a.delta);
  return (
    <div className="tg-round-overlay" role="dialog" aria-label="Round summary">
      <div className="tg-round-card">
        <div className="tg-round-card-head">Round {summary.round} scored</div>
        <ul className="tg-round-list">
          {ranked.map((line) => (
            <li key={line.playerId} className="tg-round-row">
              <span
                className="tg-round-dot"
                style={{ background: PLAYER_COLORS[line.playerIndex % 4] }}
              />
              <span className="tg-round-name">{line.name}</span>
              <span className="tg-round-delta">
                {line.delta >= 0 ? `+${line.delta}` : line.delta}
              </span>
              <span className="tg-round-total">{line.total}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="tg-btn" onClick={onDismiss}>
          Continue to next round
        </button>
      </div>
    </div>
  );
}
