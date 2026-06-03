/**
 * useScoreDeltas — derive live scoring animation signals by diffing successive
 * board `GameState` snapshots (which arrive via StateUpdate broadcasts).
 *
 * It keeps the *previous* state in a ref and, whenever a fresh state comes in,
 * computes:
 *   - per-player score delta (incoming.score - previous.score), positive only
 *     deltas are surfaced as transient "+N" popups;
 *   - whether the round advanced (round field increased), which drives the
 *     round-end summary overlay + 'roundEnd' sound cue;
 *   - whether the game just finished (phase -> 'finished'), which drives the
 *     end-game results screen + 'win' cue.
 *
 * The hook owns NO networking: it is a pure function of the `state` prop fed by
 * GameBoard. Popups auto-expire after a short TTL.
 */
import { useEffect, useRef, useState } from 'react';
import type { GameState } from './boardModel';
import { playCue } from '../design/sound-cues';

/** A transient floating "+N" popup tied to a player. */
export interface ScorePopup {
  readonly key: number;
  readonly playerId: string;
  readonly playerIndex: number;
  readonly delta: number;
}

/** A per-player line in the round summary (delta scored across the round). */
export interface RoundSummaryLine {
  readonly playerId: string;
  readonly name: string;
  readonly playerIndex: number;
  readonly delta: number;
  readonly total: number;
}

export interface RoundSummary {
  /** The round that just finished (the previous round number). */
  readonly round: number;
  readonly lines: RoundSummaryLine[];
}

export interface ScoreDeltas {
  /** Active floating popups to render near tokens/players. */
  readonly popups: ScorePopup[];
  /** Set when a round just advanced; null otherwise. Dismiss via clearRoundSummary. */
  readonly roundSummary: RoundSummary | null;
  readonly clearRoundSummary: () => void;
  /** True once the game has reached the finished phase (latched). */
  readonly justFinished: boolean;
}

const POPUP_TTL_MS = 1600;

export function useScoreDeltas(state: GameState): ScoreDeltas {
  const prevRef = useRef<GameState | null>(null);
  const seqRef = useRef(0);
  const [popups, setPopups] = useState<ScorePopup[]>([]);
  const [roundSummary, setRoundSummary] = useState<RoundSummary | null>(null);
  const [justFinished, setJustFinished] = useState(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (!prev) return; // first snapshot: nothing to diff against

    // 1. Per-player score deltas -> popups + score tick cue.
    const fresh: ScorePopup[] = [];
    let maxDelta = 0;
    state.players.forEach((p, i) => {
      const before = prev.players.find((q) => q.id === p.id);
      if (!before) return;
      const delta = p.score - before.score;
      if (delta > 0) {
        fresh.push({
          key: seqRef.current++,
          playerId: p.id,
          playerIndex: i,
          delta,
        });
        if (delta > maxDelta) maxDelta = delta;
      }
    });

    if (fresh.length > 0) {
      setPopups((cur) => [...cur, ...fresh]);
      const keys = new Set(fresh.map((f) => f.key));
      window.setTimeout(() => {
        setPopups((cur) => cur.filter((p) => !keys.has(p.key)));
      }, POPUP_TTL_MS);
    }

    // 2. Round advanced -> summary overlay + roundEnd cue. Derive each player's
    //    round delta from the score change across the round-advance update.
    const roundAdvanced =
      state.round > prev.round && state.phase !== 'finished';
    if (roundAdvanced) {
      const lines: RoundSummaryLine[] = state.players.map((p, i) => {
        const before = prev.players.find((q) => q.id === p.id);
        return {
          playerId: p.id,
          name: p.name,
          playerIndex: i,
          delta: p.score - (before?.score ?? 0),
          total: p.score,
        };
      });
      setRoundSummary({ round: prev.round, lines });
      playCue('roundEnd');
    } else if (fresh.length > 0) {
      // Plain in-round scoring: a rising tally proportional to the biggest gain.
      playCue('score', { n: Math.min(8, Math.max(1, maxDelta)) });
    }

    // 3. Game finished -> latch + win cue (once).
    if (state.phase === 'finished' && prev.phase !== 'finished') {
      setJustFinished(true);
      playCue('win');
    }
    if (state.phase !== 'finished' && justFinished) {
      setJustFinished(false);
    }
  }, [state, justFinished]);

  return {
    popups,
    roundSummary,
    clearRoundSummary: () => setRoundSummary(null),
    justFinished,
  };
}
