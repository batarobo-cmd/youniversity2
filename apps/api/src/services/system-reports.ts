import { and, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  activityEvents,
  loginEvents,
  securityEvents,
  users,
  courses,
  enrollments,
  scormPackages,
  lessons,
} from '../db/schema';
import { sixMonthsAgo, ensureLogRetention } from './user-logs';
import { getAdminHealth } from './health';

const ADMIN_AUDIT_EVENT_TYPES = [
  'user.created',
  'user.updated',
  'user.deleted',
  'user.suspended',
  'user.unsuspended',
  'user.system_admin_password_set',
  'auth.settings.updated',
  'system.settings.updated',
  'course.created',
  'course.updated',
  'course.published',
  'course.unpublished',
  'course.deleted',
  'category.created',
  'category.updated',
  'category.deleted',
  'enrollment.created',
  'enrollment.reactivated',
  'enrollment.revoked',
  'enrollment.suspended',
  'enrollment.unsuspended',
  'enrollment.deleted',
  'enrollment.progress_reset',
  'certificate.deleted',
  'auth.logout',
  'content_bank.renamed',
  'content_bank.unlinked',
  'content_bank.purged',
] as const;

export type ReportQuery = {
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

function parseDateStart(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDateEnd(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

function dateRange(options: ReportQuery) {
  const retentionStart = sixMonthsAgo();
  const fromDate = parseDateStart(options.from) ?? retentionStart;
  const effectiveFrom = fromDate < retentionStart ? retentionStart : fromDate;
  const toDate = parseDateEnd(options.to);
  return { effectiveFrom, toDate, retentionStart };
}

export async function getReportsOverview() {
  await ensureLogRetention();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const [
      audit24h,
      logins24h,
      authFailures24h,
      apiErrors24h,
      mediaOps24h,
      health,
      totalUsers,
      suspendedUsers,
      activeEnrollments,
      publishedCourses,
      scormPackageCount,
      activityCount,
    ] = await Promise.all([
    db
      .select({ total: count() })
      .from(activityEvents)
      .where(
        and(
          inArray(activityEvents.eventType, [...ADMIN_AUDIT_EVENT_TYPES]),
          gte(activityEvents.createdAt, since24h),
        ),
      ),
    db.select({ total: count() }).from(loginEvents).where(gte(loginEvents.createdAt, since24h)),
    db
      .select({ total: count() })
      .from(securityEvents)
      .where(
        and(
          inArray(securityEvents.category, ['auth', 'oauth']),
          eq(securityEvents.outcome, 'failure'),
          gte(securityEvents.createdAt, since24h),
        ),
      ),
    db
      .select({ total: count() })
      .from(securityEvents)
      .where(and(eq(securityEvents.category, 'api'), gte(securityEvents.createdAt, since24h))),
    db
      .select({ total: count() })
      .from(securityEvents)
      .where(and(eq(securityEvents.category, 'media'), gte(securityEvents.createdAt, since24h))),
    getAdminHealth(),
    db.select({ total: count() }).from(users).where(eq(users.isSuspended, false)),
    db.select({ total: count() }).from(users).where(eq(users.isSuspended, true)),
    db
      .select({ total: count() })
      .from(enrollments)
      .where(inArray(enrollments.status, ['active', 'completed'])),
    db.select({ total: count() }).from(courses).where(eq(courses.isPublished, true)),
    db.select({ total: count() }).from(scormPackages),
    db.select({ total: count() }).from(lessons),
  ]);

  const recentSecurity = await db
    .select()
    .from(securityEvents)
    .where(inArray(securityEvents.outcome, ['failure', 'blocked']))
    .orderBy(desc(securityEvents.createdAt))
    .limit(8);

  return {
    generatedAt: new Date().toISOString(),
    retentionFrom: sixMonthsAgo().toISOString(),
    retentionDays: 183,
    stats24h: {
      auditEvents: Number(audit24h[0]?.total ?? 0),
      successfulLogins: Number(logins24h[0]?.total ?? 0),
      authFailures: Number(authFailures24h[0]?.total ?? 0),
      apiErrors: Number(apiErrors24h[0]?.total ?? 0),
      mediaOperations: Number(mediaOps24h[0]?.total ?? 0),
    },
    platform: {
      totalUsers: Number(totalUsers[0]?.total ?? 0),
      suspendedUsers: Number(suspendedUsers[0]?.total ?? 0),
      activeEnrollments: Number(activeEnrollments[0]?.total ?? 0),
      publishedCourses: Number(publishedCourses[0]?.total ?? 0),
      scormPackages: Number(scormPackageCount[0]?.total ?? 0),
      activities: Number(activityCount[0]?.total ?? 0),
    },
    health: {
      ok: health.ok,
      checks: health.checks,
    },
    recentIncidents: recentSecurity.map((row) => ({
      id: row.id,
      category: row.category,
      eventType: row.eventType,
      outcome: row.outcome,
      reasonCode: row.reasonCode,
      occurredAt: row.createdAt.toISOString(),
    })),
  };
  } catch (err) {
    console.error('[reports] overview failed:', err);
    const health = await getAdminHealth();
    return {
      generatedAt: new Date().toISOString(),
      retentionFrom: sixMonthsAgo().toISOString(),
      retentionDays: 183,
      stats24h: {
        auditEvents: 0,
        successfulLogins: 0,
        authFailures: 0,
        apiErrors: 0,
        mediaOperations: 0,
      },
      platform: {
        totalUsers: 0,
        suspendedUsers: 0,
        activeEnrollments: 0,
        publishedCourses: 0,
        scormPackages: 0,
        activities: 0,
      },
      health: { ok: health.ok, checks: health.checks },
      recentIncidents: [],
      warning: 'security_events_table_missing',
    };
  }
}

export async function getAuditLog(options: ReportQuery) {
  await ensureLogRetention();
  const { effectiveFrom, toDate, retentionStart } = dateRange(options);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const conditions = [
    inArray(activityEvents.eventType, [...ADMIN_AUDIT_EVENT_TYPES]),
    gte(activityEvents.createdAt, effectiveFrom),
  ];
  if (toDate) conditions.push(lte(activityEvents.createdAt, toDate));

  const rows = await db
    .select({
      id: activityEvents.id,
      eventType: activityEvents.eventType,
      payload: activityEvents.payload,
      createdAt: activityEvents.createdAt,
      actorId: users.id,
      actorName: users.name,
      actorEmail: users.email,
      actorRole: users.role,
    })
    .from(activityEvents)
    .innerJoin(users, eq(activityEvents.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit)
    .offset(offset);

  let items = rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    occurredAt: r.createdAt.toISOString(),
    actor: {
      id: r.actorId,
      name: r.actorName,
      email: r.actorEmail,
      role: r.actorRole,
    },
    payload: r.payload as Record<string, unknown>,
  }));

  const q = options.q?.trim().toLowerCase();
  if (q) {
    items = items.filter((item) => {
      const haystack = [
        item.eventType,
        item.actor.name,
        item.actor.email,
        JSON.stringify(item.payload ?? {}),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  return { items, limit, offset, retentionFrom: retentionStart.toISOString() };
}

export async function getAuthSecurityEvents(options: ReportQuery) {
  await ensureLogRetention();
  const { effectiveFrom, toDate, retentionStart } = dateRange(options);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const loginConditions = [gte(loginEvents.createdAt, effectiveFrom)];
  if (toDate) loginConditions.push(lte(loginEvents.createdAt, toDate));

  const securityConditions = [
    inArray(securityEvents.category, ['auth', 'oauth']),
    gte(securityEvents.createdAt, effectiveFrom),
  ];
  if (toDate) securityConditions.push(lte(securityEvents.createdAt, toDate));

  const [successLogins, securityRows] = await Promise.all([
    db
      .select({
        id: loginEvents.id,
        method: loginEvents.method,
        createdAt: loginEvents.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(loginEvents)
      .innerJoin(users, eq(loginEvents.userId, users.id))
      .where(and(...loginConditions))
      .orderBy(desc(loginEvents.createdAt))
      .limit(500),
    db
      .select()
      .from(securityEvents)
      .where(and(...securityConditions))
      .orderBy(desc(securityEvents.createdAt))
      .limit(500),
  ]);

  let items = [
    ...successLogins.map((row) => ({
      id: `login-${row.id}`,
      kind: 'success' as const,
      eventType: 'auth.login.success',
      method: row.method,
      userName: row.userName,
      userEmail: row.userEmail,
      reasonCode: null as string | null,
      ipAddress: null as string | null,
      occurredAt: row.createdAt.toISOString(),
    })),
    ...securityRows.map((row) => ({
      id: row.id,
      kind: row.outcome === 'success' ? ('success' as const) : ('failure' as const),
      eventType: row.eventType,
      method: row.method,
      userName: null as string | null,
      userEmail: row.email,
      reasonCode: row.reasonCode,
      ipAddress: row.ipAddress,
      occurredAt: row.createdAt.toISOString(),
    })),
  ];

  items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const q = options.q?.trim().toLowerCase();
  if (q) {
    items = items.filter((item) => {
      const haystack = [
        item.eventType,
        item.method ?? '',
        item.userName ?? '',
        item.userEmail ?? '',
        item.reasonCode ?? '',
        item.ipAddress ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  const total = items.length;
  const page = items.slice(offset, offset + limit);
  return { items: page, total, limit, offset, retentionFrom: retentionStart.toISOString() };
}

export async function getAggregatedErrors(options: ReportQuery) {
  await ensureLogRetention();
  const { effectiveFrom, toDate, retentionStart } = dateRange(options);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const conditions = [
    eq(securityEvents.category, 'api'),
    gte(securityEvents.createdAt, effectiveFrom),
  ];
  if (toDate) conditions.push(lte(securityEvents.createdAt, toDate));

  const grouped = await db
    .select({
      eventType: securityEvents.eventType,
      reasonCode: securityEvents.reasonCode,
      total: count(),
      lastAt: sql<string>`max(${securityEvents.createdAt})`,
    })
    .from(securityEvents)
    .where(and(...conditions))
    .groupBy(securityEvents.eventType, securityEvents.reasonCode)
    .orderBy(desc(sql`max(${securityEvents.createdAt})`))
    .limit(limit)
    .offset(offset);

  const recent = await db
    .select()
    .from(securityEvents)
    .where(and(...conditions))
    .orderBy(desc(securityEvents.createdAt))
    .limit(20);

  return {
    aggregates: grouped.map((row) => ({
      eventType: row.eventType,
      reasonCode: row.reasonCode,
      count: Number(row.total),
      lastOccurredAt: new Date(row.lastAt).toISOString(),
    })),
    recent: recent.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      reasonCode: row.reasonCode,
      path: (row.payload as Record<string, unknown>)?.path as string | undefined,
      status: (row.payload as Record<string, unknown>)?.status as number | undefined,
      occurredAt: row.createdAt.toISOString(),
    })),
    limit,
    offset,
    retentionFrom: retentionStart.toISOString(),
  };
}

export async function getMediaOperations(options: ReportQuery) {
  await ensureLogRetention();
  const { effectiveFrom, toDate, retentionStart } = dateRange(options);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const conditions = [
    eq(securityEvents.category, 'media'),
    gte(securityEvents.createdAt, effectiveFrom),
  ];
  if (toDate) conditions.push(lte(securityEvents.createdAt, toDate));

  const rows = await db
    .select()
    .from(securityEvents)
    .where(and(...conditions))
    .orderBy(desc(securityEvents.createdAt))
    .limit(limit)
    .offset(offset);

  let items = rows.map((row) => ({
    id: row.id,
    eventType: row.eventType,
    outcome: row.outcome,
    reasonCode: row.reasonCode,
    occurredAt: row.createdAt.toISOString(),
    payload: row.payload as Record<string, unknown>,
  }));

  const q = options.q?.trim().toLowerCase();
  if (q) {
    items = items.filter((item) => {
      const haystack = [item.eventType, item.outcome, item.reasonCode ?? '', JSON.stringify(item.payload)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  return { items, limit, offset, retentionFrom: retentionStart.toISOString() };
}

export async function searchAuditForExport(options: ReportQuery) {
  const data = await getAuditLog({ ...options, limit: 500, offset: 0 });
  return data.items;
}

export async function searchAuthForExport(options: ReportQuery) {
  const data = await getAuthSecurityEvents({ ...options, limit: 500, offset: 0 });
  return data.items;
}

export async function searchErrorsForExport(options: ReportQuery) {
  const data = await getAggregatedErrors({ ...options, limit: 200, offset: 0 });
  return data.recent;
}
