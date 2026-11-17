import { Link } from '../lib/i18n/routing'

/**
 * PPGA #85: the shared unavailable state for retired worksheet surfaces
 * (Practical Mission upload, the learner review result, the Teacher review
 * queue/form). The routes stay registered so an old bookmark reaches a clear
 * explanation, never a rendered upload/review form — and never a 404. The
 * legacy implementation remains in the route files behind their exported
 * component for historical reuse; this surface is the only thing a direct
 * visit renders.
 */
export interface UnavailableSurfaceProps {
  title: string
  body: string
  linkLabel: string
  linkHref?: '/' | '/course'
}

export function UnavailableSurface({ title, body, linkLabel, linkHref = '/course' }: UnavailableSurfaceProps) {
  return (
    <main>
      <section aria-label={title} className="ppg-page-wrap" data-ppg-unavailable="true">
        <h1 className="ppg-heading ppg-heading-text">{title}</h1>
        <p className="ppg-card-text">{body}</p>
        <p>
          <Link className="ppg-link" href={linkHref}>
            {linkLabel}
          </Link>
        </p>
      </section>
    </main>
  )
}
