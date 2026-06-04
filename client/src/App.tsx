import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type {
  GameState as EngineGameState,
  RosterMessage,
} from '@tomsgarden/shared';
import { GameBoard } from './components/GameBoard';
import { MOCK_STATE } from './components/mockState';
import type { Action as BoardAction, GameState as BoardGameState } from './components/boardModel';
import { toBoardState, toEngineAction } from './components/engineAdapter';
import { RealtimeClient } from './net/realtimeClient';
import { HomeScreen } from './lobby/HomeScreen';
import type { EnterRoomIntent } from './lobby/HomeScreen';
import { LobbyScreen } from './lobby/LobbyScreen';
import './design/design-tokens.css';
import './lobby/lobby.css';

/**
 * Tomsgarden client root + router.
 *
 * Routes between three screens based on connection + game phase:
 *   HOME  — create or join a game (no live connection yet).
 *   LOBBY — connected, game not yet started; shows roster + ready/host controls.
 *   GAME  — connected, game in progress; renders <GameBoard>.
 *
 * Plus an OFFLINE dev board (?dev=1 or ?offline=1) that renders the local
 * MOCK_STATE fixture with no networking, so the board UI runs standalone.
 *
 * Connection params come from the URL so a share link routes straight in:
 *   <base>/?room=<id>&host=<partykit-host>
 * Opening such a link lands on HOME pre-filled with the room (prompting for a
 * display name + password), then connects. The reconnection token is persisted
 * per-room in localStorage so rejoining the same link restores the seat.
 */

type Phase =
  | { kind: 'home' }
  | { kind: 'connecting' }
  | { kind: 'lobby' }
  | { kind: 'game' };

const NAME_KEY = 'tg-name';
const tokenKey = (room: string): string => `tg-token-${room}`;

export function App(): React.ReactElement {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const dev = params.get('dev') === '1' || params.get('offline') === '1';
  const partyHost =
    params.get('host') ?? (import.meta.env.VITE_PARTYKIT_HOST ?? 'localhost:1999');
  const urlRoom = params.get('room') ?? undefined;

  // OFFLINE dev board (kept reachable for standalone UI work).
  if (dev) {
    return <DevBoard />;
  }

  return <LiveApp partyHost={partyHost} initialRoom={urlRoom} />;
}

/** Offline mock board — no networking, renders the MOCK_STATE fixture. */
function DevBoard(): React.ReactElement {
  return (
    <GameBoard
      state={MOCK_STATE}
      localPlayerId="p0"
      onAction={(a) => {
        // eslint-disable-next-line no-console
        console.log('[Tomsgarden dev action]', a);
      }}
    />
  );
}

interface LiveAppProps {
  partyHost: string;
  initialRoom?: string;
}

