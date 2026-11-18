import { getTranslations } from 'next-intl/server'

import { readOwnProfile } from '../../../../lib/sup/profile'
import { listLearners } from '../../../../lib/sup/studentAdmin'
import { StudentAdmin } from '../../../../components/StudentAdmin'

/**
 * Teacher/Admin student management (localized at /<locale>/teacher/students).
 *
 * The page's authority is the SERVER's session read: `readOwnProfile` (the
 * caller's own row through the request JWT + RLS) decides whether the roster
 * renders at all, and `listLearners` re-checks the staff gate before its
 * read. A learner who reaches the pathname sees an explicit denial state,
 * never a blank screen and never the roster. The client component's actions
 * are guarded again by the three API routes. `force-dynamic` because every
 * read carries the session JWT.
 */
export const dynamic = 'force-dynamic'

export default async function TeacherStudentsPage() {
  const t = await getTranslations('studentAdmin')
  const profile = await readOwnProfile()
  const role = profile.status === 'ok' ? profile.row?.role : undefined

  if (role !== 'teacher' && role !== 'admin') {
    const copy =
      profile.status === 'not-configured'
        ? t('states.notConfigured')
        : profile.status === 'unauthorized'
          ? t('states.unauthorized')
          : t('states.denied')
    return (
      <div className="ppg-page-wrap">
        <div className="ppg-work-head">
          <h1 className="ppg-heading ppg-heading-text ppg-work-head-title">{t('title')}</h1>
        </div>
        <div className="ppg-work-card">
          <p className="ppg-state-line" role="alert">{copy}</p>
        </div>
      </div>
    )
  }

  const state = await listLearners()

  return (
    <StudentAdmin
      rows={state.rows ?? []}
      status={state.status}
      detail={state.detail}
    />
  )
}
