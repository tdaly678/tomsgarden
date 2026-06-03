/**
 * Central display: the round's Flower-bed factories plus the Nursery center pool.
 * Acquire takes ALL tiles of one declared color (skipping identical duplicates),
 * so tiles are grouped by color and a whole color-group is the click target.
 */
import type React from 'react';
import type { Factory, Tile as TileT, TileColor } from './boardModel';
import { Tile } from './Tile';
import { groupByColor } from './gamelogic';
import { COLOR_NAME, LABELS } from './theme';

interface CentralDisplayProps {
  factories: Factory[];
  center: TileT[];
  bagCount: number;
  canDraft: boolean;
  selectedSource?: { source: string; color: TileColor } | null;
  onDraft?: (source: string, color: TileColor) => void;
}

export function CentralDisplay({
  factories,
  center,
  bagCount,
  canDraft,
  selectedSource,
  onDraft,
}: CentralDisplayProps): React.ReactElement {
  return (
    <section className="tg-central" aria-label="Central display">
      <header className="tg-central-head">
        <span>{LABELS.flowerBed} Display</span>
        <span className="tg-bag" title="Tiles left in bag">
          🧺 {bagCount}
        </span>
      </header>

      <div className="tg-factories">
        {factories.map((f) => (
          <Source
            key={f.id}
            id={f.id}
            label={f.id.toUpperCase()}
            tiles={f.tiles}
            canDraft={canDraft}
            selectedSource={selectedSource}
            onDraft={onDraft}
          />
        ))}
      </div>

      <Source
        id="center"
        label={LABELS.nursery}
        tiles={center}
        wide
        canDraft={canDraft}
        selectedSource={selectedSource}
        onDraft={onDraft}
      />
    </section>
  );
}

function Source({
  id,
  label,
  tiles,
  wide,
  canDraft,
  selectedSource,
  onDraft,
}: {
  id: string;
  label: string;
  tiles: TileT[];
  wide?: boolean;
  canDraft: boolean;
  selectedSource?: { source: string; color: TileColor } | null;
  onDraft?: (source: string, color: TileColor) => void;
}): React.ReactElement {
  const groups = groupByColor(tiles);
  return (
    <div className={`tg-source${wide ? ' is-wide' : ''}`}>
      <div className="tg-source-label">{label}</div>
      <div className="tg-source-tiles">
        {tiles.length === 0 && <span className="tg-empty-note">empty</span>}
        {[...groups.entries()].map(([color, group]) => {
          const c = color as TileColor;
          const sel =
            selectedSource?.source === id && selectedSource?.color === c;
          return (
            <button
              key={color}
              type="button"
              className={`tg-color-group${sel ? ' is-selected' : ''}`}
              disabled={!canDraft}
              title={`Acquire all ${COLOR_NAME[c]} from ${label}`}
              onClick={() => onDraft?.(id, c)}
            >
              {group.map((t) => (
                <Tile key={t.id} tile={t} size={18} />
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
