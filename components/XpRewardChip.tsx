import { type CSSProperties } from 'react'

/**
 * The XP reward chip (#41 stage 4, ticket #45): ONE granted XP event read
 * off the REAL ledger (`ppg_xp_ledger` — the ADR-0001 single currency). It is
 * rendered ONLY where a real ledger row exists: the amount is the row's own
 * `amount`, never a schedule claim, and a granted XP is never rendered twice
 * (the pages move their pre-pass rule NOTES to the challenge state so the
 * chip stands alone once the grant has landed). The `data-ppg-xp-event`
 * marker carries the ledger's own PK shape `event_type:event_ref` — the
 * observable proof the display reads a real record.
 *
 * Pure props (no hooks, no server APIs): renders in the server module pages
 * and in the client gallery demo; colours resolve `var(--ppg-…)` only.
 */
export interface XpRewardChipProps {
  /** The ledger row's own amount (+50 / +100 / +150 / +300). */
  amount: number
  /** The ledger PK shape — `event_type:event_ref` (e.g. `self_check_pass:module-01-lesson-01`). */
  eventAttr: string
  /** The localized lead-in copy (e.g. "From your XP ledger:"). */
  label: string
}

const chipStyle: CSSProperties = {
  display: 'inline-block',
  backgroundColor: 'var(--ppg-blue-100)',
  color: 'var(--ppg-fg-heading)',
  borderWidth: 'var(--ppg-border-1)',
  borderColor: 'var(--ppg-status-success)',
  borderStyle: 'solid',
  boxShadow: 'var(--ppg-shadow-pixel-1)',
  padding: 'var(--ppg-space-1) var(--ppg-space-2)',
}

export function XpRewardChip({ amount, eventAttr, label }: XpRewardChipProps) {
  return (
    <span data-ppg-xp-event={eventAttr} style={chipStyle}>
      <span className="ppg-card-text">{label}</span>{' '}
      <span className="ppg-xp-numeral">+{amount} XP</span>
    </span>
  )
}
