/**
 * Realtime client: connects the React board to a PartyKit room over WebSocket
 * (via `partysocket`, which adds reconnection/backoff over the native socket).
 *
 * Responsibilities:
 *   - Open a socket to a room and send `Join` (name, optional password/token).
 *   - Receive `JoinAck` / `StateUpdate` / `Error` / `Kicked` and surface them.
 *   - Send player `ActionMsg`s carrying the canonical engine Action shape.
 *
 * It deals ONLY in canonical `@tomsgarden/shared` types; translation to/from the
 * board view model happens in `../components/engineAdapter.ts`.
 */

import PartySocket from 'partysocket';
import type {
  Action,
  ClientMessage,
  GameState,
  RosterMessage,
  ServerMessage,
} from '@tomsgarden/shared';

export interface RealtimeHandlers {
  onState?: (state: GameState) => void;
  onJoinAck?: (info: {
    playerId: string;
    roomId: string;
    token: string;
    isHost: boolean;
    seat: number;
    state: GameState;
  }) => void;
  /** Lobby roster update (presence / ready / host / config). */
  onRoster?: (roster: RosterMessage) => void;
  onError?: (code: string, message: string) => void;
  onKicked?: (reason: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface RealtimeOptions {
  /** PartyKit host, e.g. "localhost:1999" in dev or "<project>.<user>.partykit.dev". */
  host: string;
  /** Room id to join. */
  room: string;
  /** Display name to join with. */
  name: string;
  /** Optional room password. */
  password?: string;
  /** Optional reconnect token (persist in localStorage and resend). */
  token?: string;
  /** If true, assert host intent (first joiner becomes host regardless). */
  asHost?: boolean;
  /** Host-only: password to set on the room at creation. */
  setPassword?: string;
  /** Host-only: desired seat count (2-4) at creation. */
  maxPlayers?: number;
  handlers?: RealtimeHandlers;
}

export class RealtimeClient {
  private socket: PartySocket;
  private handlers: RealtimeHandlers;
  private opts: RealtimeOptions;
  /** Local player id, set once JoinAck arrives. */
  playerId: string | null = null;
  token: string | null = null;

  constructor(opts: RealtimeOptions) {
    this.opts = opts;
    this.handlers = opts.handlers ?? {};
    this.socket = new PartySocket({ host: opts.host, room: opts.room });

    this.socket.addEventListener('open', () => {
      this.sendJoin();
      this.handlers.onOpen?.();
    });
    this.socket.addEventListener('close', () => this.handlers.onClose?.());
    this.socket.addEventListener('message', (ev: MessageEvent<string>) =>
      this.handleMessage(ev.data),
    );
  }

  private sendJoin(): void {
    this.send({
      type: 'Join',
      playerName: this.opts.name,
      password: this.opts.password,
      token: this.token ?? this.opts.token,
      asHost: this.opts.asHost,
      setPassword: this.opts.setPassword,
      maxPlayers: this.opts.maxPlayers,
    });
  }

  private handleMessage(raw: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case 'JoinAck':
        this.playerId = msg.playerId;
        this.token = msg.token;
        this.handlers.onJoinAck?.(msg);
        this.handlers.onState?.(msg.state);
        return;
      case 'StateUpdate':
        this.handlers.onState?.(msg.state);
        return;
      case 'Roster':
        this.handlers.onRoster?.(msg);
        return;
      case 'Error':
        this.handlers.onError?.(msg.code, msg.message);
        return;
      case 'Kicked':
        this.handlers.onKicked?.(msg.reason);
        return;
      default:
        return;
    }
  }

  /** Submit a canonical engine action. */
  sendAction(action: Action): void {
    this.send({ type: 'ActionMsg', action });
  }

  /** Toggle this player's ready flag in the lobby. */
  setReady(ready: boolean): void {
    this.send({ type: 'SetReady', ready });
  }

  /** Host-only: change seat count and/or password. */
  configureRoom(config: { maxPlayers?: number; password?: string }): void {
    this.send({ type: 'ConfigureRoom', ...config });
  }

  /** Host-only: request the game to start. */
  startGame(): void {
    this.send({ type: 'StartGame' });
  }

  /** Host-only: kick a seated player from the lobby. */
  kickPlayer(playerId: string): void {
    this.send({ type: 'KickPlayer', playerId });
  }

  private send(msg: ClientMessage): void {
    this.socket.send(JSON.stringify(msg));
  }

  close(): void {
    this.socket.close();
  }
}
