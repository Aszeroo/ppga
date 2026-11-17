import { TeacherChapterProgress } from '../../../../components/TeacherChapterProgress'

/**
 * PPGA #86: the old `teacher/review` route now renders chapter progress. The
 * worksheet review queue left the journey (#85); bookmarks reach real course
 * state instead of a dead queue. `force-dynamic` because the reads carry the
 * session JWT.
 */
export const dynamic = 'force-dynamic'

export default async function TeacherReviewPage() {
  return <TeacherChapterProgress />
}
