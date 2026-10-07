"use client"

import { useSyncExternalStore } from 'react'

/**
 * Ticket #50 token sheet: the owner's "DESIGN TOKENS" screen
 * (`UI_UX_design/index.html`, `#s-tokens`) rendered from THIS app's real
 * stylesheet rather than hardcoded values. Every swatch / bar / box is styled
 * through `var(--ppg-…)`, so what the page shows is what `app/globals.css`
 * declares; the printed values are the resolved custom properties read back at
 * runtime with `getComputedStyle` (the SSR-safe path: `useSyncExternalStore`
 * serves the server the `...` placeholders and swaps the resolved values in
 * after hydration — no effect-state cascade, no hydration mismatch). This
 * file carries no literal colour — the designSystem suite's hex scan covers
 * it, and the resolved hexes exist only as runtime data.
 *
 * The labels are the design-system identifiers themselves (token names, px
 * sizes, font names, and the owner's own ASCII screen title) — the owner's
 * token screen sizes (30/24/19/16/13.5) and the `--strip-sm` repeat pattern
 * are copied from `index.html` (source-of-truth: HTML > exports > brief). No
 * locale key is invented here: `messages/*.json` stay byte-identical, so the
 * Thai corpus validator is untouched by this sheet.
 */

const PALETTE_TOKENS = [
  '--ppg-pink-100',
  '--ppg-pink-200',
  '--ppg-pink-300',
  '--ppg-pink-500',
  '--ppg-blue-100',
  '--ppg-blue-200',
  '--ppg-blue-300',
  '--ppg-blue-500',
  '--ppg-pink-accent',
  '--ppg-blue-accent',
  '--ppg-bg-body',
  '--ppg-bg-surface',
  '--ppg-fg-heading',
  '--ppg-fg-body',
  '--ppg-purple',
  '--ppg-purple-tint',
  '--ppg-mint',
  '--ppg-mint-tint',
  '--ppg-yellow',
  '--ppg-yellow-tint',
  '--ppg-peach',
  '--ppg-gold',
  '--ppg-gold-deep',
  '--ppg-gold-deepest',
  '--ppg-success-soft',
  '--ppg-error-deep',
  '--ppg-ink',
  '--ppg-muted',
  '--ppg-faint',
  '--ppg-line',
  '--ppg-locked',
  '--ppg-gray-100',
  '--ppg-gray-300',
  '--ppg-gray-500',
  '--ppg-gray-700',
  '--ppg-cream',
  '--ppg-status-success',
  '--ppg-status-warning',
  '--ppg-status-error',
  '--ppg-status-locked',
  '--ppg-state-locked-bg',
  '--ppg-state-locked-fg',
  '--ppg-state-available-bg',
  '--ppg-state-available-fg',
]

const SPACE_TOKENS = ['--ppg-space-1', '--ppg-space-2', '--ppg-space-3', '--ppg-space-4', '--ppg-space-5']
const RADIUS_TOKENS = ['--ppg-radius-1', '--ppg-radius-2', '--ppg-radius-3']
const BORDER_TOKENS = ['--ppg-border-1', '--ppg-border-2', '--ppg-border-3']
const SHADOW_TOKENS = ['--ppg-shadow-pixel-1', '--ppg-shadow-pixel-2', '--ppg-shadow-pixel-3']

const SHEET_TOKENS = [...PALETTE_TOKENS, ...SPACE_TOKENS, ...RADIUS_TOKENS, ...BORDER_TOKENS, ...SHADOW_TOKENS]

/** The owner's token-screen type scale (`#s-tokens`), body-font rows. */
const TYPE_ROWS = [
  { label: 'H1 · 30 ExtraBold', fontSize: '30px', fontWeight: 800, color: '--ppg-fg-heading' },
  { label: 'H2 · 24 ExtraBold', fontSize: '24px', fontWeight: 800, color: '--ppg-fg-heading' },
  { label: 'H3 · 19 Bold', fontSize: '19px', fontWeight: 700, color: '--ppg-fg-heading' },
  { label: 'Body · 16 Regular', fontSize: '16px', fontWeight: 400, color: '--ppg-fg-body' },
  { label: 'Caption · 13.5 Muted', fontSize: '13.5px', fontWeight: 400, color: '--ppg-muted' },
]

