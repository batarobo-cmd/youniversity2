import { Hono } from 'hono';
import { eq, desc, or, ilike, and, gte, lte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import {
  users,
  loginEvents,
  enrollments,
  courses,
  courseTranslations,
  certificates,
} from '../db/schema';
import { getUserLogs } from '../services/user-logs';
import { recordUserActivity } from '../services/activity-log';
import { authMiddleware, requireRole, type AuthUser } from '../middleware/auth';
import { USER_ROLES, SUPPORTED_LOCALES, isSystemAdminRole } from '@youniversity2/shared';
import { getAdminAuthSettings, updateAuthSettings } from '../services/auth-settings';
import { getSystemSettings, updateSystemSettings } from '../services/system-settings';
import {
  canAssignSystemAdminRole,
  validateActiveSystemAdminRemains,
  validateRoleChange,
  validateSystemAdminRemains,
  LAST_SYSTEM_ADMIN_ERROR,
  LAST_ACTIVE_SYSTEM_ADMIN_ERROR,
} from '../services/user-role-policy';
import { broadcastToUser, broadcastToAdmin } from '../realtime/hub';
import { WS_EVENTS } from '@youniversity2/shared';
import { updateSessionRoleForUser } from '../services/session';
import { adminReportsRoutes } from './admin-reports';
import { contentBankRoutes } from './content-bank';

export const adminRoutes = new Hono();

adminRoutes.route('/reports', adminReportsRoutes);
adminRoutes.route('/content-bank', contentBankRoutes);

adminRoutes.use('*', authMiddleware);

function notifyUsersUpdated(
  action: 'created' | 'updated' | 'deleted',
  userId: string,
  actorId: string,
  role?: string,
) {
  broadcastToAdmin({
    type: WS_EVENTS.USERS_UPDATED,
    payload: { action, userId, actorId, role },
    timestamp: new Date().toISOString(),
  });
}

function serializeAdminUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    preferredLocale: user.preferredLocale,
    avatarUrl: user.avatarUrl ?? undefined,
    oauthProvider: user.oauthProvider ?? undefined,
    hasPassword: Boolean(user.passwordHash),
    hasSystemAdminPassword: Boolean(user.systemAdminPasswordHash),
    isSuspended: user.isSuspended,
    givenName: user.givenName ?? undefined,
    familyName: user.familyName ?? undefined,
    jobTitle: user.jobTitle ?? undefined,
    department: user.department ?? undefined,
    employeeId: user.employeeId ?? undefined,
    companyName: user.companyName ?? undefined,
    companyDomain: user.companyDomain ?? undefined,
    officeLocation: user.officeLocation ?? undefined,
    mobilePhone: user.mobilePhone ?? undefined,
    businessPhone: user.businessPhone ?? undefined,
    city: user.city ?? undefined,
    country: user.country ?? undefined,
    profileSyncedAt: user.profileSyncedAt?.toISOString(),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

adminRoutes.get('/students', requireRole('admin'), async (c) => {
  const q = c.req.query('q')?.trim();

  if (q !== undefined && q.length < 2) {
    return c.json([]);
  }

  const conditions = [
    inArray(users.role, ['student', 'admin', 'system_admin']),
    eq(users.isSuspended, false),
  ];
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(or(ilike(users.name, pattern), ilike(users.email, pattern))!);
  }

  const students = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(and(...conditions))
    .orderBy(users.name)
    .limit(q ? 20 : 100);

  return c.json(students);
});

const historyQuerySchema = z.object({
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

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

adminRoutes.get('/registrations/history', requireRole('admin'), async (c) => {
  const parsed = historyQuerySchema.safeParse({
    q: c.req.query('q'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  });
  if (!parsed.success) return c.json({ error: 'Invalid query' }, 400);

  const { q, from, to, limit, offset } = parsed.data;
  const conditions = [];
  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);
  if (q?.trim()) {
    const pattern = `%${q.trim()}%`;
    conditions.push(or(ilike(users.name, pattern), ilike(users.email, pattern))!);
  }
  if (fromDate) conditions.push(gte(users.createdAt, fromDate));
  if (toDate) conditions.push(lte(users.createdAt, toDate));

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      userName: r.name,
      userEmail: r.email,
      role: r.role,
      registeredAt: r.createdAt.toISOString(),
    })),
    limit,
    offset,
  });
});

