/**
 * Central display: the round's Flower-bed factories plus the Nursery center pool.
 * Acquire takes ALL tiles of one declared COLOR or ALL of one declared PATTERN
 * across the ENTIRE display (skipping identical duplicates), plus any matching
 * face-up flower beds.
 *
 * Two-step UX:
 *  1. SELECT — click any tile, then pick one of its two groupings ("All <color>"
 *     / "All <pattern>"). The selection PERSISTS: every qualifying piece in the
 *     whole display lights up — taken copies vs skipped identical duplicates —
 *     exactly mirroring the engine's acquirableHexagons dedup.
 *  2. SUBMIT — a confirm bar shows "Take N tiles" (+ beds); only confirming
 *     emits the draft action. Cancel clears the selection.
 */
import { useMemo, useState } from 'react';
import type React from 'react';
import type { Factory, Tile as TileT, TileColor } from './boardModel';
import type { DisplayBed, DraftSelector } from './boardModel';
import { Tile } from './Tile';
import { acquirePreview, patternOf } from './gamelogic';
import type { AcquirePreview } from './gamelogic';
import type { PatternId } from './theme';
import { COLOR_NAME, LABELS, PATTERN_BY_ID } from './theme';

interface CentralDisplayProps {
  factories: Factory[];
  center: TileT[];
  /** Face-up matching beds are part of the acquire — shown in the preview. */
  displayBeds?: DisplayBed[];
  bagCount: number;
  canDraft: boolean;
  /** The persistent pending selection (lifted to GameBoard). */
  pendingSelect?: DraftSelector | null;
  onSelect?: (select: DraftSelector | null) => void;
  /** Confirm the pending selection (emits the draft action). */
  onConfirm?: () => void;
}