/**
 * Reads the resolved custom properties from the document root as an external
 * store (the CSSOM): tokens never change at runtime, so the store is read once
 * and cached, the subscription is inert, and the server snapshot is the empty
 * map — `useSyncExternalStore` swaps in the client values after hydration
 * without a state-in-effect cascade. jsdom/older browsers simply leave the
 * placeholders when `getPropertyValue` returns `''`.
 */
const EMPTY_VALUES: Record<string, string> = {}
let cachedValues: Record<string, string> | null = null

function getTokenValuesSnapshot(): Record<string, string> {
  if (cachedValues === null) {
    const styles = getComputedStyle(document.documentElement)
    const next: Record<string, string> = {}
    for (const token of SHEET_TOKENS) {
      next[token] = styles.getPropertyValue(token).trim()
    }
    cachedValues = next
  }
  return cachedValues
}

function subscribeToTokens() {
  return () => undefined
}

function useSheetTokenValues() {
  return useSyncExternalStore(subscribeToTokens, getTokenValuesSnapshot, () => EMPTY_VALUES)
}

const headingStyle = {
  fontFamily: 'var(--font-ppg-display), var(--font-ppg-body)',
} as const

const labelStyle = {
  fontSize: '13px',
  color: 'var(--ppg-fg-heading)',
  wordBreak: 'break-all',
} as const

const valueStyle = {
  fontSize: '12px',
  color: 'var(--ppg-muted)',
  wordBreak: 'break-all',
} as const

const swatchListStyle = {
  listStyle: 'none',
  margin: 'var(--ppg-space-2) 0',
  padding: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: 'var(--ppg-space-2)',
} as const

const scaleListStyle = {
  listStyle: 'none',
  margin: 'var(--ppg-space-2) 0',
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--ppg-space-2)',
} as const

/** One `token → resolved value` line, shared by the scale sections. */
function TokenRow({ token, value, preview }: { token: string; value?: string; preview: React.ReactNode }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--ppg-space-2)', flexWrap: 'wrap' }}>
      <span style={{ ...labelStyle, minWidth: '160px' }}>{token}</span>
      {preview}
      <span style={valueStyle}>{value || '...'}</span>
    </li>
  )
}