adminRoutes.get('/logins/history', requireRole('admin'), async (c) => {
  const parsed = historyQuerySchema.safeParse({
    q: c.req.query('q'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  });
  if (!parsed.success) return c.json({ error: 'Invalid query' }, 400);

  const { q, from, to, limit, offset } = parsed.data;
  const conditions = [];
  const fromDate = parseDateStart(from);
  const toDate = parseDateEnd(to);
  if (q?.trim()) {
    const pattern = `%${q.trim()}%`;
    conditions.push(or(ilike(users.name, pattern), ilike(users.email, pattern))!);
  }
  if (fromDate) conditions.push(gte(loginEvents.createdAt, fromDate));
  if (toDate) conditions.push(lte(loginEvents.createdAt, toDate));

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: loginEvents.id,
      method: loginEvents.method,
      createdAt: loginEvents.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(loginEvents)
    .innerJoin(users, eq(loginEvents.userId, users.id))
    .where(whereClause)
    .orderBy(desc(loginEvents.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      userName: r.userName,
      userEmail: r.userEmail,
      method: r.method,
      loggedInAt: r.createdAt.toISOString(),
    })),
    limit,
    offset,
  });
});

adminRoutes.get('/users/:id/logs', requireRole('admin'), async (c) => {
  const userId = c.req.param('id');
  const locale = c.req.query('locale') ?? 'sk';

  const [user] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const parsed = historyQuerySchema.safeParse({
    q: c.req.query('q'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  });
  if (!parsed.success) return c.json({ error: 'Invalid query' }, 400);

  const data = await getUserLogs(userId, locale, parsed.data);
  return c.json({ userName: user.name, ...data });
});

adminRoutes.get('/users', requireRole('admin'), async (c) => {
  const locale = c.req.query('locale') ?? 'sk';
  const list = await db.select().from(users).orderBy(desc(users.createdAt));

  const userIds = list.map((u) => u.id);
  const enrollmentMap = new Map<
    string,
    Array<{
      courseId: string;
      courseTitle: string;
      status: string;
      enrolledAt: string;
    }>
  >();

  const certificateMap = new Map<
    string,
    Array<{
      id: string;
      certificateNumber: string;
      issuedAt: string;
      courseId: string;
      courseTitle: string;
    }>
  >();

  if (userIds.length > 0) {
    const rows = await db
      .select({
        userId: enrollments.userId,
        courseId: enrollments.courseId,
        status: enrollments.status,
        enrolledAt: enrollments.enrolledAt,
        courseSlug: courses.slug,
        courseTitle: courseTranslations.title,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .leftJoin(
        courseTranslations,
        and(eq(courseTranslations.courseId, courses.id), eq(courseTranslations.locale, locale)),
      )
      .where(
        and(
          inArray(enrollments.userId, userIds),
          inArray(enrollments.status, ['active', 'suspended']),
        ),
      )
      .orderBy(desc(enrollments.enrolledAt));

    for (const row of rows) {
      const items = enrollmentMap.get(row.userId) ?? [];
      items.push({
        courseId: row.courseId,
        courseTitle: row.courseTitle ?? row.courseSlug,
        status: row.status,
        enrolledAt: row.enrolledAt.toISOString(),
      });
      enrollmentMap.set(row.userId, items);
    }

    const certRows = await db
      .select({
        userId: certificates.userId,
        id: certificates.id,
        certificateNumber: certificates.certificateNumber,
        issuedAt: certificates.issuedAt,
        courseId: certificates.courseId,
        courseSlug: courses.slug,
        courseTitle: courseTranslations.title,
      })
      .from(certificates)
      .innerJoin(courses, eq(certificates.courseId, courses.id))
      .leftJoin(
        courseTranslations,
        and(eq(courseTranslations.courseId, courses.id), eq(courseTranslations.locale, locale)),
      )
      .where(inArray(certificates.userId, userIds))
      .orderBy(desc(certificates.issuedAt));

    for (const row of certRows) {
      const items = certificateMap.get(row.userId) ?? [];
      items.push({
        id: row.id,
        certificateNumber: row.certificateNumber,
        issuedAt: row.issuedAt.toISOString(),
        courseId: row.courseId,
        courseTitle: row.courseTitle ?? row.courseSlug,
      });
      certificateMap.set(row.userId, items);
    }
  }

  return c.json(
    list.map((user) => ({
      ...serializeAdminUser(user),
      enrollments: enrollmentMap.get(user.id) ?? [],
      certificates: certificateMap.get(user.id) ?? [],
    })),
  );
});

adminRoutes.post('/users', requireRole('admin'), async (c) => {
  const body = z
    .object({
      email: z.string().email(),
      name: z.string().min(2).max(255),
      password: z.string().min(8),
      role: z.enum(USER_ROLES).default('student'),
      preferredLocale: z.enum(SUPPORTED_LOCALES).default('sk'),
      givenName: z.string().max(255).optional().nullable(),
      familyName: z.string().max(255).optional().nullable(),
      jobTitle: z.string().max(255).optional().nullable(),
      department: z.string().max(255).optional().nullable(),
      employeeId: z.string().max(64).optional().nullable(),
      companyName: z.string().max(255).optional().nullable(),
      officeLocation: z.string().max(255).optional().nullable(),
      mobilePhone: z.string().max(64).optional().nullable(),
      businessPhone: z.string().max(64).optional().nullable(),
      city: z.string().max(128).optional().nullable(),
      country: z.string().max(128).optional().nullable(),
    })
    .safeParse(await c.req.json());

  if (!body.success) return c.json({ error: 'Invalid input', details: body.error.flatten() }, 400);

  const authUser = c.get('user') as AuthUser;
  if (body.data.role === 'system_admin' && !canAssignSystemAdminRole(authUser.role)) {
    return c.json({ error: 'Only system administrators can create system admin accounts' }, 403);
  }

  const existing = await db.select().from(users).where(eq(users.email, body.data.email)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: 'Email already registered' }, 409);
  }

  const passwordHash = await bcrypt.hash(body.data.password, 12);
  let systemAdminPasswordHash: string | null | undefined;
  if (body.data.role === 'system_admin') {
    const roleCheck = await validateRoleChange({
      actorRole: authUser.role,
      targetUserId: 'new',
      targetCurrentRole: 'student',
      newRole: 'system_admin',
      targetSystemAdminPasswordHash: null,
    });
    if (!roleCheck.ok) return c.json({ error: roleCheck.error }, roleCheck.status);
    systemAdminPasswordHash = null;
  }

  const profileFields = [
    'givenName',
    'familyName',
    'jobTitle',
    'department',
    'employeeId',
    'companyName',
    'officeLocation',
    'mobilePhone',
    'businessPhone',
    'city',
    'country',
  ] as const;

  const values: typeof users.$inferInsert = {
    email: body.data.email,
    name: body.data.name,
    passwordHash,
    role: body.data.role,
    preferredLocale: body.data.preferredLocale,
  };
  if (systemAdminPasswordHash !== undefined) {
    values.systemAdminPasswordHash = systemAdminPasswordHash;
  }
  for (const field of profileFields) {
    if (body.data[field] !== undefined) {
      values[field] = body.data[field] || null;
    }
  }

  const [created] = await db.insert(users).values(values).returning();

  void recordUserActivity(authUser.id, 'user.created', {
    payload: {
      targetId: created.id,
      targetName: created.name,
      targetEmail: created.email,
      role: created.role,
    },
  });

  if (created.role === 'system_admin') {
    broadcastToUser(created.id, {
      type: WS_EVENTS.USER_PROFILE_UPDATED,
      payload: {
        role: created.role,
        needsSystemAdminPassword: !created.systemAdminPasswordHash,
      },
      timestamp: new Date().toISOString(),
    });
  }

  notifyUsersUpdated('created', created.id, authUser.id, created.role);

  return c.json(serializeAdminUser(created), 201);
});

adminRoutes.patch('/users/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const authUser = c.get('user') as AuthUser;

  const body = z
    .object({
      email: z.string().email().optional(),
      name: z.string().min(2).max(255).optional(),
      role: z.enum(USER_ROLES).optional(),
      preferredLocale: z.enum(SUPPORTED_LOCALES).optional(),
      password: z.string().min(8).optional(),
      systemAdminPassword: z.string().min(1).optional(),
      isSuspended: z.boolean().optional(),
      givenName: z.string().max(255).optional().nullable(),
      familyName: z.string().max(255).optional().nullable(),
      jobTitle: z.string().max(255).optional().nullable(),
      department: z.string().max(255).optional().nullable(),
      employeeId: z.string().max(64).optional().nullable(),
      companyName: z.string().max(255).optional().nullable(),
      officeLocation: z.string().max(255).optional().nullable(),
      mobilePhone: z.string().max(64).optional().nullable(),
      businessPhone: z.string().max(64).optional().nullable(),
      city: z.string().max(128).optional().nullable(),
      country: z.string().max(128).optional().nullable(),
    })
    .safeParse(await c.req.json());

  if (!body.success) return c.json({ error: 'Invalid input', details: body.error.flatten() }, 400);

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return c.json({ error: 'User not found' }, 404);

  if (body.data.email && body.data.email !== existing.email) {
    const dup = await db.select().from(users).where(eq(users.email, body.data.email)).limit(1);
    if (dup.length > 0) return c.json({ error: 'Email already registered' }, 409);
  }

  if (id === authUser.id && body.data.isSuspended === true) {
    return c.json({ error: 'Cannot suspend your own account' }, 400);
  }

  if (
    existing.role === 'system_admin' &&
    body.data.isSuspended === true &&
    !isSystemAdminRole(authUser.role)
  ) {
    return c.json(
      { error: 'Only system administrators can suspend system administrator accounts' },
      403,
    );
  }

  if (body.data.isSuspended === true) {
    const suspendCheck = await validateActiveSystemAdminRemains({
      targetUserId: id,
      currentRole: existing.role,
      currentlySuspended: existing.isSuspended,
      willSuspend: true,
    });
    if (!suspendCheck.ok) return c.json({ error: suspendCheck.error }, suspendCheck.status);
  }

  const updates: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (body.data.role && body.data.role !== existing.role) {
    const roleCheck = await validateRoleChange({
      actorUserId: authUser.id,
      actorRole: authUser.role,
      targetUserId: id,
      targetCurrentRole: existing.role,
      newRole: body.data.role,
      systemAdminPassword: body.data.systemAdminPassword,
      targetSystemAdminPasswordHash: existing.systemAdminPasswordHash,
    });
    if (!roleCheck.ok) return c.json({ error: roleCheck.error }, roleCheck.status);
    updates.role = body.data.role;
    if (roleCheck.systemAdminPasswordHash !== undefined) {
      updates.systemAdminPasswordHash = roleCheck.systemAdminPasswordHash;
    }
  }
  if (body.data.email) updates.email = body.data.email;
  if (body.data.name) updates.name = body.data.name;
  if (body.data.preferredLocale) updates.preferredLocale = body.data.preferredLocale;
  if (body.data.password) updates.passwordHash = await bcrypt.hash(body.data.password, 12);
  if (body.data.isSuspended !== undefined) updates.isSuspended = body.data.isSuspended;

  const profileFields = [
    'givenName',
    'familyName',
    'jobTitle',
    'department',
    'employeeId',
    'companyName',
    'officeLocation',
    'mobilePhone',
    'businessPhone',
    'city',
    'country',
  ] as const;
  for (const field of profileFields) {
    if (body.data[field] !== undefined) {
      updates[field] = body.data[field] || null;
    }
  }

  const updatedResult = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(users).where(eq(users.id, id)).for('update');
    if (!locked) throw new Error('User not found');

    const touchesSystemAdminPool =
      (updates.role && updates.role !== locked.role &&
        (locked.role === 'system_admin' || updates.role === 'system_admin')) ||
      (updates.isSuspended === true &&
        !locked.isSuspended &&
        locked.role === 'system_admin');

    if (touchesSystemAdminPool) {
      await tx.select({ id: users.id }).from(users).where(eq(users.role, 'system_admin')).for('update');
    }

    if (updates.role && updates.role !== locked.role) {
      const remainsCheck = await validateSystemAdminRemains({
        targetUserId: id,
        currentRole: locked.role,
        newRole: updates.role,
      });
      if (!remainsCheck.ok) throw new Error(remainsCheck.error);
    }

    if (updates.isSuspended === true && !locked.isSuspended) {
      const suspendCheck = await validateActiveSystemAdminRemains({
        targetUserId: id,
        currentRole: locked.role,
        currentlySuspended: locked.isSuspended,
        willSuspend: true,
      });
      if (!suspendCheck.ok) throw new Error(suspendCheck.error);
    }

    const [row] = await tx.update(users).set(updates).where(eq(users.id, id)).returning();
    return row ?? null;
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : 'Update failed';
    if (
      message === LAST_SYSTEM_ADMIN_ERROR ||
      message === LAST_ACTIVE_SYSTEM_ADMIN_ERROR ||
      message === 'User not found'
    ) {
      return null;
    }
    throw err;
  });

  const updated = updatedResult;

  if (!updated) {
    const roleDemotion =
      body.data.role && body.data.role !== existing.role && existing.role === 'system_admin';
    const suspendAttempt = body.data.isSuspended === true && !existing.isSuspended;
    if (roleDemotion) {
      return c.json({ error: LAST_SYSTEM_ADMIN_ERROR }, 400);
    }
    if (suspendAttempt) {
      return c.json({ error: LAST_ACTIVE_SYSTEM_ADMIN_ERROR }, 400);
    }
    return c.json({ error: 'User not found' }, 404);
  }

  if (body.data.role && body.data.role !== existing.role) {
    await updateSessionRoleForUser(updated.id, updated.role);
    broadcastToUser(updated.id, {
      type: WS_EVENTS.USER_PROFILE_UPDATED,
      payload: {
        role: updated.role,
        needsSystemAdminPassword:
          updated.role === 'system_admin' && !updated.systemAdminPasswordHash,
      },
      timestamp: new Date().toISOString(),
    });
  }

  notifyUsersUpdated('updated', updated.id, authUser.id, updated.role);

  const suspensionChanged =
    body.data.isSuspended !== undefined && body.data.isSuspended !== existing.isSuspended;

  if (suspensionChanged) {
    void recordUserActivity(
      authUser.id,
      body.data.isSuspended ? 'user.suspended' : 'user.unsuspended',
      {
        payload: {
          targetId: updated.id,
          targetName: updated.name,
          targetEmail: updated.email,
        },
      },
    );
  } else {
    void recordUserActivity(authUser.id, 'user.updated', {
      payload: {
        targetId: updated.id,
        targetName: updated.name,
        targetEmail: updated.email,
        fields: Object.keys(body.data),
      },
    });
  }

  return c.json(serializeAdminUser(updated));
});

