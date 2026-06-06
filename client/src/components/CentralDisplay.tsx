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
import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import type { Factory, Tile as TileT, TileColor } from './boardModel';
import type {
  DisplayBed,
  DraftSelector,
  DraftCopyChoice,
  DraftCopySource,
} from './boardModel';
import { Tile } from './Tile';
import { acquirePreview, groupKeyOf, patternOf } from './gamelogic';
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
  /**
   * Confirm the pending selection (emits the draft action). `choices` carries
   * the player's chosen physical copy for each duplicate group.
   */
  onConfirm?: (choices?: readonly DraftCopyChoice[]) => void;
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
  // Player-chosen copy per duplicate group (group key -> chosen tile id).
  // Empty = every group uses its canonical default pick.
  const [chosenCopies, setChosenCopies] = useState<Map<string, string>>(
    () => new Map(),
  );

  const beds = displayBeds ?? [];
  // Hovered selector previews; otherwise the persistent pending selection.
  const activeSel = hoverSel ?? pendingSelect ?? null;
  const preview: AcquirePreview | null = useMemo(
    () =>
      activeSel
        ? acquirePreview(center, factories, beds, activeSel, chosenCopies)
        : null,
    [activeSel, center, factories, beds, chosenCopies],
  );

  // Reset duplicate choices whenever the persistent selection changes/clears
  // (each new selector starts from the canonical defaults).
  useEffect(() => {
    setChosenCopies(new Map());
  }, [pendingSelect]);

  // Source (loose pool vs flower bed) for any rendered tile id.
  const sourceOf = useMemo(() => {
    const m = new Map<string, DraftCopySource>();
    for (const t of center) m.set(t.id, { kind: 'loose' });
    for (const f of factories) {
      for (const t of f.tiles) {
        m.set(t.id, { kind: 'expansion', expansionId: f.id });
      }
    }
    return m;
  }, [center, factories]);

  /** Pick a specific copy of a duplicate group as the one to take. */
  function chooseCopy(groupKey: string, tileId: string): void {
    setChosenCopies((cur) => {
      const next = new Map(cur);
      next.set(groupKey, tileId);
      return next;
    });
  }

  /** Build the DraftCopyChoice[] for every duplicate group from the preview. */
  function buildChoices(sel: DraftSelector): DraftCopyChoice[] {
    const pv = acquirePreview(center, factories, beds, sel, chosenCopies);
    const out: DraftCopyChoice[] = [];
    for (const [, copies] of pv.groups) {
      if (copies.length < 2) continue; // only duplicate groups need a choice
      const takenCopy = copies.find((c) => pv.takenIds.has(c.tile.id));
      if (!takenCopy) continue;
      const source = sourceOf.get(takenCopy.tile.id);
      if (!source) continue;
      out.push({
        color: takenCopy.tile.color as TileColor,
        pattern: patternOf(takenCopy.tile),
        source,
      });
    }
    return out;
  }

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
    setChosenCopies(new Map());
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
    const sel = acquirePreview(
      center,
      factories,
      beds,
      pendingSelect,
      chosenCopies,
    );
    const n = sel.taken.length;
    const nBeds = sel.bedIds.size;
    // Count duplicate groups (>1 copy) — the player may pick which copy to take.
    let dupGroups = 0;
    for (const [, copies] of sel.groups) if (copies.length > 1) dupGroups += 1;
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
            ` + ${nBeds} ${LABELS.flowerBed.toLowerCase()}${nBeds === 1 ? '' : 's'}`}
          {dupGroups > 0
            ? ` — ${dupGroups} duplicate${dupGroups === 1 ? '' : 's'}: click a dimmed copy to take it instead`
            : ' — duplicates stay in the display'}
        </span>
        <button
          type="button"
          className="tg-btn tg-draft-take"
          disabled={n === 0 && nBeds === 0}
          onClick={() => onConfirm?.(buildChoices(pendingSelect))}
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
          // A taken/dup tile is part of a CHOOSABLE group iff its group has
          // more than one copy (so the player can switch which copy is taken).
          const gKey = groupKeyOf(t);
          const group = preview?.groups.get(gKey);
          const choosable =
            !!pendingSelect && !!group && group.length > 1 && (taken || dup);
          // Hint: taking THIS copy would empty its source bed (1 tile left).
          const src = sourceOf.get(t.id);
          const bed =
            src?.kind === 'expansion'
              ? factories.find((f) => f.id === src.expansionId)
              : undefined;
          const flipsBed = !!bed && bed.tiles.length === 1;
          const titleTail = choosable
            ? dup
              ? ` — duplicate copy${flipsBed ? ' (taking it empties this bed)' : ''}; click to take THIS copy instead`
              : ` — the copy being taken${flipsBed ? ' (empties this bed)' : ''}; click a dimmed copy to switch`
            : taken
              ? ' — will be taken'
              : dup
                ? ' — identical duplicate, stays in the display'
                : ' — click to choose color or pattern';
          return (
            <button
              key={t.id}
              type="button"
              className={`tg-draft-tile${taken ? ' is-taken' : ''}${
                dup ? ' is-dup' : ''
              }${focused ? ' is-focused' : ''}${
                choosable ? ' is-choosable' : ''
              }${flipsBed && (taken || dup) ? ' is-flips' : ''}`}
              disabled={!canDraft}
              title={`${COLOR_NAME[t.color as TileColor]} ${
                PATTERN_BY_ID[patternOf(t)].label
              }${titleTail}`}
              onClick={() => {
                setHoverSel(null);
                if (choosable) {
                  // Pick THIS physical copy as the one to take.
                  chooseCopy(gKey, t.id);
                  return;
                }
                setFocusId((cur) => (cur === t.id ? null : t.id));
              }}
            >
              <Tile tile={t} size={18} />
              {flipsBed && (taken || dup) ? (
                <span
                  className="tg-flip-flag"
                  title="Taking this copy empties this bed (flips it face up)"
                  aria-label="flips bed"
                >
                  ⤴
                </span>
              ) : null}
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
