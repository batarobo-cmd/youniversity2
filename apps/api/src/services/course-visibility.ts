type CourseVisibilityInput = {
  isPublished: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

export function isCourseVisibleToStudents(course: CourseVisibilityInput, now = new Date()): boolean {
  if (!course.isPublished) return false;
  if (course.startsAt && course.startsAt > now) return false;
  if (course.endsAt && course.endsAt < now) return false;
  return true;
}
