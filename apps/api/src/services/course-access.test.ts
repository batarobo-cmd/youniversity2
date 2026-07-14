import { describe, expect, test } from 'bun:test';
import {
  canStudentOpenCourse,
  canStudentOpenEnrollment,
  isEnrollmentListedForStudent,
  isStaff,
} from './course-access';

describe('isStaff', () => {
  test('admin and system_admin are staff', () => {
    expect(isStaff({ id: '1', email: 'a@x', role: 'admin', name: 'A' })).toBe(true);
    expect(isStaff({ id: '2', email: 's@x', role: 'system_admin', name: 'S' })).toBe(true);
  });

  test('instructor and student are not staff', () => {
    expect(isStaff({ id: '3', email: 'i@x', role: 'instructor', name: 'I' })).toBe(false);
    expect(isStaff({ id: '4', email: 't@x', role: 'student', name: 'T' })).toBe(false);
  });
});

describe('canStudentOpenCourse', () => {
  test('allows active and completed enrollments', () => {
    expect(canStudentOpenCourse('active')).toBe(true);
    expect(canStudentOpenCourse('completed')).toBe(true);
  });

  test('blocks revoked and suspended', () => {
    expect(canStudentOpenCourse('revoked')).toBe(false);
    expect(canStudentOpenCourse('suspended')).toBe(false);
    expect(canStudentOpenCourse(undefined)).toBe(false);
  });
});

describe('canStudentOpenEnrollment', () => {
  test('active enrollment is always open', () => {
    expect(canStudentOpenEnrollment('active', false)).toBe(true);
    expect(canStudentOpenEnrollment('active', true)).toBe(true);
  });

  test('completed enrollment requires certificate', () => {
    expect(canStudentOpenEnrollment('completed', true)).toBe(true);
    expect(canStudentOpenEnrollment('completed', false)).toBe(false);
  });

  test('failed enrollment stays closed', () => {
    expect(canStudentOpenEnrollment('failed', true)).toBe(false);
  });
});

describe('isEnrollmentListedForStudent', () => {
  test('mirrors open-course statuses', () => {
    expect(isEnrollmentListedForStudent('active')).toBe(true);
    expect(isEnrollmentListedForStudent('expired')).toBe(false);
  });
});
