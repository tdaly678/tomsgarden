/**
 * Central display: the round's Flower-bed factories plus the Nursery center pool.
 * Acquire takes ALL tiles of one declared COLOR or ALL of one declared PATTERN
 * (skipping identical duplicates). Clicking a tile opens a small two-option
 * chooser; hovering an option previews exactly which tiles would be taken.
 */
import { useState } from 'react';
import type React from 'react';
import type { Factory, Tile as TileT, TileColor } from './boardModel';
import type { DraftSelector } from './boardModel';
import { Tile } from './Tile';
import { acquiredTiles, patternOf } from './gamelogic';
import { COLOR_NAME, LABELS, PATTERN_BY_ID } from './theme';

interface CentralDisplayProps {
  factories: Factory[];
  center: TileT[];
  bagCount: number;
  canDraft: boolean;
  selectedSource?: { source: string; select: DraftSelector } | null;
  onDraft?: (source: string, select: DraftSelector) => void;
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
  selectedSource?: { source: string; select: DraftSelector } | null;
  onDraft?: (source: string, select: DraftSelector) => void;
}): React.ReactElement {
  // The tile whose two acquire options are being offered.
  const [focusId, setFocusId] = useState<string | null>(null);
  // The selector currently hovered in the chooser (drives the take-preview).
  const [preview, setPreview] = useState<DraftSelector | null>(null);

  const focusTile = tiles.find((t) => t.id === focusId) ?? null;

  // Tiles that would actually be taken for the previewed/committed selector
  // (matching group minus identical-hexagon duplicates).
  const activeSel =
    preview ??
    (selectedSource?.source === id ? selectedSource.select : null);
  const takenIds = activeSel
    ? new Set(acquiredTiles(tiles, activeSel).map((t) => t.id))
    : null;
  const matchIds = activeSel
    ? new Set(
        tiles
          .filter((t) =>
            activeSel.by === 'color'
              ? t.color === activeSel.color
              : patternOf(t) === activeSel.pattern,
          )
          .map((t) => t.id),
      )
    : null;

  function choose(select: DraftSelector): void {
    setFocusId(null);
    setPreview(null);
    onDraft?.(id, select);
  }

  let chooser: React.ReactElement | null = null;
  if (focusTile && canDraft) {
    const color = focusTile.color as TileColor;
    const pattern = patternOf(focusTile);
    const colorSel: DraftSelector = { by: 'color', color };
    const patternSel: DraftSelector = { by: 'pattern', pattern };
    const colorN = acquiredTiles(tiles, colorSel).length;
    const patternN = acquiredTiles(tiles, patternSel).length;
    chooser = (
      <div className="tg-draft-chooser" role="group" aria-label="Acquire by">
        <button
          type="button"
          className="tg-btn tg-draft-option"
          onMouseEnter={() => setPreview(colorSel)}
          onMouseLeave={() => setPreview(null)}
          onFocus={() => setPreview(colorSel)}
          onBlur={() => setPreview(null)}
          onClick={() => choose(colorSel)}
          title={`Take all ${COLOR_NAME[color]} tiles (duplicates skipped)`}
        >
          All {COLOR_NAME[color]} ({colorN})
        </button>
        <button
          type="button"
          className="tg-btn tg-draft-option"
          onMouseEnter={() => setPreview(patternSel)}
          onMouseLeave={() => setPreview(null)}
          onFocus={() => setPreview(patternSel)}
          onBlur={() => setPreview(null)}
          onClick={() => choose(patternSel)}
          title={`Take all ${PATTERN_BY_ID[pattern].label} tiles (duplicates skipped)`}
        >
          All {PATTERN_BY_ID[pattern].label}s ({patternN})
        </button>
        <button
          type="button"
          className="tg-btn tg-draft-cancel"
          onClick={() => {
            setFocusId(null);
            setPreview(null);
          }}
          aria-label="Cancel"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className={`tg-source${wide ? ' is-wide' : ''}`}>
      <div className="tg-source-label">{label}</div>
      <div className="tg-source-tiles">
        {tiles.length === 0 && <span className="tg-empty-note">empty</span>}
        {tiles.map((t) => {
          const taken = takenIds?.has(t.id) ?? false;
          // Matches the selection but is an identical duplicate (not taken).
          const dup = !taken && (matchIds?.has(t.id) ?? false);
          const focused = focusId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`tg-draft-tile${taken ? ' is-taken' : ''}${
                dup ? ' is-dup' : ''
              }${focused ? ' is-focused' : ''}`}
              disabled={!canDraft}
              title={`${COLOR_NAME[t.color as TileColor]} ${
                PATTERN_BY_ID[patternOf(t)].label
              } — click to choose color or pattern`}
              onClick={() => {
                setPreview(null);
                setFocusId((cur) => (cur === t.id ? null : t.id));
              }}
            >
              <Tile tile={t} size={18} />
            </button>
          );
        })}
      </div>
      {chooser}
    </div>
  );
}
