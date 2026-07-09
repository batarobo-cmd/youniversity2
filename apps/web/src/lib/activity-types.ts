import { ACTIVITY_TYPES, type ActivityType } from '@youniversity2/shared';

export { ACTIVITY_TYPES };

export function normalizeActivityType(type: string): ActivityType | string {
  if (type === 'quiz') return 'test';
  if (type === 'embed') return 'video';
  return type;
}

export function moduleActivities(mod: {
  activities?: unknown[];
  lessons?: unknown[];
}): Array<Record<string, unknown>> {
  const list = mod.activities ?? mod.lessons ?? [];
  return list as Array<Record<string, unknown>>;
}

export function isEvaluableActivity(activity: { type?: string }) {
  return normalizeActivityType(activity.type ?? '') !== 'text';
}

export function countsForCourseCompletion(activity: { type?: string; isRequired?: boolean }) {
  return isEvaluableActivity(activity) && activity.isRequired !== false;
}

export function isProgressFullyComplete(progress?: {
  isComplete?: boolean;
  percentComplete?: number;
} | null) {
  if (!progress?.isComplete) return false;
  return Number(progress.percentComplete ?? 0) >= 100;
}
