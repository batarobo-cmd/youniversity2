import { and, eq, gte, isNotNull, lte, or } from 'drizzle-orm';
import { WS_EVENTS } from '@youniversity2/shared';
import { db } from '../db';
import { courses } from '../db/schema';
import { broadcastToCourseEnrollees } from '../realtime/hub';
import { sendCoursePublicationEmails } from './course-email-notify';

const POLL_INTERVAL_MS = 10_000;
const TRANSITION_WINDOW_MS = 15_000;

const notifiedTransitions = new Set<string>();

function transitionKey(courseId: string, kind: 'start' | 'end', at: Date) {
  return `${courseId}:${kind}:${at.toISOString()}`;
}

async function notifyPublicationTransition(courseId: string, kind: 'start' | 'end') {
  const message = {
    type: WS_EVENTS.COURSE_UPDATED,
    payload: { courseId, action: `publication_${kind}` },
    timestamp: new Date().toISOString(),
  };

  await broadcastToCourseEnrollees(courseId, message);
}

async function pollPublicationTransitions() {
  const now = new Date();
  const windowStart = new Date(now.getTime() - TRANSITION_WINDOW_MS);

  const rows = await db
    .select()
    .from(courses)
    .where(
      and(
        eq(courses.isPublished, true),
        or(
          and(isNotNull(courses.startsAt), gte(courses.startsAt, windowStart), lte(courses.startsAt, now)),
          and(isNotNull(courses.endsAt), gte(courses.endsAt, windowStart), lte(courses.endsAt, now)),
        ),
      ),
    );

  for (const course of rows) {
    if (course.startsAt && course.startsAt >= windowStart && course.startsAt <= now) {
      const key = transitionKey(course.id, 'start', course.startsAt);
      if (notifiedTransitions.has(key)) continue;
      notifiedTransitions.add(key);
      await notifyPublicationTransition(course.id, 'start');
      await sendCoursePublicationEmails(course, 'start');
    }

    if (course.endsAt && course.endsAt >= windowStart && course.endsAt <= now) {
      const key = transitionKey(course.id, 'end', course.endsAt);
      if (notifiedTransitions.has(key)) continue;
      notifiedTransitions.add(key);
      await notifyPublicationTransition(course.id, 'end');
      await sendCoursePublicationEmails(course, 'end');
    }
  }

  if (notifiedTransitions.size > 1000) {
    notifiedTransitions.clear();
  }
}

export function startPublicationScheduler() {
  void pollPublicationTransitions();
  setInterval(() => {
    void pollPublicationTransitions();
  }, POLL_INTERVAL_MS);
}
