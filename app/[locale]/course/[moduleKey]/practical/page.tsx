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
import { Badge } from '../../../../../components/Badge'
import { StatusPill } from '../../../../../components/StatusPill'
import { ChallengeTrack } from '../../../../../components/ChallengeTrack'
import { MissionPanel } from '../../../../../components/MissionPanel'

/**
 * Ticket #13 practical mission attempt page (#45 stage-4 framing on top):
 * the Mission the module's Lessons END into (the `ppg_read_practical` RPC —
 * the bilingual scenario/requirements/expected output, gated server-side:
 * an ungated learner, a locked module returns `empty`, never a hidden form),
 * the upload form (the native POST to /api/submissions runs the magic-byte +
 * size gate SERVER-side; a wrong type / oversize yields the bilingual error;
 * the file + the reflection ride the private bucket + one row insert), the
 * submission history shown (the `ppg_submission_history` RPC — the
 * version-preserving append-only history, the CALLER's own rows only, each
 * downloadable by the owner via a short-lived signed URL), the status
 * lifecycle notes (in_progress -> submitted -> needs_improvement | approved;
 * needs_improvement -> approved; the resubmit APPENDS a NEW row; the +150 XP
 * on approval is a ledger event, never this page's doing). The #45 framing
 * adds ONLY presentation on the stage-map vocabulary: the four-step
 * CHALLENGE TRACK + a MissionPanel with `challenge | success | clear` states
 * — the reward chip rides the learner's OWN approval/final-project LEDGER
 * row (real amount, no fake grants: while a round merely awaits the Teacher
 * the panel honestly stays CHALLENGE, and the shipped seam note never
 * coexists with a rendered grant), and the unlock band renders ONLY when the
 * learner's own completion stands AND the course map speaks the next module
 * `open`. `force-dynamic` because the page reads through the session JWT.
 * Every state (`practical.section`, `practical.states.*`,
 * `practical.linkModule`, `practical.linkMap`, `practical.fallbackSuspense`,
 * `challenge.*`) has its own copy in `messages`.
 */
export const dynamic = 'force-dynamic'

async function PracticalAttempt({ moduleKey }: { moduleKey: string }) {
  const t = await getTranslations('practical')
  const tC = await getTranslations('challenge')
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
    <section aria-label={t('section')}>
      <ChallengeTrack label={tC('trackLabel')} steps={trackSteps} />

      {view.panel && state.mission
        ? (
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
              ? <p>{t('lessonsFlowNote')} {lessons.lessons.map((l) => pick(l.title_th, l.title_en)).join(', ')}</p>
              : null}
            {/* PPGA #18 (production verification, finding #5): the enctype
                is the multipart one — a form lacking it posts urlencoded and
                a file input serializes to its FILENAME string (the route's
                upload_type_denied gate is exactly what the browser's body
                deserved); the journey's live round caught it. */}
            <form method="POST" action="/api/submissions" encType="multipart/form-data" data-ppg-submission-form="submission" aria-label={t('uploadLabel')}>
              <input name="module_key" defaultValue={moduleKey} hidden={true} />
              {/* PPGA #18 (the a11y sweep): the file input is a form control a
                  screen-reader must NAME — the form's own aria-label never
                  names it (axe `label`, critical). The repo's pattern: a
                  visible `<label htmlFor>` (change-password, provisioning,
                  survey), bilingual copy in `messages`. */}
              <label htmlFor="ppg-submission-file">{t('fileLabel')}</label>
              <input id="ppg-submission-file" type="file" name="file" accept=".pptx,.ppt" />
              <input name="reflection" placeholder={t('reflectionPlaceholder')} />
              <button type="submit">{t('uploadLabel')}</button>
            </form>
            <p>{t('states.typeWrong')} {t('states.oversize')}</p>
            {view.cleared ? null : (
              <p>
                <StatusPill tone="success" label={t('submittedState')} />
                <Badge text={t('xpSeamNote')} tone="success" />
              </p>
            )}
          </MissionPanel>
        )
        : null}

      {history.status === 'ok' && history.submissions
        ? (
          <section aria-label={t('historySection')}>
            <h2>{t('historySection')}</h2>
            <table>
              <thead>
                <tr>
                  <td>{t('historyRound')}</td>
                  <td>{t('historyStatus')}</td>
                  <td>{t('historyAction')}</td>
                  <td>{t('historyDownload')}</td>
                </tr>
              </thead>
              <tbody>
                {history.submissions.map((s) => (
                  <tr key={`${s.learner_id}-${s.mission_id}-${s.submission_seq}`} aria-label={`${t('historyRound')} ${s.submission_seq}, ${s.status}`}>
                    <td>{s.submission_seq}</td>
                    <td>{s.status}</td>
                    <td>
                      {/* PPGA #18 (finding #2): the learner's OWN `in_progress ->
                        submitted` move — the wire #13 left unconnected, without
                        which the upload NEVER reaches a Teacher's queue. The
                        button rides ONLY an `in_progress` round; the RPC's gate
                        (own uid, learner role, legal transition) is the
                        authority, never this render. */}
                      {s.status === 'in_progress' ? (
                        <form
                          method="POST"
                          action="/api/submissions/status"
                          data-ppg-submission-status-form={`${s.mission_id}-${s.submission_seq}`}
                          aria-label={t('submitForReview')}
                        >
                          <input name="module_key" defaultValue={s.mission_id} hidden={true} />
                          <input name="submission_seq" defaultValue={s.submission_seq} hidden={true} />
                          <button type="submit">{t('submitForReview')}</button>
                        </form>
                      ) : null}
                    </td>
                    <td>
                      <a
                        href={`/api/submissions/download?module_key=${s.mission_id}&submission_seq=${s.submission_seq}`}
                      >
                        {t('historyDownload')}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        <Link href={{ pathname: '/course/[moduleKey]', params: { moduleKey } }}>{t('linkModule')}</Link>
      </p>
      <p>
        <Link href="/course">{t('linkMap')}</Link>
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