function LiveApp({ partyHost, initialRoom }: LiveAppProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>({ kind: 'home' });
  const [roster, setRoster] = useState<RosterMessage | null>(null);
  const [boardState, setBoardState] = useState<BoardGameState | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);

  const clientRef = useRef<RealtimeClient | null>(null);

  const teardown = useCallback(() => {
    clientRef.current?.close();
    clientRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const connect = useCallback(
    (intent: EnterRoomIntent) => {
      setError(null);
      teardown();
      setActiveRoom(intent.roomId);
      window.localStorage.setItem(NAME_KEY, intent.name);
      setPhase({ kind: 'connecting' });

      const client = new RealtimeClient({
        host: partyHost,
        room: intent.roomId,
        name: intent.name,
        password: intent.password,
        token: window.localStorage.getItem(tokenKey(intent.roomId)) ?? undefined,
        asHost: intent.asHost,
        setPassword: intent.asHost ? intent.password : undefined,
        maxPlayers: intent.asHost ? intent.maxPlayers : undefined,
        handlers: {
          onJoinAck: (info) => {
            setLocalPlayerId(info.playerId);
            setIsHost(info.isHost);
            window.localStorage.setItem(tokenKey(intent.roomId), info.token);
          },
          onRoster: (r) => {
            setRoster(r);
            // Route on the authoritative started flag.
            setPhase((p) =>
              r.started
                ? { kind: 'game' }
                : p.kind === 'game'
                  ? p
                  : { kind: 'lobby' },
            );
          },
          onState: (state: EngineGameState) => {
            setBoardState(toBoardState(state));
            if (state.phase !== 'lobby') setPhase({ kind: 'game' });
          },
          onError: (code, message) => {
            setError(message);
            // Fatal join-time errors bounce back to home so the user can retry.
            if (code === 'BAD_PASSWORD' || code === 'ROOM_FULL' || code === 'GAME_IN_PROGRESS') {
              teardown();
              setPhase({ kind: 'home' });
            }
          },
          onKicked: (reason) => {
            setError(`Removed: ${reason}`);
            window.localStorage.removeItem(tokenKey(intent.roomId));
            teardown();
            setPhase({ kind: 'home' });
          },
        },
      });
      clientRef.current = client;
    },
    [partyHost, teardown],
  );

  const leave = useCallback(() => {
    if (activeRoom) window.localStorage.removeItem(tokenKey(activeRoom));
    teardown();
    setRoster(null);
    setBoardState(null);
    setLocalPlayerId(null);
    setIsHost(false);
    setError(null);
    setPhase({ kind: 'home' });
  }, [activeRoom, teardown]);

  const handleBoardAction = useCallback((action: BoardAction) => {
    const engineAction = toEngineAction(action);
    if (engineAction) clientRef.current?.sendAction(engineAction);
  }, []);

  // HOME
  if (phase.kind === 'home') {
    return (
      <>
        {error && <HomeError message={error} />}
        <HomeScreen
          host={partyHost}
          defaultName={window.localStorage.getItem(NAME_KEY) ?? undefined}
          onEnter={connect}
        />
        {initialRoom && !error && (
          <div className="tg-connecting" style={{ textAlign: 'center', padding: '0 0 1rem' }}>
            Joining room <strong>{initialRoom}</strong> — enter your name above.
          </div>
        )}
      </>
    );
  }

  // CONNECTING
  if (phase.kind === 'connecting') {
    return (
      <div className="tg-screen">
        <div className="tg-card" style={{ textAlign: 'center' }}>
          {error ? `Connection error: ${error}` : 'Connecting to room…'}
        </div>
      </div>
    );
  }

  // LOBBY
  if (phase.kind === 'lobby') {
    if (!roster) {
      return (
        <div className="tg-screen">
          <div className="tg-card" style={{ textAlign: 'center' }}>Loading lobby…</div>
        </div>
      );
    }
    return (
      <LobbyScreen
        roster={roster}
        localPlayerId={localPlayerId}
        isHost={isHost}
        partyHost={partyHost}
        error={error}
        onSetReady={(ready) => clientRef.current?.setReady(ready)}
        onConfigure={(cfg) => clientRef.current?.configureRoom(cfg)}
        onKick={(pid) => clientRef.current?.kickPlayer(pid)}
        onAddBot={(d) => clientRef.current?.addBot(d)}
        onRemoveBot={(pid) => clientRef.current?.removeBot(pid)}
        onStart={() => clientRef.current?.startGame()}
        onLeave={leave}
      />
    );
  }

  // GAME
  if (!boardState) {
    return (
      <div className="tg-screen">
        <div className="tg-card" style={{ textAlign: 'center' }}>Starting game…</div>
      </div>
    );
  }
  return (
    <>
      {error && <div className="tg-error-banner">{error}</div>}
      <GameBoard
        state={boardState}
        localPlayerId={localPlayerId ?? undefined}
        onAction={handleBoardAction}
      />
    </>
  );
}

function HomeError({ message }: { message: string }): React.ReactElement {
  return (
    <div
      className="tg-error-banner"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2000,
        background: 'var(--tg-status-invalid)',
        color: '#fff',
        padding: '0.5rem 1rem',
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  );
}
