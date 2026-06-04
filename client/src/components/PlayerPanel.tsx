/**
 * One player's full area: name/score header, Garden Plot, Shed, and Floor line
 * (compost). The local active player gets interactive controls; others are
 * shown read-only/compact.
 */
import type React from 'react';
import type { Coord, HeldBed, PlayerState, Tile as TileT } from './boardModel';
import { GardenPlot } from './GardenPlot';
import { Shed } from './Shed';
import { Tile } from './Tile';
import { LABELS } from './theme';
import type { HexSpace } from './hexgrid';
import { PLAYER_COLORS } from './HarvestTrack';

interface PlayerPanelProps {
  player: PlayerState;
  seatIndex: number;
  spaces: HexSpace[];
  isActive: boolean;
  /** This panel belongs to the local/controlling player. */
  isLocal: boolean;
  pendingTile?: TileT | null;
  /** Hand tile ids the player can't currently afford to place (dimmed). */
  unaffordableIds?: Set<string>;
  legalKeys?: Set<string>;
  invalidKey?: string | null;
  onSelectTile?: (tile: TileT) => void;
  onPlace?: (at: Coord) => void;
  onDiscard?: (tile: TileT) => void;
  /** Held flower-bed selection / placement (local player only). */
  pendingBedId?: string | null;
  /** Held bed ids whose printed-tile cost can't currently be paid. */
  unaffordableBedIds?: Set<string>;
  bedCandidates?: Coord[][];
  onSelectBed?: (bed: HeldBed) => void;
  onPlaceBed?: (cells: Coord[]) => void;
}

export function PlayerPanel({
  player,
  seatIndex,
  spaces,
  isActive,
  isLocal,
  pendingTile,
  unaffordableIds,
  legalKeys,
  invalidKey,
  onSelectTile,
  onPlace,
  onDiscard,
  pendingBedId,
  unaffordableBedIds,
  bedCandidates,
  onSelectBed,
  onPlaceBed,
}: PlayerPanelProps): React.ReactElement {
  return (
    <article
      className={`tg-player${isActive ? ' is-active' : ''}${
        isLocal ? ' is-local' : ''
      }`}
    >
      <header className="tg-player-head">
        <span
          className="tg-seat-dot"
          style={{ background: PLAYER_COLORS[seatIndex % 4] }}
        />
        <span className="tg-player-name">
          {player.name}
          {!player.connected && (
            <em className="tg-disconnected" title="Disconnected">
              {' '}
              (offline)
            </em>
          )}
        </span>
        {isActive && <span className="tg-turn-badge">● turn</span>}
        <span className="tg-player-score">{player.score}</span>
      </header>

      <div className="tg-player-body">
        <div className="tg-plot-wrap">
          <GardenPlot
            spaces={spaces}
            placed={player.board}
            legalKeys={isLocal ? legalKeys : undefined}
            invalidKey={isLocal ? invalidKey : null}
            pendingTile={isLocal ? pendingTile : null}
            onPlace={onPlace}
            compact={!isLocal}
            bedCandidates={isLocal ? bedCandidates : undefined}
            onPlaceBed={onPlaceBed}
          />
          <span className="tg-plot-label">{LABELS.gardenPlot}</span>
        </div>

        {isLocal && (
          <div className="tg-player-side">
            <Shed
              tiles={player.hand}
              pendingTileId={pendingTile?.id ?? null}
              unaffordableIds={unaffordableIds}
              interactive={isActive}
              onSelect={onSelectTile}
            />
            <Floor floor={player.floor} onDiscard={onDiscard} />
            <BedShelf
              beds={player.beds}
              pendingBedId={pendingBedId ?? null}
              unaffordableBedIds={unaffordableBedIds}
              interactive={isActive}
              onSelect={onSelectBed}
            />
          </div>
        )}
      </div>
    </article>
  );
}

/** Expansion storage: up to 2 held flower beds; click to select for placement. */
function BedShelf({
  beds,
  pendingBedId,
  unaffordableBedIds,
  interactive,
  onSelect,
}: {
  beds: HeldBed[];
  pendingBedId: string | null;
  unaffordableBedIds?: Set<string>;
  interactive: boolean;
  onSelect?: (bed: HeldBed) => void;
}): React.ReactElement {
  return (
    <div className="tg-bedshelf" title={`${LABELS.flowerBed} storage (max 2)`}>
      <span className="tg-floor-label">{LABELS.flowerBed}s</span>
      <div className="tg-floor-tiles">
        {beds.length === 0 && <span className="tg-empty-note">none</span>}
        {beds.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`tg-btn tg-bed-chip${
              pendingBedId === b.id ? ' is-selected' : ''
            }${unaffordableBedIds?.has(b.id) ? ' is-unaffordable' : ''}`}
            disabled={!interactive || unaffordableBedIds?.has(b.id)}
            title={
              unaffordableBedIds?.has(b.id)
                ? "Can't afford this bed's printed tile cost"
                : undefined
            }
            onClick={() => onSelect?.(b)}
          >
            {b.faceDown ? `▣ ${b.spaces}-space` : `⬡ ${b.spaces}-space`}
            {b.printedTile && <Tile tile={b.printedTile} size={12} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function Floor({
  floor,
  onDiscard,
}: {
  floor: TileT[];
  onDiscard?: (t: TileT) => void;
}): React.ReactElement {
  return (
    <div
      className="tg-floor"
      title={`${LABELS.compostBin} (penalty)`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const id = e.dataTransfer.getData('text/tile-id');
        const t = floor.find((f) => f.id === id);
        if (t) onDiscard?.(t);
      }}
    >
      <span className="tg-floor-label">{LABELS.compostBin}</span>
      <div className="tg-floor-tiles">
        {floor.length === 0 && <span className="tg-empty-note">empty</span>}
        {floor.map((t) => (
          <Tile key={t.id} tile={t} size={14} />
        ))}
      </div>
    </div>
  );
}
