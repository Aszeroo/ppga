import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../../../lib/i18n/routing'

import {
  readPracticalMissionViaRpc,
  readSubmissionHistoryViaRpc,
} from '../../../../../lib/sup/submissions'
import { readLessonsViaRpc } from '../../../../../lib/sup/curriculum'
import { readChallengeReads } from '../../../../../lib/sup/challenge'
import { buildChallengeContext, challengeCopyFrom, challengePanelView, challengeTrackSteps } from '../../../../../lib/challengeStages'
import { Card } from '../../../../../components/Card'
import { ChallengeTrack } from '../../../../../components/ChallengeTrack'
import { MissionPanel } from '../../../../../components/MissionPanel'
import { RewardCelebration } from '../../../../../components/RewardCelebration'
import { UploadArea } from '../../../../../components/UploadArea'

/**
 * Ticket #13 practical mission attempt page (#45 stage-4 framing; V3 dress
 * for #53): the Mission the module's Lessons END into (the
 * `ppg_read_practical` RPC — the bilingual scenario/requirements/expected
 * output, gated server-side: an ungated learner, a locked module returns
 * `empty`, never a hidden form), the upload form (the native POST to
 * /api/submissions runs the magic-byte + size gate SERVER-side; a wrong
 * type / oversize yields the bilingual error; the file + the reflection
 * ride the private bucket + one row insert), the submission history shown
 * (the `ppg_submission_history` RPC — the version-preserving append-only
 * history, the CALLER's own rows only, each downloadable by the owner via
 * a short-lived signed URL), the status lifecycle notes (in_progress ->
 * submitted -> needs_improvement | approved; the resubmit APPENDS a NEW
 * row; the +150 XP on approval is a ledger event, never this page's doing).
 * The #53 dress: the upload area is the V3 drop face with its EMPTY /
 * VALID / INVALID states (`UploadArea`) and the accepted-file rules VISIBLE
 * up front (the shipped bilingual rule copy — the SERVER's gate stays the
 * authority; the client preview never blocks the POST), the ONE primary CTA
 * per context (the upload submit on `.ppg-cta`; the per-round
 * submit-for-review rides the secondary face), the awaiting-review note on
 * the V3 status card (the success-tone pill retired — the #52 lesson-page
 * precedent; the journey's pill count-0 gate only benefits), and the
 * append-only history in the V3 table face. Every state stays server-read
 * truth; `force-dynamic` because the page reads through the session JWT.
 * Every state (`practical.section`, `practical.states.*`,
 * `practical.linkModule`, `practical.linkMap`, `practical.fallbackSuspense`,
 * `challenge.*`) has its own copy in `messages`.
 */
export const dynamic = 'force-dynamic'

/** The MIRROR of the server's size gate (`lib/sup/submissions.ts`'s
 * `submissionFileSchema`: 25 000 000 bytes). The upload area previews the
 * rule; the RPC-side gate below stays the ONLY authority — a client-side
 * preview NEVER creates, blocks or mutates a submission row. */
const MAX_UPLOAD_BYTES = 25_000_000