export function TokenSheet() {
  const values = useSheetTokenValues()
  return (
    <section aria-label="Design tokens">
      <h2 className="ppg-heading ppg-heading-text" style={headingStyle}>
        DESIGN TOKENS
      </h2>

      <h3 className="ppg-heading ppg-heading-text" style={{ ...headingStyle, fontSize: '16px', marginTop: 'var(--ppg-space-3)' }}>
        PALETTE
      </h3>
      <ul style={swatchListStyle} aria-label="Palette tokens">
        {PALETTE_TOKENS.map((token) => (
          <li key={token}>
            <div
              aria-hidden="true"
              style={{
                height: '44px',
                backgroundColor: `var(${token})`,
                border: 'var(--ppg-border-2) solid var(--ppg-line)',
                borderRadius: 'var(--ppg-radius-1)',
              }}
            />
            <div style={labelStyle}>{token}</div>
            <div style={valueStyle}>{values[token] || '...'}</div>
          </li>
        ))}
      </ul>

      <h3 className="ppg-heading ppg-heading-text" style={{ ...headingStyle, fontSize: '16px', marginTop: 'var(--ppg-space-3)' }}>
        TYPOGRAPHY
      </h3>
      <div
        style={{
          padding: 'var(--ppg-space-3)',
          border: 'var(--ppg-border-2) solid var(--ppg-blue-300)',
          borderRadius: 'var(--ppg-radius-2)',
          backgroundColor: 'var(--ppg-bg-surface)',
          boxShadow: 'var(--ppg-shadow-pixel-1)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-ppg-display), var(--font-ppg-body)',
            fontSize: '36px',
            lineHeight: 1.6,
            color: 'var(--ppg-pink-300)',
            textShadow: '4px 4px 0 var(--ppg-blue-300), 6px 6px 0 var(--ppg-purple)',
          }}
        >
          PPGA
        </div>
        <p style={{ ...valueStyle, margin: 'var(--ppg-space-2) 0 var(--ppg-space-3)' }}>
          Display · Press Start 2P · ASCII-only
        </p>
        {TYPE_ROWS.map((row) => (
          <p
            key={row.label}
            style={{
              fontFamily: 'var(--font-ppg-body)',
              fontSize: row.fontSize,
              fontWeight: row.fontWeight,
              color: `var(${row.color})`,
              margin: 'var(--ppg-space-2) 0',
            }}
          >
            {row.label}
          </p>
        ))}
      </div>

      <h3 className="ppg-heading ppg-heading-text" style={{ ...headingStyle, fontSize: '16px', marginTop: 'var(--ppg-space-3)' }}>
        SPACING
      </h3>
      <ul style={scaleListStyle} aria-label="Spacing tokens">
        {SPACE_TOKENS.map((token) => (
          <TokenRow
            key={token}
            token={token}
            value={values[token]}
            preview={
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  height: '10px',
                  width: `var(${token})`,
                  backgroundColor: 'var(--ppg-blue-300)',
                  borderRadius: 'var(--ppg-radius-1)',
                }}
              />
            }
          />
        ))}
      </ul>

      <h3 className="ppg-heading ppg-heading-text" style={{ ...headingStyle, fontSize: '16px', marginTop: 'var(--ppg-space-3)' }}>
        RADIUS · BORDER · SHADOW
      </h3>
      <ul style={swatchListStyle} aria-label="Radius tokens">
        {RADIUS_TOKENS.map((token) => (
          <li key={token}>
            <div
              aria-hidden="true"
              style={{
                width: '72px',
                height: '44px',
                borderRadius: `var(${token})`,
                border: '3px solid var(--ppg-blue-300)',
                backgroundColor: 'var(--ppg-bg-surface)',
              }}
            />
            <div style={labelStyle}>{token}</div>
            <div style={valueStyle}>{values[token] || '...'}</div>
          </li>
        ))}
      </ul>
      <ul style={scaleListStyle} aria-label="Border tokens">
        {BORDER_TOKENS.map((token) => (
          <TokenRow
            key={token}
            token={token}
            value={values[token]}
            preview={
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: '96px',
                  borderTop: `var(${token}) solid var(--ppg-blue-300)`,
                }}
              />
            }
          />
        ))}
      </ul>
      <ul style={swatchListStyle} aria-label="Shadow tokens">
        {SHADOW_TOKENS.map((token) => (
          <li key={token}>
            <div
              aria-hidden="true"
              style={{
                width: '72px',
                height: '44px',
                borderRadius: 'var(--ppg-radius-1)',
                border: 'var(--ppg-border-1) solid var(--ppg-line)',
                backgroundColor: 'var(--ppg-bg-surface)',
                boxShadow: `var(${token})`,
              }}
            />
            <div style={labelStyle}>{token}</div>
            <div style={valueStyle}>{values[token] || '...'}</div>
          </li>
        ))}
      </ul>

      <h3 className="ppg-heading ppg-heading-text" style={{ ...headingStyle, fontSize: '16px', marginTop: 'var(--ppg-space-3)' }}>
        PIXEL STRIP
      </h3>
      <div
        aria-hidden="true"
        style={{
          height: '8px',
          borderRadius: '4px',
          backgroundImage:
            'repeating-linear-gradient(90deg, var(--ppg-pink-300) 0 10px, var(--ppg-blue-300) 10px 20px, var(--ppg-purple) 20px 30px, var(--ppg-mint) 30px 40px)',
        }}
      />
      <p style={{ ...valueStyle, margin: 'var(--ppg-space-2) 0' }}>
        pink / blue / purple / mint · the owner&apos;s --strip-sm repeat
      </p>
    </section>
  )
}