export function CentralDisplay({
  factories,
  center,
  displayBeds,
  bagCount,
  canDraft,
  pendingSelect,
  onSelect,
  onConfirm,
}: CentralDisplayProps): React.ReactElement {
  // The tile whose two acquire options are being offered ("source:tileId").
  const [focusId, setFocusId] = useState<string | null>(null);
  // The selector currently hovered in the chooser (transient preview).
  const [hoverSel, setHoverSel] = useState<DraftSelector | null>(null);

  const beds = displayBeds ?? [];
  // Hovered selector previews; otherwise the persistent pending selection.
  const activeSel = hoverSel ?? pendingSelect ?? null;
  const preview: AcquirePreview | null = useMemo(
    () => (activeSel ? acquirePreview(center, factories, beds, activeSel) : null),
    [activeSel, center, factories, beds],
  );

  const allTiles = useMemo(
    () => [...center, ...factories.flatMap((f) => f.tiles)],
    [center, factories],
  );
  const focusTile = focusId
    ? (allTiles.find((t) => t.id === focusId) ?? null)
    : null;

  function choose(select: DraftSelector): void {
    setFocusId(null);
    setHoverSel(null);
    onSelect?.(select);
  }
  function clearAll(): void {
    setFocusId(null);
    setHoverSel(null);
    onSelect?.(null);
  }

  // Per-tile chooser for the focused tile: pick by color or by pattern.
  let chooser: React.ReactElement | null = null;
  if (focusTile && canDraft) {
    const color = focusTile.color as TileColor;
    const pattern = patternOf(focusTile);
    const colorSel: DraftSelector = { by: 'color', color };
    const patternSel: DraftSelector = { by: 'pattern', pattern };
    const colorN = acquirePreview(center, factories, beds, colorSel).taken
      .length;
    const patternN = acquirePreview(center, factories, beds, patternSel).taken
      .length;
    chooser = (
      <div className="tg-draft-chooser" role="group" aria-label="Acquire by">
        <button
          type="button"
          className="tg-btn tg-draft-option"
          onMouseEnter={() => setHoverSel(colorSel)}
          onMouseLeave={() => setHoverSel(null)}
          onFocus={() => setHoverSel(colorSel)}
          onBlur={() => setHoverSel(null)}
          onClick={() => choose(colorSel)}
          title={`Select all ${COLOR_NAME[color]} tiles in the whole display (duplicates skipped)`}
        >
          All {COLOR_NAME[color]} ({colorN})
        </button>
        <button
          type="button"
          className="tg-btn tg-draft-option"
          onMouseEnter={() => setHoverSel(patternSel)}
          onMouseLeave={() => setHoverSel(null)}
          onFocus={() => setHoverSel(patternSel)}
          onBlur={() => setHoverSel(null)}
          onClick={() => choose(patternSel)}
          title={`Select all ${PATTERN_BY_ID[pattern].label} tiles in the whole display (duplicates skipped)`}
        >
          All {PATTERN_BY_ID[pattern].label}s ({patternN})
        </button>
        <button
          type="button"
          className="tg-btn tg-draft-cancel"
          onClick={() => {
            setFocusId(null);
            setHoverSel(null);
          }}
          aria-label="Close chooser"
        >
          ✕
        </button>
      </div>
    );
  }

  // Confirm bar for the persistent selection.
  let confirmBar: React.ReactElement | null = null;
  if (pendingSelect && canDraft) {
    const sel = acquirePreview(center, factories, beds, pendingSelect);
    const n = sel.taken.length;
    const nBeds = sel.bedIds.size;
    const patLabel =
      pendingSelect.by === 'pattern'
        ? (PATTERN_BY_ID[pendingSelect.pattern as PatternId]?.label ??
          pendingSelect.pattern)
        : '';
    const what =
      pendingSelect.by === 'color'
        ? `all ${COLOR_NAME[pendingSelect.color]}`
        : `all ${patLabel}s`;
    confirmBar = (
      <div className="tg-draft-confirm" role="group" aria-label="Confirm acquire">
        <span className="tg-draft-confirm-msg">
          Selected {what}: <b>{n}</b> {LABELS.plantTile.toLowerCase()}
          {n === 1 ? '' : 's'}
          {nBeds > 0 &&
            ` + ${nBeds} ${LABELS.flowerBed.toLowerCase()}${nBeds === 1 ? '' : 's'}`}{' '}
          — duplicates stay in the display
        </span>
        <button
          type="button"
          className="tg-btn tg-draft-take"
          disabled={n === 0 && nBeds === 0}
          onClick={() => onConfirm?.()}
        >
          Take {n > 0 ? n : ''} {n === 1 ? 'tile' : 'tiles'}
          {nBeds > 0 ? ` + ${nBeds} bed${nBeds === 1 ? '' : 's'}` : ''}
        </button>
        <button type="button" className="tg-btn tg-draft-cancel" onClick={clearAll}>
          Cancel
        </button>
      </div>
    );
  }

  const renderSource = (
    id: string,
    label: string,
    tiles: TileT[],
    wide?: boolean,
  ): React.ReactElement => (
    <div key={id} className={`tg-source${wide ? ' is-wide' : ''}`}>
      <div className="tg-source-label">{label}</div>
      <div className="tg-source-tiles">
        {tiles.length === 0 && <span className="tg-empty-note">empty</span>}
        {tiles.map((t) => {
          const taken = preview?.takenIds.has(t.id) ?? false;
          // Matches the selection but is an identical duplicate (not taken).
          const dup = preview?.dupIds.has(t.id) ?? false;
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
              }${
                taken
                  ? ' — will be taken'
                  : dup
                    ? ' — identical duplicate, stays in the display'
                    : ' — click to choose color or pattern'
              }`}
              onClick={() => {
                setHoverSel(null);
                setFocusId((cur) => (cur === t.id ? null : t.id));
              }}
            >
              <Tile tile={t} size={18} />
            </button>
          );
        })}
      </div>
      {focusTile && tiles.some((t) => t.id === focusTile.id) ? chooser : null}
    </div>
  );

  return (
    <section className="tg-central" aria-label="Central display">
      <header className="tg-central-head">
        <span>{LABELS.flowerBed} Display</span>
        <span className="tg-bag" title="Tiles left in bag">
          🧺 {bagCount}
        </span>
      </header>

      <div className="tg-factories">
        {factories.map((f) => renderSource(f.id, f.id.toUpperCase(), f.tiles))}
      </div>

      {renderSource('center', LABELS.nursery, center, true)}

      {confirmBar}
    </section>
  );
}