adminRoutes.delete('/users/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const authUser = c.get('user') as AuthUser;

  if (id === authUser.id) {
    return c.json({ error: 'Cannot delete your own account' }, 400);
  }

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return c.json({ error: 'User not found' }, 404);

  if (existing.role === 'system_admin') {
    if (!isSystemAdminRole(authUser.role)) {
      return c.json(
        { error: 'Only system administrators can delete system administrator accounts' },
        403,
      );
    }
    const remainsCheck = await validateSystemAdminRemains({
      targetUserId: existing.id,
      currentRole: existing.role,
      deleteUser: true,
    });
    if (!remainsCheck.ok) {
      return c.json({ error: remainsCheck.error }, remainsCheck.status);
    }
  }

  const deleted = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(users).where(eq(users.id, id)).for('update');
    if (!locked) return null;

    if (locked.role === 'system_admin') {
      await tx.select({ id: users.id }).from(users).where(eq(users.role, 'system_admin')).for('update');
      const remainsCheck = await validateSystemAdminRemains({
        targetUserId: locked.id,
        currentRole: locked.role,
        deleteUser: true,
      });
      if (!remainsCheck.ok) throw new Error(remainsCheck.error);
    }

    const [row] = await tx.delete(users).where(eq(users.id, id)).returning();
    return row ?? null;
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : 'Delete failed';
    if (message === LAST_SYSTEM_ADMIN_ERROR) return 'blocked' as const;
    throw err;
  });

  if (deleted === 'blocked') {
    return c.json({ error: LAST_SYSTEM_ADMIN_ERROR }, 400);
  }
  if (!deleted) return c.json({ error: 'User not found' }, 404);

  void recordUserActivity(authUser.id, 'user.deleted', {
    payload: {
      targetId: deleted.id,
      targetName: deleted.name,
      targetEmail: deleted.email,
    },
  });

  notifyUsersUpdated('deleted', deleted.id, authUser.id, deleted.role);

  return c.json({ ok: true });
});

