/**
 * The Shed — a player's storage: 12 plant-tile spaces + 2 flower-bed spaces,
 * plus the Wildseed count. Tiles here are selectable to begin a placement.
 */
import type React from 'react';
import type { Tile as TileT } from './boardModel';
import { Tile } from './Tile';
import { LABELS } from './theme';

interface ShedProps {
  /** Plant tiles currently held (the engine `hand`). */
  tiles: TileT[];
  /** Wildseeds (wildcard tiles) within the held tiles are counted here too. */
  pendingTileId?: string | null;
  interactive?: boolean;
  onSelect?: (tile: TileT) => void;
}

const TILE_SLOTS = 12;
const BED_SLOTS = 2;

export function Shed({
  tiles,
  pendingTileId,
  interactive,
  onSelect,
}: ShedProps): React.ReactElement {
  const wildseeds = tiles.filter((t) => t.wildcard).length;

  return (
    <section className="tg-shed" aria-label={`${LABELS.shed} (storage)`}>
      <header className="tg-shed-head">
        <span>{LABELS.shed}</span>
        <span className="tg-wildseed-count" title="Wildseeds (wild)">
          ✶ {LABELS.wildseed}: {wildseeds}
        </span>
      </header>

      <div className="tg-shed-slots">
        {Array.from({ length: TILE_SLOTS }).map((_, i) => {
          const t = tiles[i];
          return (
            <div className="tg-slot" key={i}>
              {t ? (
                <Tile
                  tile={t}
                  size={16}
                  selected={pendingTileId === t.id}
                  onClick={interactive ? () => onSelect?.(t) : undefined}
                  draggable={interactive}
                  onDragStart={(e) =>
                    e.dataTransfer.setData('text/tile-id', t.id)
                  }
                  title={`Place ${t.wildcard ? 'wildseed' : t.color}`}
                />
              ) : (
                <span className="tg-slot-empty" />
              )}
            </div>
          );
        })}
      </div>

      <div className="tg-shed-beds">
        {Array.from({ length: BED_SLOTS }).map((_, i) => (
          <div className="tg-bed-slot" key={i} title="Flower-bed storage">
            🌷
          </div>
        ))}
      </div>
    </section>
  );
}
