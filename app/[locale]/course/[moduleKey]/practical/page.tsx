import { Suspense } from 'react'

import { useLocale, useTranslations } from 'next-intl'
import { Link } from '../../../../../lib/i18n/routing'

import {
  readPracticalMissionViaRpc,
  readSubmissionHistoryViaRpc,
} from '../../../../../lib/sup/submissions'
import { readLessonsViaRpc } from '../../../../../lib/sup/curriculum'
import { Card } from '../../../../../components/Card'
import { Badge } from '../../../../../components/Badge'
import { StatusPill } from '../../../../../components/StatusPill'

/**
 * Ticket #13 practical mission attempt page: the Mission the module's Lessons END
 * into (the `ppg_read_practical` RPC — the bilingual scenario/requirements/expected
 * output, gated server-side: an ungated learner, a locked module returns `empty`,
 * never a hidden form), the upload form (the native POST to /api/submissions runs the
 * magic-byte + size gate SERVER-side; a wrong type / oversize yields the bilingual
 * error; the file + the reflection ride the private bucket + one row insert), the
 * submission history shown (the `ppg_submission_history` RPC — the version-preserving
 * append-only history, the CALLER's own rows only, each downloadable by the owner via
 * a short-lived signed URL), the status lifecycle notes (in_progress -> submitted ->
 * needs_improvement | approved; needs_improvement -> approved; the resubmit APPENDS a
 * NEW row; the +150 XP on approval is #14's job — this page states the seam, NEVER
 * awards now). `force-dynamic` because the page reads through the session JWT. Every
 * state (`practical.section`, `practical.states.*`, `practical.linkModule`,
 * `practical.linkMap`, `practical.fallbackSuspense`) has its own copy in `messages`.
 */
export const dynamic = 'force-dynamic'

async function PracticalAttempt({ moduleKey }: { moduleKey: string }) {
  const t = useTranslations('practical')
  const locale = useLocale()
  const state = await readPracticalMissionViaRpc(moduleKey)
  const history = await readSubmissionHistoryViaRpc(moduleKey)
  const lessons = await readLessonsViaRpc(moduleKey)
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  return (
    <section aria-label={t('section')}>
      {state.status === 'ok' && state.mission
        ? (
          <>
            <Card heading={t('scenarioHeading')} body={pick(state.mission.scenario_th, state.mission.scenario_en)} status="available" />
            <Card heading={t('requirementsHeading')} body={pick(state.mission.requirements_th, state.mission.requirements_en)} status="available" />
            <Card heading={t('expectedHeading')} body={pick(state.mission.expected_out_th, state.mission.expected_out_en)} status="available" />
            {lessons.status === 'ok' && lessons.lessons
              ? <p>{t('lessonsFlowNote')} {lessons.lessons.map((l) => pick(l.title_th, l.title_en)).join(', ')}</p>
              : null}
            <form method="POST" action="/api/submissions" data-ppg-submission-form="submission" aria-label={t('uploadLabel')}>
              <input name="module_key" defaultValue={moduleKey} hidden={true} />
              <input type="file" name="file" accept=".pptx,.ppt" />
              <input name="reflection" placeholder={t('reflectionPlaceholder')} />
              <button type="submit">{t('uploadLabel')}</button>
            </form>
            <p>{t('states.typeWrong')} {t('states.oversize')}</p>
            <p>
              <StatusPill tone="success" label={t('submittedState')} />
              <Badge text={t('xpSeamNote')} tone="success" />
            </p>
          </>
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
                  <td>{t('historyDownload')}</td>
                </tr>
              </thead>
              <tbody>
                {history.submissions.map((s) => (
                  <tr key={`${s.learner_id}-${s.mission_id}-${s.submission_seq}`} aria-label={`${t('historyRound')} ${s.submission_seq}, ${s.status}`}>
                    <td>{s.submission_seq}</td>
                    <td>{s.status}</td>
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

export default function PracticalPage({ params }: { params: { moduleKey: string } }) {
  const t = useTranslations('practical')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <PracticalAttempt moduleKey={params.moduleKey} />
    </Suspense>
  )
}