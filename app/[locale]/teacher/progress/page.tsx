import { TeacherChapterProgress } from '../../../../components/TeacherChapterProgress'

/** PPGA #86: the Teacher/Admin chapter-progress view (the review queue's
 * replacement). `force-dynamic` because the reads carry the session JWT. */
export const dynamic = 'force-dynamic'

export default async function TeacherProgressPage() {
  return <TeacherChapterProgress />
}
