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
 *   1. Click a tile in the central display, then choose "all <color>" or
 *      "all <pattern>" in the chooser -> emits DraftTiles with that selector.
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
  HeldBed,
  PlayerState,
  Tile as TileT,
} from './boardModel';
import type { DraftSelector, DraftCopyChoice } from './boardModel';
import { CentralDisplay } from './CentralDisplay';
import { SeasonDial } from './SeasonDial';
import { HarvestTrack } from './HarvestTrack';
import { PlayerPanel } from './PlayerPanel';
import { RoundSummaryOverlay } from './RoundSummaryOverlay';
import { EndGameResults } from './EndGameResults';
import { useScoreDeltas } from './useScoreDeltas';
import {
  bedAttachCandidates,
  buildDefaultPlot,
  coordKey,
  neighbors,
  type HexSpace,
} from './hexgrid';
import {
  acquirePreview,
  canAffordBed,
  canAffordTile,
  isValidPayment,
  legalTargets,
  patternOf,
  placementCost,
  suggestPayment,
} from './gamelogic';
import { PaymentPicker, type PendingPayment } from './PaymentPicker';
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

  // Per-player garden geometry comes from the engine state (the garden GROWS
  // as flower beds attach). Mock/legacy states without `spaces` fall back to
  // the static default plot.
  const fallbackPlot = useMemo(() => buildDefaultPlot(), []);
  const spacesFor = (p: PlayerState | undefined): HexSpace[] =>
    p?.spaces && p.spaces.length > 0
      ? (p.spaces as unknown as HexSpace[])
      : fallbackPlot;
  const spaces = spacesFor(localPlayer);

  const [pendingTile, setPendingTile] = useState<TileT | null>(null);
  const [pendingBed, setPendingBed] = useState<HeldBed | null>(null);
  // Open payment picker (cost > 1 placements awaiting the player's choice).
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(
    null,
  );
  const [invalidKey, setInvalidKey] = useState<string | null>(null);
  // Pending acquire selection (two-step: select grouping, then confirm Take).
  const [pendingDraft, setPendingDraft] = useState<DraftSelector | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Mirror engine affordability: ids of hand tiles the player CANNOT place
  // (insufficient matching tiles/wildseeds for the cost). Shown dimmed.
  const unaffordableIds = useMemo(() => {
    const out = new Set<string>();
    if (!localPlayer) return out;
    for (const t of localPlayer.hand) {
      if (t.wildcard || !canAffordTile(t, localPlayer.hand)) out.add(t.id);
    }
    return out;
  }, [localPlayer]);

  const unaffordableBedIds = useMemo(() => {
    const out = new Set<string>();
    if (!localPlayer) return out;
    for (const b of localPlayer.beds) {
      if (
        !b.faceDown &&
        b.printedTile &&
        !canAffordBed(b.printedTile, localPlayer.hand)
      )
        out.add(b.id);
    }
    return out;
  }, [localPlayer]);

  const legalKeys = useMemo(() => {
    if (!pendingTile || !localPlayer) return new Set<string>();
    return legalTargets(pendingTile, spaces, localPlayer.board);
  }, [pendingTile, spaces, localPlayer]);

  // 'buy' = previewing a 7-space supply-bed purchase.
  const [buyingBed, setBuyingBed] = useState(false);
  const bedCandidates = useMemo(() => {
    if (buyingBed) return bedAttachCandidates(spaces, 7);
    if (pendingBed) return bedAttachCandidates(spaces, pendingBed.spaces);
    return undefined;
  }, [pendingBed, buyingBed, spaces]);

  function flash(msg: string): void {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }

  /** Step 1 — set (or clear) the persistent acquire selection. */
  function handleDraftSelect(select: DraftSelector | null): void {
    if (select && !isLocalTurn) {
      flash('Not your turn');
      return;
    }
    setPendingDraft(select);
  }

  /**
   * Step 2 — confirm: only now is the draft action emitted. `choices` carries
   * the player's chosen physical copy for any duplicate group (defaults to the
   * canonical pick inside CentralDisplay).
   */
  function handleDraftConfirm(choices?: readonly DraftCopyChoice[]): void {
    if (!pendingDraft) return;
    if (!isLocalTurn) {
      flash('Not your turn');
      return;
    }
    const select = pendingDraft;
    setPendingDraft(null);
    onAction?.({
      type: 'DraftTiles',
      playerId: localId,
      source: 'display',
      select,
      ...(choices && choices.length > 0 ? { choices } : {}),
    });
    const what =
      select.by === 'color' ? `all ${select.color}` : `all ${select.pattern}`;
    flash(`Acquired ${what} from the display`);
  }

  function handleSelectTile(tile: TileT): void {
    setPendingPayment(null);
    if (tile.wildcard) {
      flash(`${LABELS.wildseed}s can't be planted — they pay costs`);
      return;
    }
    if (localPlayer && !canAffordTile(tile, localPlayer.hand)) {
      flash(
        `Can't afford to place that (cost ${placementCost(tile)}) — ` +
          'need matching tiles or wildseeds',
      );
      return;
    }
    setPendingTile((cur) => (cur?.id === tile.id ? null : tile));
  }

  function handlePlace(at: Coord): void {
    if (!pendingTile || !localPlayer) return;
    if (!legalKeys.has(coordKey(at))) {
      setInvalidKey(coordKey(at));
      window.setTimeout(() => setInvalidKey(null), 500);
      flash('Illegal placement');
      return;
    }
    const cost = placementCost(pendingTile);
    const pool = localPlayer.hand.filter((t) => t.id !== pendingTile.id);
    const suggested = suggestPayment(pendingTile, pool, cost - 1);
    if (suggested === null) {
      flash("You can't afford that placement");
      return;
    }
    if (cost <= 1) {
      // Cost 1: the placed tile pays for itself — no picker needed.
      onAction?.({
        type: 'PlaceTile',
        playerId: localId,
        tileId: pendingTile.id,
        at,
        payment: [],
      });
      flash('Placed (cost 1)');
      setPendingTile(null);
      return;
    }
    // Cost > 1: open the payment picker with the suggested selection.
    setPendingPayment({
      mode: 'tile',
      anchor: pendingTile,
      pool,
      needed: cost - 1,
      cost,
      selectedIds: new Set(suggested.map((t) => t.id)),
      at,
    });
  }

  /** Toggle a storage item in/out of the open payment selection. */
  function handleTogglePayment(tile: TileT): void {
    setPendingPayment((pp) => {
      if (!pp) return pp;
      const selectedIds = new Set(pp.selectedIds);
      if (selectedIds.has(tile.id)) selectedIds.delete(tile.id);
      else selectedIds.add(tile.id);
      return { ...pp, selectedIds };
    });
  }

  function handleConfirmPayment(): void {
    if (!pendingPayment) return;
    const pp = pendingPayment;
    const selection = pp.pool.filter((t) => pp.selectedIds.has(t.id));
    if (!isValidPayment(pp.anchor, selection, pp.needed)) return;
    const payment = selection.map((t) => t.id);
    if (pp.mode === 'tile') {
      onAction?.({
        type: 'PlaceTile',
        playerId: localId,
        tileId: pp.anchor.id,
        at: pp.at!,
        payment,
      });
      flash(`Placed (cost ${pp.cost})`);
      setPendingTile(null);
    } else {
      onAction?.({
        type: 'PlaceBed',
        playerId: localId,
        bedId: pp.bedId!,
        cells: pp.cells!,
        featureAt: pp.featureAt,
        printedAt: pp.printedAt,
        payment,
      });
      flash(`Placed ${LABELS.flowerBed.toLowerCase()} (cost ${pp.cost})`);
      setPendingBed(null);
    }
    setPendingPayment(null);
  }

  function handleCancelPayment(): void {
    setPendingPayment(null);
  }

  function handleAcquireBed(bedId: string, printedTileId: string): void {
    if (!isLocalTurn) {
      flash('Not your turn');
      return;
    }
    onAction?.({ type: 'AcquireBed', playerId: localId, bedId, printedTileId });
    flash(`Acquired ${LABELS.flowerBed.toLowerCase()}`);
  }

  function handleSelectBed(bed: HeldBed): void {
    setPendingTile(null);
    setBuyingBed(false);
    setPendingPayment(null);
    if (
      !bed.faceDown &&
      bed.printedTile &&
      localPlayer &&
      !canAffordBed(bed.printedTile, localPlayer.hand)
    ) {
      flash(
        `Can't afford that ${LABELS.flowerBed.toLowerCase()} ` +
          `(cost ${placementCost(bed.printedTile)})`,
      );
      return;
    }
    setPendingBed((cur) => (cur?.id === bed.id ? null : bed));
  }

  function handlePlaceBed(cells: Coord[]): void {
    if (buyingBed) {
      onAction?.({ type: 'BuyBed', playerId: localId, cells });
      flash(`Bought a ${LABELS.flowerBed.toLowerCase()} (-6 pts)`);
      setBuyingBed(false);
      return;
    }
    if (!pendingBed || !localPlayer) return;
    const faceUp = !pendingBed.faceDown;
    if (!faceUp || !pendingBed.printedTile) {
      onAction?.({
        type: 'PlaceBed',
        playerId: localId,
        bedId: pendingBed.id,
        cells,
        payment: [],
      });
      flash(`Placed ${LABELS.flowerBed.toLowerCase()}`);
      setPendingBed(null);
      return;
    }
    // Face-up bed: pavilion sits at the first cell; the printed hexagon goes
    // on the first OTHER cell where tile adjacency vs the existing garden is
    // legal (no identical neighbor; share pattern/color with any neighbor).
    const printed = pendingBed.printedTile;
    const printedPat = patternOf(printed);
    const occupied = new Map(
      localPlayer.board.map((p) => [coordKey(p.at), p.tile]),
    );
    const printedAt = cells.find((c, i) => {
      if (i === 0) return false;
      const adj = neighbors(c)
        .map((n) => occupied.get(coordKey(n)))
        .filter((t): t is TileT => !!t);
      if (
        adj.some((t) => t.color === printed.color && patternOf(t) === printedPat)
      )
        return false;
      return (
        adj.length === 0 ||
        adj.some((t) => t.color === printed.color || patternOf(t) === printedPat)
      );
    });
    if (!printedAt) {
      flash('No legal spot for the printed tile on that attachment');
      return;
    }
    const cost = placementCost(printed);
    const pool = localPlayer.hand;
    const suggested = suggestPayment(printed, pool, cost - 1);
    if (suggested === null) {
      flash("You can't afford that placement");
      return;
    }
    if (cost <= 1) {
      onAction?.({
        type: 'PlaceBed',
        playerId: localId,
        bedId: pendingBed.id,
        cells,
        featureAt: cells[0],
        printedAt,
        payment: [],
      });
      flash(`Placed ${LABELS.flowerBed.toLowerCase()} (cost 1)`);
      setPendingBed(null);
      return;
    }
    setPendingPayment({
      mode: 'bed',
      anchor: printed,
      pool,
      needed: cost - 1,
      cost,
      selectedIds: new Set(suggested.map((t) => t.id)),
      bedId: pendingBed.id,
      cells,
      featureAt: cells[0],
      printedAt,
    });
  }

  function handleBuyBed(): void {
    if (!isLocalTurn) {
      flash('Not your turn');
      return;
    }
    setPendingTile(null);
    setPendingBed(null);
    setBuyingBed((b) => !b);
  }

  function handleDiscard(tile: TileT): void {
    onAction?.({ type: 'DiscardToFloor', playerId: localId, tileId: tile.id });
    flash('Discarded to compost');
  }

  function handleEndTurn(): void {
    onAction?.({ type: 'EndTurn', playerId: localId });
    setPendingTile(null);
    setPendingBed(null);
    setPendingPayment(null);
    setBuyingBed(false);
    setPendingDraft(null);
  }

  // Face-up beds included in the pending acquire selection (highlighted).
  const pendingBedIds = useMemo(() => {
    if (!pendingDraft) return new Set<string>();
    return acquirePreview(
      state.center,
      state.factories,
      state.displayBeds,
      pendingDraft,
    ).bedIds;
  }, [pendingDraft, state.center, state.factories, state.displayBeds]);

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
            displayBeds={state.displayBeds}
            bagCount={state.bagCount}
            canDraft={isLocalTurn}
            pendingSelect={pendingDraft}
            onSelect={handleDraftSelect}
            onConfirm={handleDraftConfirm}
          />

          {/* Flower-bed display: face-up beds are draftable; face-down beds
              are still covered by tiles in the round stack. */}
          <div className="tg-bed-display">
            {state.displayBeds.map((b) =>
              b.faceUp && b.printedTile ? (
                <button
                  key={b.id}
                  type="button"
                  className={`tg-btn tg-bed-chip${
                    pendingBedIds.has(b.id) ? ' is-taken' : ''
                  }`}
                  disabled={!isLocalTurn}
                  onClick={() => handleAcquireBed(b.id, b.printedTile!.id)}
                  title={
                    pendingBedIds.has(b.id)
                      ? `Included in your selection — will be acquired on Take`
                      : `Acquire this ${b.spaces}-space ${LABELS.flowerBed.toLowerCase()}`
                  }
                >
                  ⬡ {b.spaces}-space {LABELS.flowerBed}
                </button>
              ) : (
                <span key={b.id} className="tg-chip" title="Face down (covered)">
                  ▣ {LABELS.flowerBed} (covered)
                </span>
              ),
            )}
            <button
              type="button"
              className={`tg-btn${buyingBed ? ' is-selected' : ''}`}
              disabled={
                !isLocalTurn ||
                state.supplyCount <= 0 ||
                (localPlayer?.score ?? 0) < 6
              }
              onClick={handleBuyBed}
              title="Spend 6 points for a blank 7-space bed from the supply"
            >
              Buy {LABELS.flowerBed} (−6 pts, {state.supplyCount} left)
            </button>
          </div>

          {localPlayer && (
            <PlayerPanel
              player={localPlayer}
              seatIndex={localIndex}
              spaces={spaces}
              isActive={isLocalTurn}
              isLocal
              pendingTile={pendingTile}
              unaffordableIds={unaffordableIds}
              legalKeys={legalKeys}
              invalidKey={invalidKey}
              onSelectTile={handleSelectTile}
              onPlace={handlePlace}
              onDiscard={handleDiscard}
              pendingBedId={pendingBed?.id ?? null}
              unaffordableBedIds={unaffordableBedIds}
              bedCandidates={bedCandidates}
              onSelectBed={handleSelectBed}
              onPlaceBed={handlePlaceBed}
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
                spaces={spacesFor(p)}
                isActive={i === state.activePlayerIndex}
                isLocal={false}
              />
            ))}
        </aside>
      </div>

      {pendingPayment && (
        <PaymentPicker
          pending={pendingPayment}
          onToggle={handleTogglePayment}
          onConfirm={handleConfirmPayment}
          onCancel={handleCancelPayment}
        />
      )}

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
