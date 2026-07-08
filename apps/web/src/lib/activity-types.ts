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