adminRoutes.get('/auth-settings', requireRole('admin'), async (c) => {
  return c.json(await getAdminAuthSettings());
});

adminRoutes.patch('/auth-settings', requireRole('admin'), async (c) => {
  const body = z
    .object({
      manualLoginEnabled: z.boolean().optional(),
      manualRegistrationEnabled: z.boolean().optional(),
      allowedLoginDomains: z.array(z.string()).optional(),
      allowedRegistrationDomains: z.array(z.string()).optional(),
      google: z
        .object({
          enabled: z.boolean().optional(),
          clientId: z.string().optional(),
          clientSecret: z.string().optional(),
        })
        .optional(),
      microsoft: z
        .object({
          enabled: z.boolean().optional(),
          clientId: z.string().optional(),
          clientSecret: z.string().optional(),
          tenantId: z.string().optional(),
        })
        .optional(),
    })
    .safeParse(await c.req.json());

  if (!body.success) return c.json({ error: 'Invalid input', details: body.error.flatten() }, 400);

  const authUser = c.get('user') as AuthUser;
  const updated = await updateAuthSettings(body.data);
  void recordUserActivity(authUser.id, 'auth.settings.updated', {
    payload: { fields: Object.keys(body.data) },
  });
  return c.json(updated);
});

adminRoutes.get('/system-settings', requireRole('admin'), async (c) => {
  try {
    return c.json(await getSystemSettings());
  } catch (err) {
    console.error('[admin] GET /system-settings failed:', err);
    return c.json({ error: 'Failed to load system settings' }, 500);
  }
});

adminRoutes.patch('/system-settings', requireRole('admin'), async (c) => {
  try {
    const body = z
      .object({
        commandPaletteEnabled: z.boolean().optional(),
      })
      .safeParse(await c.req.json());

    if (!body.success) return c.json({ error: 'Invalid input', details: body.error.flatten() }, 400);

    const authUser = c.get('user') as AuthUser;
    const updated = await updateSystemSettings(body.data);
    void recordUserActivity(authUser.id, 'system.settings.updated', {
      payload: { fields: Object.keys(body.data) },
    });
    return c.json(updated);
  } catch (err) {
    console.error('[admin] PATCH /system-settings failed:', err);
    return c.json({ error: 'Failed to update system settings' }, 500);
  }
});
