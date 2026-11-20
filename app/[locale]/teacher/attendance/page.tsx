import { getLocale, getTranslations } from 'next-intl/server'

import { readOwnProfile } from '../../../../lib/sup/profile'
import { readCourseMapViaRpc } from '../../../../lib/sup/curriculum'
import { readAttendanceOverview } from '../../../../lib/sup/attendance'
import { listLearners } from '../../../../lib/sup/studentAdmin'
import { localIsoDate } from '../../../../lib/attendance'
import { AttendanceBoard, type AttendanceChapter } from '../../../../components/AttendanceBoard'

/**
 * PPGA #141 teacher attendance console (localized at /<locale>/teacher/attendance).
 *
 * The page's authority is the SERVER's session read: `readOwnProfile` decides
 * whether the console renders at all, and every read below re-checks the staff
 * gate at the RPC/RLS level. A learner who reaches the pathname sees an explicit
 * denial state, never the roster. The client's two actions are guarded again by
 * the attendance route and by the database RPCs. `force-dynamic` because every
 * read carries the session JWT.
 */
export const dynamic = 'force-dynamic'

export default async function TeacherAttendancePage() {
  const t = await getTranslations('attendance')
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

  const [overview, roster, courseMap] = await Promise.all([
    readAttendanceOverview(),
    listLearners(),
    readCourseMapViaRpc(),
  ])

  const chapters: AttendanceChapter[] = (courseMap.modules ?? [])
    .filter((module) => /^chapter-\d{2}$/.test(module.module_key))
    .map((module) => ({
      moduleKey: module.module_key,
      titleTh: module.title_th,
      titleEn: module.title_en,
    }))

  const locale: 'th' | 'en' = (await getLocale()) === 'th' ? 'th' : 'en'

  return (
    <AttendanceBoard
      status={overview.status}
      detail={overview.detail}
      sessions={overview.sessions}
      roster={(roster.rows ?? []).map((row) => ({
        id: row.id,
        studentId: row.student_id,
        fullName: row.full_name,
      }))}
      chapters={chapters}
      today={localIsoDate()}
      locale={locale}
    />
  )
}
