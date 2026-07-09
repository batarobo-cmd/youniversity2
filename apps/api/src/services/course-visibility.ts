type CourseVisibilityInput = {
  isPublished: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

export type CoursePublicationDisplayStatus = 'published' | 'scheduled' | 'unpublished';

export function getCoursePublicationDisplayStatus(
  course: CourseVisibilityInput,
  now = new Date(),
): CoursePublicationDisplayStatus {
  if (!course.isPublished) return 'unpublished';
  if (course.endsAt && course.endsAt < now) return 'unpublished';
  if (course.startsAt && course.startsAt > now) return 'scheduled';
  return 'published';
}

export function isCourseVisibleToStudents(course: CourseVisibilityInput, now = new Date()): boolean {
  if (!course.isPublished) return false;
  if (course.startsAt && course.startsAt > now) return false;
  if (course.endsAt && course.endsAt < now) return false;
  return true;
}

export function isCoursePublishedForStudents(course: Pick<CourseVisibilityInput, 'isPublished'>): boolean {
  return course.isPublished;
}
