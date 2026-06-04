import { useState } from 'react';
import type React from 'react';
import type { RosterMessage } from '@tomsgarden/shared';
import { makeShareUrl, copyToClipboard } from './links';

/** Capitalize a difficulty label (easy -> Easy). */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface LobbyScreenProps {
  roster: RosterMessage;
  /** The local player's id (from JoinAck). */
  localPlayerId: string | null;
  /** Whether the local player is the host. */
  isHost: boolean;
  /** PartyKit host carried into the share link. */
  partyHost?: string;
  onSetReady: (ready: boolean) => void;
  onConfigure: (config: { maxPlayers?: number; password?: string }) => void;
  onKick: (playerId: string) => void;
  /** Host-only: add an AI player with the given difficulty. */
  onAddBot?: (difficulty: 'easy' | 'medium' | 'hard') => void;
  /** Host-only: remove an AI player. */
  onRemoveBot?: (playerId: string) => void;
  onStart: () => void;
  onLeave: () => void;
  /** Last lobby error message (e.g. NOT_READY / NOT_ENOUGH_PLAYERS). */
  error?: string | null;
}

/**
 * LOBBY screen (pre-start). Shows seated players with presence + ready state,
 * a ready toggle for the local player, host-only controls (player count, kick,
 * Start Game), and the share link. All mutations flow through the props which
 * App wires to the RealtimeClient lobby senders.
 */
export function LobbyScreen({
  roster,
  localPlayerId,
  isHost,
  partyHost,
  onSetReady,
  onConfigure,
  onKick,
  onAddBot,
  onRemoveBot,
  onStart,
  onLeave,
  error,
}: LobbyScreenProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const me = roster.seats.find((s) => s.playerId === localPlayerId);
  const seated = roster.seats.length;
  const everyoneReady = roster.seats.every((s) => s.ready || s.isHost);
  const canStart = isHost && seated >= 2 && everyoneReady;

  const shareUrl = makeShareUrl(roster.roomId, partyHost);
  const doCopy = async (): Promise<void> => {
    const ok = await copyToClipboard(shareUrl);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  };

  // Render `maxPlayers` rows: filled seats + empty placeholders.
  const rows: React.ReactElement[] = [];
  for (let i = 0; i < roster.maxPlayers; i++) {
    const seat = roster.seats.find((s) => s.seat === i);
    if (seat) {
      const isMe = seat.playerId === localPlayerId;
      rows.push(
        <li
          key={`seat-${i}`}
          className={`tg-seat${isMe ? ' tg-seat-me' : ''}`}
        >
          <span
            className={`tg-seat-dot${seat.connected ? ' on' : ''}`}
            title={seat.connected ? 'Connected' : 'Disconnected'}
          />
          <span className="tg-seat-name">
            {seat.name}
            {isMe && ' (you)'}
            {seat.isHost && <span className="tg-badge tg-badge-host">Host</span>}
            {seat.isBot && (
              <span className="tg-badge tg-badge-bot" title="AI player">
                🤖 {seat.difficulty ? cap(seat.difficulty) : 'AI'}
              </span>
            )}
          </span>
          {seat.isHost || seat.isBot ? (
            <span className="tg-badge tg-badge-host">Ready</span>
          ) : seat.ready ? (
            <span className="tg-badge tg-badge-ready">Ready</span>
          ) : (
            <span className="tg-badge tg-badge-wait">Not ready</span>
          )}
          {isHost && seat.isBot && (
            <button
              className="tg-seat-kick"
              onClick={() => onRemoveBot?.(seat.playerId)}
              title="Remove AI player"
            >
              Remove
            </button>
          )}
          {isHost && !seat.isHost && !seat.isBot && (
            <button
              className="tg-seat-kick"
              onClick={() => onKick(seat.playerId)}
              title="Remove player"
            >
              Kick
            </button>
          )}
        </li>,
      );
    } else {
      rows.push(
        <li key={`empty-${i}`} className="tg-seat tg-seat-empty">
          <span className="tg-seat-dot" />
          <span className="tg-seat-name">Open seat…</span>
          {isHost && onAddBot && (
            <span className="tg-addbot">
              <span className="tg-addbot-label">Add AI:</span>
              {(['easy', 'medium', 'hard'] as const).map((d) => (
                <button
                  key={d}
                  className="tg-addbot-btn"
                  onClick={() => onAddBot(d)}
                  title={`Add a ${cap(d)} AI player`}
                >
                  {cap(d)}
                </button>
              ))}
            </span>
          )}
        </li>,
      );
    }
  }

  return (
    <div className="tg-screen">
      <div className="tg-brand">
        <h1>Tomsgarden</h1>
        <p>Room {roster.roomId}</p>
      </div>

      <div className="tg-card tg-card-wide">
        <h2>Lobby</h2>
        {error && <div className="tg-error-msg">{error}</div>}

        <ul className="tg-roster">{rows}</ul>

        {isHost && (
          <div className="tg-config-row">
            <span className="tg-label">Players:</span>
            <div className="tg-seat-buttons" style={{ maxWidth: 180 }}>
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  aria-pressed={roster.maxPlayers === n}
                  disabled={n < seated}
                  onClick={() => onConfigure({ maxPlayers: n })}
                  title={n < seated ? 'Too few for seated players' : undefined}
                >
                  {n}
                </button>
              ))}
            </div>
            <span className="tg-label">
              {roster.hasPassword ? '🔒 Password required' : 'Open room'}
            </span>
          </div>
        )}

        <div className="tg-field">
          <label>Invite link</label>
          <div className="tg-link-box">
            <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
            <button className="tg-btn tg-btn-secondary" onClick={doCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="tg-btn-row">
          <button className="tg-btn tg-btn-ghost" onClick={onLeave}>
            Leave
          </button>
          {!isHost && me && (
            <button
              className={`tg-btn tg-btn-block ${me.ready ? 'tg-btn-ghost' : 'tg-btn-primary'}`}
              onClick={() => onSetReady(!me.ready)}
            >
              {me.ready ? 'Unready' : 'Ready up'}
            </button>
          )}
          {isHost && (
            <button
              className="tg-btn tg-btn-primary tg-btn-block"
              disabled={!canStart}
              onClick={onStart}
              title={
                seated < 2
                  ? 'Need at least 2 players'
                  : !everyoneReady
                    ? 'All players must be ready'
                    : undefined
              }
            >
              Start Game
            </button>
          )}
        </div>
        {isHost && !canStart && (
          <p className="tg-hint">
            {seated < 2
              ? 'Waiting for at least one more player to join…'
              : 'Waiting for all players to ready up…'}
          </p>
        )}
      </div>
    </div>
  );
}
