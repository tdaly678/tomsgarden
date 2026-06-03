/**
 * GameBoard — the top-level board component.
 *
 * Driven entirely by a `GameState` prop (mocked or, later, server-supplied).
 * All player intents are surfaced through the `onAction` callback as `Action`
 * objects (DraftTiles / PlaceTile / DiscardToFloor / EndTurn). This component
 * does NO networking — the Integration agent wires `onAction` to PartyKit and
 * feeds fresh `state` back in via props.
 *
 * Local interaction model:
 *   1. Click a color-group in the central display -> emits DraftTiles.
 *   2. Click/drag a tile in your Shed -> selects it (pendingTile); legal target
 *      spaces light up on your Garden Plot.
 *   3. Click/drop on a legal space -> emits PlaceTile; illegal click flashes.
 *   4. Pass / End Turn buttons emit EndTurn.
 */
import { useMemo, useState } from 'react';
import type React from 'react';
import type {
  Action,
  Coord,
  GameState,
  Tile as TileT,
  TileColor,
} from './boardModel';
import { CentralDisplay } from './CentralDisplay';
import { SeasonDial } from './SeasonDial';
import { HarvestTrack } from './HarvestTrack';
import { PlayerPanel } from './PlayerPanel';
import { RoundSummaryOverlay } from './RoundSummaryOverlay';
import { EndGameResults } from './EndGameResults';
import { useScoreDeltas } from './useScoreDeltas';
import { buildDefaultPlot, coordKey } from './hexgrid';
import { legalTargets, placementCost } from './gamelogic';
import { LABELS } from './theme';
import './board.css';

export interface GameBoardProps {
  state: GameState;
  /** The local player's id (whose Shed/Plot is interactive). Defaults to seat 0. */
  localPlayerId?: string;
  /** Emit player intents. Integration agent supplies the real handler. */
  onAction?: (action: Action) => void;
  /** Route back to the lobby / start a new game from the end-game screen. */
  onPlayAgain?: () => void;
}

