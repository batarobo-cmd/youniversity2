import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import { getAdminHealth } from '../services/health';
import { getUserLogs } from '../services/user-logs';
import {
  getAggregatedErrors,
  getAuditLog,
  getAuthSecurityEvents,
  getMediaOperations,
  getReportsOverview,
  searchAuditForExport,
  searchAuthForExport,
  searchErrorsForExport,
} from '../services/system-reports';
import { redactReportRow, rowsToCsv } from '../services/report-redaction';
import { recordUserActivity } from '../services/activity-log';
import type { AuthUser } from '../middleware/auth';

const querySchema = z.object({
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const exportSchema = z.object({
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
  section: z.enum(['audit', 'auth', 'errors', 'user']),
  format: z.enum(['json', 'csv']).default('json'),
  userId: z.string().uuid().optional(),
  locale: z.string().optional(),
});

export const adminReportsRoutes = new Hono();

adminReportsRoutes.use('*', authMiddleware);
adminReportsRoutes.use('*', requireRole('admin'));

adminReportsRoutes.get('/overview', async (c) => {
  return c.json(await getReportsOverview());
});

adminReportsRoutes.get('/audit', async (c) => {
  const parsed = querySchema.safeParse({
    q: c.req.query('q'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  });
  if (!parsed.success) return c.json({ error: 'Invalid query' }, 400);
  return c.json(await getAuditLog(parsed.data));
});

adminReportsRoutes.get('/auth', async (c) => {
  const parsed = querySchema.safeParse({
    q: c.req.query('q'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  });
  if (!parsed.success) return c.json({ error: 'Invalid query' }, 400);
  return c.json(await getAuthSecurityEvents(parsed.data));
});

adminReportsRoutes.get('/health', async (c) => {
  return c.json(await getAdminHealth());
});

adminReportsRoutes.get('/errors', async (c) => {
  const parsed = querySchema.safeParse({
    q: c.req.query('q'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  });
  if (!parsed.success) return c.json({ error: 'Invalid query' }, 400);
  return c.json(await getAggregatedErrors(parsed.data));
});

adminReportsRoutes.get('/media', async (c) => {
  const parsed = querySchema.safeParse({
    q: c.req.query('q'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  });
  if (!parsed.success) return c.json({ error: 'Invalid query' }, 400);
  return c.json(await getMediaOperations(parsed.data));
});

adminReportsRoutes.get('/export', async (c) => {
  const parsed = exportSchema.safeParse({
    q: c.req.query('q'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
    section: c.req.query('section'),
    format: c.req.query('format'),
    userId: c.req.query('userId'),
    locale: c.req.query('locale'),
  });
  if (!parsed.success) return c.json({ error: 'Invalid query' }, 400);

  const user = c.get('user') as AuthUser;
  const { section, format, userId, locale, ...query } = parsed.data;

  let rows: Record<string, unknown>[] = [];
  if (section === 'audit') {
    rows = (await searchAuditForExport(query)).map((row) => ({
      occurredAt: row.occurredAt,
      eventType: row.eventType,
      actorName: row.actor.name,
      actorEmail: row.actor.email,
      actorRole: row.actor.role,
      payload: row.payload,
    }));
  } else if (section === 'auth') {
    rows = (await searchAuthForExport(query)).map((row) => ({ ...row }));
  } else if (section === 'user') {
    if (!userId) return c.json({ error: 'userId required' }, 400);
    const data = await getUserLogs(userId, locale ?? 'sk', { ...query, limit: 200, offset: 0 });
    rows = data.items.map((row) => ({
      occurredAt: row.occurredAt,
      eventType: row.eventType,
      kind: row.kind,
      courseTitle: row.courseTitle,
      method: row.method,
      payload: row.payload,
    }));
  } else {
    rows = (await searchErrorsForExport(query)).map((row) => ({ ...row }));
  }

  const redacted = rows.map((row) => redactReportRow(row));
  void recordUserActivity(user.id, 'reports.exported', {
    payload: { section, format, count: redacted.length },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    const csv = rowsToCsv(redacted);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="youniversity2-${section}-${stamp}.csv"`,
      },
    });
  }

  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), section, items: redacted }, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="youniversity2-${section}-${stamp}.json"`,
    },
  });
});
