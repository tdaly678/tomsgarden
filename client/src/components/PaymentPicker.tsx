/**
 * PaymentPicker — choose which storage items to discard to pay a placement
 * cost. Opens when a tile (or face-up flower bed) costing more than 1 has a
 * destination chosen. The suggestion is pre-selected (engine-canonical:
 * wildseeds first, then matching tiles); the player may toggle items in/out.
 * Confirm is disabled until the selection is a valid payment per the engine's
 * rules (mirrored client-side in gamelogic.isValidPayment).
 */
import type React from 'react';
import type { Coord, Tile as TileT } from './boardModel';
import { Tile } from './Tile';
import { isValidPayment, isValidPaymentSet, patternOf } from './gamelogic';
import { LABELS, PATTERN_BY_ID } from './theme';

/** Everything the board needs to resume the placement after payment. */
export interface PendingPayment {
  /** 'tile' = PlaceTile (anchor is the placed tile, consumed separately);
   *  'bed'  = PlaceExpansion (anchor is the bed's printed tile, not in hand). */
  mode: 'tile' | 'bed';
  /** The hexagon whose pattern sets the cost and anchors the set rule. */
  anchor: TileT;
  /** Storage items eligible as payment (hand, minus the placed copy). */
  pool: TileT[];
  /** Items still to select (= cost − 1). */
  needed: number;
  /** Full printed cost, for display. */
  cost: number;
  selectedIds: Set<string>;
  /** PlaceTile destination. */
  at?: Coord;
  /** PlaceBed parameters. */
  bedId?: string;
  cells?: Coord[];
  featureAt?: Coord;
  printedAt?: Coord;
}

interface PaymentPickerProps {
  pending: PendingPayment;
  onToggle: (tile: TileT) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PaymentPicker({
  pending,
  onToggle,
  onConfirm,
  onCancel,
}: PaymentPickerProps): React.ReactElement {
  const { anchor, pool, needed, cost, selectedIds } = pending;
  const selection = pool.filter((t) => selectedIds.has(t.id));
  const valid = isValidPayment(anchor, selection, needed);
  const anchorMeta = PATTERN_BY_ID[patternOf(anchor)];

  return (
    <div className="tg-payment" role="dialog" aria-label="Choose payment">
      <div className="tg-payment-card">
        <header className="tg-payment-head">
          <span className="tg-payment-title">
            Pay {cost}: {selection.length} of {needed} selected
          </span>
          <span className="tg-payment-sub">
            Placing <Tile tile={anchor} size={16} /> {anchorMeta.label ?? ''}
            {pending.mode === 'bed'
              ? ` (printed on the ${LABELS.flowerBed.toLowerCase()})`
              : ''}{' '}
            — it covers 1 of its own cost. Discard {needed} more: same pattern
            or same color (no duplicates); {LABELS.wildseed.toLowerCase()}s are
            wild.
          </span>
        </header>

        <div className="tg-payment-pool">
          {pool.map((t) => {
            const isSelected = selectedIds.has(t.id);
            // Would adding this item keep the set rule satisfiable?
            const wouldBeOk =
              isSelected ||
              (selection.length < needed &&
                isValidPaymentSet(anchor, [...selection, t]));
            return (
              <button
                key={t.id}
                type="button"
                className={`tg-payment-item${isSelected ? ' is-selected' : ''}${
                  !wouldBeOk ? ' is-ineligible' : ''
                }`}
                onClick={() => onToggle(t)}
                title={
                  t.wildcard
                    ? `${LABELS.wildseed} (wild)`
                    : `${t.color} ${patternOf(t)}`
                }
              >
                <Tile tile={t} size={18} />
              </button>
            );
          })}
          {pool.length === 0 && (
            <span className="tg-empty-note">storage is empty</span>
          )}
        </div>

        <footer className="tg-payment-actions">
          <button
            type="button"
            className="tg-btn"
            disabled={!valid}
            onClick={onConfirm}
          >
            Confirm payment
          </button>
          <button type="button" className="tg-btn is-ghost" onClick={onCancel}>
            Cancel
          </button>
          {!valid && selection.length === needed && (
            <span className="tg-hint">
              Selection breaks the set rule — match the placed tile's pattern
              or color, no duplicates.
            </span>
          )}
        </footer>
      </div>
    </div>
  );
}
