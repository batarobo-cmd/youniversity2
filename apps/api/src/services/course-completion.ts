import type { lessons, lessonProgress } from '../db/schema';

type LessonRow = typeof lessons.$inferSelect;
type ProgressRow = typeof lessonProgress.$inferSelect;

export function isEvaluableLesson(lesson: Pick<LessonRow, 'type'>) {
  return lesson.type !== 'text';
}

export function countsForCourseCompletion(lesson: Pick<LessonRow, 'type' | 'isRequired'>) {
  return isEvaluableLesson(lesson) && lesson.isRequired;
}

export function isProgressFullyComplete(progress?: Pick<ProgressRow, 'isComplete' | 'percentComplete'> | null) {
  if (!progress?.isComplete) return false;
  return progress.percentComplete >= 100;
}
