import { useState } from 'react';
import type React from 'react';
import { makeRoomId, makeShareUrl, parseRoomInput, copyToClipboard } from './links';

/** Details handed back when the user commits to creating or joining a room. */
export interface EnterRoomIntent {
  roomId: string;
  name: string;
  /** Password to set (create) or supply (join). */
  password?: string;
  /** Create-only host config. */
  asHost: boolean;
  maxPlayers?: number;
}

export interface HomeScreenProps {
  /** PartyKit host carried into share links (so guests reach the same server). */
  host?: string;
  /** Suggested display name (from a prior session). */
  defaultName?: string;
  onEnter: (intent: EnterRoomIntent) => void;
}

type Mode = 'home' | 'create' | 'join';

/**
 * HOME screen: pick "Create Game" (become host) or "Join Game" (paste a link /
 * enter a room code). Create lets the host optionally set a password and choose
 * a 2-4 player count, then shows a copy-to-clipboard share link.
 */
export function HomeScreen({ host, defaultName, onEnter }: HomeScreenProps): React.ReactElement {
  const [mode, setMode] = useState<Mode>('home');
  const [name, setName] = useState(defaultName ?? '');
  const [password, setPassword] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [roomInput, setRoomInput] = useState('');
  const [createdRoom, setCreatedRoom] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const trimmedName = name.trim();

  // Lazily generate (and keep stable) a room id when entering create mode.
  const enterCreate = (): void => {
    setCreatedRoom((r) => r ?? makeRoomId());
    setMode('create');
    setErr(null);
  };

  const shareUrl = createdRoom ? makeShareUrl(createdRoom, host) : '';

  const doCopy = async (): Promise<void> => {
    const ok = await copyToClipboard(shareUrl);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  };

  const submitCreate = (): void => {
    if (!trimmedName) {
      setErr('Enter a display name.');
      return;
    }
    if (!createdRoom) return;
    onEnter({
      roomId: createdRoom,
      name: trimmedName,
      password: password.trim() || undefined,
      asHost: true,
      maxPlayers,
    });
  };

  const submitJoin = (): void => {
    if (!trimmedName) {
      setErr('Enter a display name.');
      return;
    }
    const roomId = parseRoomInput(roomInput);
    if (!roomId) {
      setErr('Enter a room code or paste a game link.');
      return;
    }
    onEnter({
      roomId,
      name: trimmedName,
      password: password.trim() || undefined,
      asHost: false,
    });
  };

  return (
    <div className="tg-screen">
      <div className="tg-brand">
        <h1>Tomsgarden</h1>
        <p>Plant, place, and out-bloom your rivals.</p>
      </div>

      {mode === 'home' && (
        <div className="tg-card">
          <h2>Welcome, gardener</h2>
          <div className="tg-field">
            <label htmlFor="tg-name">Display name</label>
            <input
              id="tg-name"
              value={name}
              maxLength={24}
              placeholder="e.g. Tom"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="tg-home-actions">
            <button className="tg-btn tg-btn-primary tg-btn-block" onClick={enterCreate}>
              Create Game
            </button>
            <div className="tg-divider">
              <span>or</span>
            </div>
            <button
              className="tg-btn tg-btn-ghost tg-btn-block"
              onClick={() => {
                setMode('join');
                setErr(null);
              }}
            >
              Join Game
            </button>
          </div>
        </div>
      )}

      {mode === 'create' && (
        <div className="tg-card">
          <h2>Create a game</h2>
          {err && <div className="tg-error-msg">{err}</div>}
          <div className="tg-field">
            <label htmlFor="tg-name-c">Display name</label>
            <input
              id="tg-name-c"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="tg-field">
            <label>Players</label>
            <div className="tg-seat-buttons">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  aria-pressed={maxPlayers === n}
                  onClick={() => setMaxPlayers(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="tg-field">
            <label htmlFor="tg-pw-c">Password (optional)</label>
            <input
              id="tg-pw-c"
              type="text"
              value={password}
              placeholder="Leave blank for an open room"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="tg-field">
            <label>Share link</label>
            <div className="tg-link-box">
              <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
              <button className="tg-btn tg-btn-secondary" onClick={doCopy}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="tg-hint">
              Room code: <strong>{createdRoom}</strong>. Share the link or the code; the
              room opens when you continue.
            </p>
          </div>

          <div className="tg-btn-row">
            <button className="tg-btn tg-btn-ghost" onClick={() => setMode('home')}>
              Back
            </button>
            <button
              className="tg-btn tg-btn-primary tg-btn-block"
              onClick={submitCreate}
              disabled={!trimmedName}
            >
              Open Lobby
            </button>
          </div>
        </div>
      )}

      {mode === 'join' && (
        <div className="tg-card">
          <h2>Join a game</h2>
          {err && <div className="tg-error-msg">{err}</div>}
          <div className="tg-field">
            <label htmlFor="tg-name-j">Display name</label>
            <input
              id="tg-name-j"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="tg-field">
            <label htmlFor="tg-room-j">Room code or link</label>
            <input
              id="tg-room-j"
              value={roomInput}
              placeholder="ABC123 or paste a link"
              onChange={(e) => setRoomInput(e.target.value)}
            />
          </div>
          <div className="tg-field">
            <label htmlFor="tg-pw-j">Password (if required)</label>
            <input
              id="tg-pw-j"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="tg-btn-row">
            <button className="tg-btn tg-btn-ghost" onClick={() => setMode('home')}>
              Back
            </button>
            <button
              className="tg-btn tg-btn-primary tg-btn-block"
              onClick={submitJoin}
              disabled={!trimmedName || !roomInput.trim()}
            >
              Join
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
