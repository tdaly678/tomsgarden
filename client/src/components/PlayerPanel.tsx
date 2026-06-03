/**
 * One player's full area: name/score header, Garden Plot, Shed, and Floor line
 * (compost). The local active player gets interactive controls; others are
 * shown read-only/compact.
 */
import type React from 'react';
import type { Coord, PlayerState, Tile as TileT } from './boardModel';
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
  legalKeys?: Set<string>;
  invalidKey?: string | null;
  onSelectTile?: (tile: TileT) => void;
  onPlace?: (at: Coord) => void;
  onDiscard?: (tile: TileT) => void;
}

export function PlayerPanel({
  player,
  seatIndex,
  spaces,
  isActive,
  isLocal,
  pendingTile,
  legalKeys,
  invalidKey,
  onSelectTile,
  onPlace,
  onDiscard,
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
          />
          <span className="tg-plot-label">{LABELS.gardenPlot}</span>
        </div>

        {isLocal && (
          <div className="tg-player-side">
            <Shed
              tiles={player.hand}
              pendingTileId={pendingTile?.id ?? null}
              interactive={isActive}
              onSelect={onSelectTile}
            />
            <Floor floor={player.floor} onDiscard={onDiscard} />
          </div>
        )}
      </div>
    </article>
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