async function PracticalAttempt({ moduleKey }: { moduleKey: string }) {
  const t = await getTranslations('practical')
  const tC = await getTranslations('challenge')
  const tR = await getTranslations('reward')
  const locale = await getLocale()
  const state = await readPracticalMissionViaRpc(moduleKey)
  const history = await readSubmissionHistoryViaRpc(moduleKey)
  const lessons = await readLessonsViaRpc(moduleKey)
  const ctx = buildChallengeContext(
    moduleKey,
    await readChallengeReads(moduleKey),
    { submissionExists: history.status === 'ok' && (history.submissions ?? []).length > 0 },
  )
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  const copy = challengeCopyFrom(tC)
  const view = challengePanelView(ctx, { status: state.status, hasContent: !!state.mission }, copy, locale)
  const trackSteps = challengeTrackSteps(ctx, moduleKey, copy)
  return (
    <section aria-label={t('section')} className="ppg-page-wrap">
      <ChallengeTrack label={tC('trackLabel')} steps={trackSteps} />

      {view.panel && state.mission
        ? (
          <>
          <MissionPanel
            state={view.panel}
            stateCopy={view.stateCopy}
            heading={t('section')}
            panelLabel={t('section')}
            reward={view.reward}
            unlocked={view.unlocked}
          >
            <Card heading={t('scenarioHeading')} body={pick(state.mission.scenario_th, state.mission.scenario_en)} status="available" />
            <Card heading={t('requirementsHeading')} body={pick(state.mission.requirements_th, state.mission.requirements_en)} status="available" />
            <Card heading={t('expectedHeading')} body={pick(state.mission.expected_out_th, state.mission.expected_out_en)} status="available" />
            {lessons.status === 'ok' && lessons.lessons
              ? <p className="ppg-mission-note">{t('lessonsFlowNote')} {lessons.lessons.map((l) => pick(l.title_th, l.title_en)).join(', ')}</p>
              : null}
            {/* PPGA #18 (production verification, finding #5): the enctype
                is the multipart one — a form lacking it posts urlencoded and
                a file input serializes to its FILENAME string (the route's
                upload_type_denied gate is exactly what the browser's body
                deserved); the journey's live round caught it. #53: the file
                input + its label + the visible rules ride `UploadArea` —
                SAME id/name/accept, the native POST byte-identical. */}
            <form method="POST" action="/api/submissions" encType="multipart/form-data" className="ppg-mission-form" data-ppg-submission-form="submission" aria-label={t('uploadLabel')}>
              <input name="module_key" defaultValue={moduleKey} hidden={true} />
              <UploadArea
                id="ppg-submission-file"
                name="file"
                accept=".pptx,.ppt"
                fileLabel={t('fileLabel')}
                formatRule={t('states.typeWrong')}
                sizeRule={t('states.oversize')}
                maxBytes={MAX_UPLOAD_BYTES}
              />
              {/* PPGA #18 (the a11y sweep): every control a screen-reader
                  must NAME — the file input is named by `UploadArea`'s
                  visible label; the reflection keeps its shipped
                  placeholder-name (the pattern the #18 sweep passed on). */}
              <input name="reflection" className="ppg-input" placeholder={t('reflectionPlaceholder')} />
              <div className="ppg-sc-cta-row">
                <button type="submit" className="ppg-cta" data-ppg-cta="primary">{t('uploadLabel')}</button>
              </div>
            </form>
            {view.cleared ? null : (
              /* The awaiting-Teacher lifecycle note on the V3 status card —
                 the raw round statuses keep riding the history table below
                 (never colour alone), and NO success-tone pill renders
                 before an approval exists (the journey's count-0 gate). */
              <div className="ppg-status-card ppg-strip-top">
                <p className="ppg-status-card-title">
                  <span aria-hidden="true">🕒 </span>
                  {t('submittedState')}
                </p>
                <p className="ppg-status-card-value">{t('xpSeamNote')}</p>
              </div>
            )}
          </MissionPanel>
          {/* #53: the approval/unlock celebration over the SAME reads the
              panel renders (the real `practical_approval`/`final_project`
              ledger row + the real unlock band) — once per browser per
              identity; NO `.ppg-cta`, NO success-tone pill, NO duplicate
              `data-ppg-*` marker: the upload context's gates stay exact. */}
          <RewardCelebration
            reward={view.reward}
            unlocked={view.unlocked}
            copy={{ title: tR('title'), dismiss: tR('dismiss') }}
          />
          </>
        )
        : null}

      {history.status === 'ok' && history.submissions
        ? (
          <section aria-label={t('historySection')}>
            <h2 className="ppg-list-title">{t('historySection')}</h2>
            <div className="ppg-table-wrap">
              <table className="ppg-table">
                <thead>
                  <tr>
                    <th scope="col">{t('historyRound')}</th>
                    <th scope="col">{t('historyStatus')}</th>
                    <th scope="col">{t('historyAction')}</th>
                    <th scope="col">{t('historyDownload')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.submissions.map((s) => (
                    <tr key={`${s.learner_id}-${s.mission_id}-${s.submission_seq}`} aria-label={`${t('historyRound')} ${s.submission_seq}, ${s.status}`}>
                      <td>{s.submission_seq}</td>
                      {/* The raw lifecycle status IS the non-colour state cue
                          (in_progress / submitted / needs_improvement /
                          approved) — the V3 table face never hues it alone. */}
                      <td>{s.status}</td>
                      <td>
                        {/* PPGA #18 (finding #2): the learner's OWN `in_progress ->
                          submitted` move — the wire #13 left unconnected, without
                          which the upload NEVER reaches a Teacher's queue. The
                          button rides ONLY an `in_progress` round; the RPC's gate
                          (own uid, learner role, legal transition) is the
                          authority, never this render. The ONE primary CTA of the
                          context stays the upload form — this rides the
                          secondary face. */}
                        {s.status === 'in_progress' ? (
                          <form
                            method="POST"
                            action="/api/submissions/status"
                            data-ppg-submission-status-form={`${s.mission_id}-${s.submission_seq}`}
                            aria-label={t('submitForReview')}
                          >
                            <input name="module_key" defaultValue={s.mission_id} hidden={true} />
                            <input name="submission_seq" defaultValue={s.submission_seq} hidden={true} />
                            <button type="submit" className="ppg-btn-secondary">{t('submitForReview')}</button>
                          </form>
                        ) : null}
                      </td>
                      <td>
                        <a
                          className="ppg-link"
                          href={`/api/submissions/download?module_key=${s.mission_id}&submission_seq=${s.submission_seq}`}
                        >
                          {t('historyDownload')}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
        : null}

      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
      {history.status === 'empty' ? <p>{t('states.historyEmpty')} {history.detail}</p> : null}
      {history.status === 'error' ? <p>{t('states.error')} {history.detail}</p> : null}
      {history.status === 'not-configured' ? <p>{t('states.notConfigured')} {history.detail}</p> : null}
      {history.status === 'unauthorized' ? <p>{t('states.unauthorized')} {history.detail}</p> : null}

      <p>
        <Link href={{ pathname: '/course/[moduleKey]', params: { moduleKey } }} className="ppg-link">{t('linkModule')}</Link>
      </p>
      <p>
        <Link href="/course" className="ppg-link">{t('linkMap')}</Link>
      </p>
    </section>
  )
}

export default async function PracticalPage({ params }: { params: Promise<{ moduleKey: string }> }) {
  const t = await getTranslations('practical')
  const { moduleKey } = await params
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <PracticalAttempt moduleKey={moduleKey} />
    </Suspense>
  )
}