export function GameBoard({
  state,
  localPlayerId,
  onAction,
  onPlayAgain,
}: GameBoardProps): React.ReactElement {
  // Live scoring signals derived by diffing successive StateUpdate snapshots.
  const { popups, roundSummary, clearRoundSummary, justFinished } =
    useScoreDeltas(state);
  const localId = localPlayerId ?? state.players[0]?.id;
  const localIndex = state.players.findIndex((p) => p.id === localId);
  const localPlayer = state.players[localIndex];
  const isLocalTurn =
    state.activePlayerIndex !== null &&
    state.players[state.activePlayerIndex]?.id === localId;

  // Per-player garden geometry. In v1 every player shares the default plot
  // shape; later this can come from each player's attached flower beds.
  const spaces = useMemo(() => buildDefaultPlot(), []);

  const [pendingTile, setPendingTile] = useState<TileT | null>(null);
  const [invalidKey, setInvalidKey] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<{
    source: string;
    color: TileColor;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const legalKeys = useMemo(() => {
    if (!pendingTile || !localPlayer) return new Set<string>();
    return legalTargets(pendingTile, spaces, localPlayer.board);
  }, [pendingTile, spaces, localPlayer]);

  function flash(msg: string): void {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }

  function handleDraft(source: string, color: TileColor): void {
    if (!isLocalTurn) {
      flash('Not your turn');
      return;
    }
    setSelectedSource({ source, color });
    onAction?.({
      type: 'DraftTiles',
      playerId: localId,
      source,
      color,
    });
    flash(`Acquired ${color} from ${source.toUpperCase()}`);
  }

  function handleSelectTile(tile: TileT): void {
    setPendingTile((cur) => (cur?.id === tile.id ? null : tile));
  }

  function handlePlace(at: Coord): void {
    if (!pendingTile) return;
    if (!legalKeys.has(coordKey(at))) {
      setInvalidKey(coordKey(at));
      window.setTimeout(() => setInvalidKey(null), 500);
      flash('Illegal placement');
      return;
    }
    onAction?.({
      type: 'PlaceTile',
      playerId: localId,
      tileId: pendingTile.id,
      at,
    });
    flash(`Placed (cost ${placementCost(pendingTile)})`);
    setPendingTile(null);
  }

  function handleDiscard(tile: TileT): void {
    onAction?.({ type: 'DiscardToFloor', playerId: localId, tileId: tile.id });
    flash('Discarded to compost');
  }

  function handleEndTurn(): void {
    onAction?.({ type: 'EndTurn', playerId: localId });
    setPendingTile(null);
    setSelectedSource(null);
  }

  const activeName =
    state.activePlayerIndex !== null
      ? state.players[state.activePlayerIndex]?.name
      : '—';

  return (
    <div className="tg-board" data-phase={state.phase}>
      <header className="tg-topbar">
        <h1 className="tg-title">Tomsgarden</h1>
        <div className="tg-status">
          <span className="tg-chip">Round {state.round}/4</span>
          <span className="tg-chip">Phase: {state.phase}</span>
          <span className={`tg-chip${isLocalTurn ? ' is-you' : ''}`}>
            Turn: {activeName}
            {isLocalTurn ? ' (you)' : ''}
          </span>
        </div>
        <div className="tg-scores">
          {state.players.map((p, i) => (
            <span
              key={p.id}
              className={`tg-score-pill${
                i === state.activePlayerIndex ? ' is-active' : ''
              }`}
            >
              {p.name}: <b>{p.score}</b>
            </span>
          ))}
        </div>
      </header>

      <div className="tg-main">
        <aside className="tg-left">
          <SeasonDial round={state.round} />
          <HarvestTrack players={state.players} popups={popups} />
        </aside>

        <div className="tg-center-col">
          <CentralDisplay
            factories={state.factories}
            center={state.center}
            bagCount={state.bagCount}
            canDraft={isLocalTurn}
            selectedSource={selectedSource}
            onDraft={handleDraft}
          />

          {localPlayer && (
            <PlayerPanel
              player={localPlayer}
              seatIndex={localIndex}
              spaces={spaces}
              isActive={isLocalTurn}
              isLocal
              pendingTile={pendingTile}
              legalKeys={legalKeys}
              invalidKey={invalidKey}
              onSelectTile={handleSelectTile}
              onPlace={handlePlace}
              onDiscard={handleDiscard}
            />
          )}

          <div className="tg-actions-bar">
            <button
              type="button"
              className="tg-btn"
              disabled={!isLocalTurn}
              onClick={handleEndTurn}
            >
              Pass / End Turn ({LABELS.headGardener})
            </button>
            {pendingTile && (
              <span className="tg-hint">
                Placing selected {LABELS.plantTile} — click a glowing space, or
                drop it on the {LABELS.compostBin}.
              </span>
            )}
          </div>
        </div>

        <aside className="tg-right">
          <div className="tg-opponents-head">Other Gardeners</div>
          {state.players
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => p.id !== localId)
            .map(({ p, i }) => (
              <PlayerPanel
                key={p.id}
                player={p}
                seatIndex={i}
                spaces={spaces}
                isActive={i === state.activePlayerIndex}
                isLocal={false}
              />
            ))}
        </aside>
      </div>

      {toast && <div className="tg-toast">{toast}</div>}

      {/* Round-end scoring moment — only while play continues. */}
      {roundSummary && state.phase !== 'finished' && (
        <RoundSummaryOverlay
          summary={roundSummary}
          onDismiss={clearRoundSummary}
        />
      )}

      {/* End-game results — shown when finished (also on reconnect into a
          finished game). justFinished latches the first transition for the
          win cue, handled inside useScoreDeltas. */}
      {(state.phase === 'finished' || justFinished) && (
        <EndGameResults state={state} onPlayAgain={onPlayAgain} />
      )}
    </div>
  );
}
