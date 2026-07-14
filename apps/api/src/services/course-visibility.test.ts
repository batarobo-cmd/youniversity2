import { describe, expect, test } from 'bun:test';
import {
  getCoursePublicationDisplayStatus,
  isCourseVisibleToStudents,
} from './course-visibility';

const now = new Date('2026-07-14T12:00:00.000Z');

describe('isCourseVisibleToStudents', () => {
  test('unpublished course is hidden', () => {
    expect(
      isCourseVisibleToStudents({ isPublished: false, startsAt: null, endsAt: null }, now),
    ).toBe(false);
  });

  test('scheduled course before start is hidden', () => {
    expect(
      isCourseVisibleToStudents(
        {
          isPublished: true,
          startsAt: new Date('2026-07-15T00:00:00.000Z'),
          endsAt: null,
        },
        now,
      ),
    ).toBe(false);
  });

  test('expired course after end is hidden', () => {
    expect(
      isCourseVisibleToStudents(
        {
          isPublished: true,
          startsAt: null,
          endsAt: new Date('2026-07-13T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe(false);
  });

  test('published course in window is visible', () => {
    expect(
      isCourseVisibleToStudents(
        {
          isPublished: true,
          startsAt: new Date('2026-07-01T00:00:00.000Z'),
          endsAt: new Date('2026-07-31T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe(true);
  });
});

describe('getCoursePublicationDisplayStatus', () => {
  test('returns scheduled for future start', () => {
    expect(
      getCoursePublicationDisplayStatus(
        {
          isPublished: true,
          startsAt: new Date('2026-07-20T00:00:00.000Z'),
          endsAt: null,
        },
        now,
      ),
    ).toBe('scheduled');
  });
});
