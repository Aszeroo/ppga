"use client"

import { useState, type ChangeEvent } from 'react'

/**
 * The practical-upload area in the V3 drop-face vocabulary (gallery
 * `#s-submit`: the bordered drop with its state icon + the picked file's
 * own name + size, mint VALID / pink INVALID) with the ACCEPTED-FILE RULES
 * ALREADY VISIBLE before anything is picked (the gallery's `#s-mission`
 * criteria card: `.pptx`-only, the size cap — the copy rides the shipped
 * bilingual `practical.states.typeWrong`/`oversize` keys, the SAME text the
 * invalid state speaks). The three states are `data-ppg-upload-state`:
 * EMPTY (nothing picked) / VALID / INVALID — state rides icon + border +
 * copy, never hue alone (the marker names it for tests and the a11y gate).
 *
 * PRESENTATION ONLY — the upload flow is untouched: this is a PROGRESSIVE
 * ENHANCEMENT of the shipped native form. The real `<input type="file">`
 * (same name/accept/id as the shipped page) stays the only control; the
 * client check below is a VISUAL PREVIEW of the rules whose AUTHORITY is
 * the server (`lib/sup/submissions.ts`: the magic-byte signature + the
 * size gate decide — an extension alone NEVER creates or blocks a row).
 * Nothing here prevents the POST: an invalid preview still submits and the
 * SERVER's bilingual denial stays the truth.
 */
export interface UploadAreaProps {
  /** The file input's id (the shipped `ppg-submission-file` label target). */
  id: string
  /** The form field name the route reads (shipped `file`). */
  name: string
  /** The accepted-extension list, comma-separated (shipped `.pptx,.ppt`). */
  accept: string
  /** The visible input label (shipped `practical.fileLabel`). */
  fileLabel: string
  /** The accepted-FORMAT rule shown visible + spoken on a format miss. */
  formatRule: string
  /** The size-cap rule shown visible + spoken on an oversize pick. */
  sizeRule: string
  /** The size cap in bytes — the MIRROR of the server gate (which stays
   * the authority); passed in so this file invents no rule of its own. */
  maxBytes: number
}

interface PickedFile {
  name: string
  size: number
  ok: boolean
  reason: 'format' | 'size'
}

export function UploadArea({
  id,
  name,
  accept,
  fileLabel,
  formatRule,
  sizeRule,
  maxBytes,
}: UploadAreaProps) {
  const [picked, setPicked] = useState<PickedFile | null>(null)
  const extensions = accept
    .split(',')
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean)

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      setPicked(null)
      return
    }
    const lowerName = file.name.toLowerCase()
    const formatOk = extensions.some((ext) => lowerName.endsWith(ext))
    setPicked({ name: file.name, size: file.size, ok: formatOk && file.size <= maxBytes, reason: formatOk ? 'size' : 'format' })
  }

  const state = picked === null ? 'empty' : picked.ok ? 'valid' : 'invalid'
  const sizeMb = picked ? `${(picked.size / 1_000_000).toFixed(1)} MB` : ''

  return (
    <div className="ppg-upload">
      {/* `role=status` announces the state change (the emoji stays decoration). */}
      <div className="ppg-drop" data-ppg-upload-state={state} role="status">
        <span className="ppg-drop-emoji" aria-hidden="true">
          {state === 'valid' ? '✅' : state === 'invalid' ? '⚠️' : '📄'}
        </span>
        {picked === null
          ? <p className="ppg-drop-name">{fileLabel}</p>
          : (
            <>
              <p className="ppg-drop-name">{picked.name}</p>
              <p className="ppg-drop-detail">
                {picked.ok ? sizeMb : picked.reason === 'format' ? formatRule : sizeRule}
              </p>
            </>
          )}
      </div>
      <label className="ppg-field-label" htmlFor={id}>{fileLabel}</label>
      <input id={id} name={name} type="file" accept={accept} className="ppg-input" onChange={onChange} />
      {/* The rules ride the gallery's `lisq`/`dotok` list idiom — VISIBLE
          before any pick, in BOTH locales, straight from the shipped keys. */}
      <ul className="ppg-rules">
        <li>{formatRule}</li>
        <li>{sizeRule}</li>
      </ul>
    </div>
  )
}
