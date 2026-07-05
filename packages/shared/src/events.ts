import type { ActivityEvent } from './types';

/** WebSocket event types for realtime sync */
export const WS_EVENTS = {
  // Client → Server
  ACTIVITY: 'activity',
  JOIN_COURSE: 'join_course',
  JOIN_ADMIN: 'join_admin',
  LEAVE_ROOM: 'leave_room',

  // Server → Client
  ACTIVITY_BROADCAST: 'activity_broadcast',
  COURSE_UPDATED: 'course_updated',
  ENROLLMENT_CHANGED: 'enrollment_changed',
  PROGRESS_UPDATED: 'progress_updated',
  COMPLETION_EVALUATED: 'completion_evaluated',
  PRESENCE: 'presence',
} as const;

export type WsEventType = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

export interface WsMessage<T = unknown> {
  type: WsEventType;
  payload: T;
  timestamp: string;
}

export interface ActivityPayload {
  eventType: string;
  courseId?: string;
  lessonId?: string;
  data?: Record<string, unknown>;
}

export interface ActivityBroadcastPayload {
  event: ActivityEvent;
  userName: string;
}

export interface ProgressUpdatedPayload {
  userId: string;
  lessonId: string;
  courseId: string;
  percentComplete: number;
  isComplete: boolean;
  score?: number;
}

export interface CompletionEvaluatedPayload {
  userId: string;
  courseId: string;
  status: 'completed' | 'failed';
  enrollmentId: string;
}

export interface PresencePayload {
  userId: string;
  userName: string;
  courseId: string;
  lessonId?: string;
  online: boolean;
}
