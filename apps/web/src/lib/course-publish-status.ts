export type CoursePublicationInput = {
  isPublished: boolean;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
};

export type CoursePublicationDisplayStatus = 'published' | 'scheduled' | 'unpublished';

export function getCoursePublicationDisplayStatus(
  course: CoursePublicationInput,
  now = new Date(),
): CoursePublicationDisplayStatus {
  if (!course.isPublished) return 'unpublished';

  const startsAt = course.startsAt ? new Date(course.startsAt) : null;
  const endsAt = course.endsAt ? new Date(course.endsAt) : null;

  if (endsAt && endsAt < now) return 'unpublished';
  if (startsAt && startsAt > now) return 'scheduled';

  return 'published';
}
