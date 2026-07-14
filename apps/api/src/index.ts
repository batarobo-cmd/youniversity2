import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { dashboardRoutes } from './routes/dashboard';
import { authRoutes } from './routes/auth';
import { courseRoutes } from './routes/courses';
import { categoryRoutes } from './routes/categories';
import { adminRoutes } from './routes/admin';
import { enrollmentRoutes } from './routes/enrollments';
import { progressRoutes } from './routes/progress';
import { courseContentRoutes } from './routes/course-content';
import { mediaRoutes } from './routes/media';
import { certificateRoutes } from './routes/certificates';
import { scormRoutes } from './routes/scorm';
import { config } from './config';
import { apiSecurityHeaders } from './middleware/security-headers';
import { requestIdMiddleware } from './middleware/request-id';
import { globalRateLimitMiddleware } from './middleware/global-rate-limit';
import { getReadiness } from './services/health';
import {
  initRealtimeHub,
  createWebSocketHandlers,
  authenticateWebSocket,
} from './realtime/hub';
import { startPublicationScheduler } from './services/publication-scheduler';

import { migrateLegacyRoles } from './db/migrate-legacy-roles';
import { ensureSystemAdminExists } from './db/ensure-system-admin-exists';
import { ensureSystemSettingsTable } from './db/ensure-system-settings-table';
import { ensureScormTables } from './db/ensure-scorm-tables';

const app = new Hono();

app.use('*', logger());
app.use('*', requestIdMiddleware);
app.use('*', apiSecurityHeaders);
app.use(
  '*',
  cors({
    origin: config.corsOrigin,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Tab-Session', 'X-Request-Id', 'X-Student-View-Mode'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);
app.use('*', globalRateLimitMiddleware);

app.get('/health', (c) => c.json({ status: 'ok', service: 'youniversity2-api' }));
app.get('/health/live', (c) => c.json({ status: 'ok', service: 'youniversity2-api' }));
app.get('/health/ready', async (c) => {
  const readiness = await getReadiness();
  return c.json(
    { status: readiness.ok ? 'ok' : 'degraded', service: 'youniversity2-api', checks: readiness.checks },
    readiness.ok ? 200 : 503,
  );
});

app.route('/api/auth', authRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/courses', courseRoutes);
app.route('/api', courseContentRoutes);
app.route('/api/categories', categoryRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/enrollments', enrollmentRoutes);
app.route('/api/progress', progressRoutes);
app.route('/api/media', mediaRoutes);
app.route('/api/certificates', certificateRoutes);
app.route('/api/scorm', scormRoutes);

await initRealtimeHub();
try {
  await migrateLegacyRoles();
} catch (err) {
  console.error('[startup] migrateLegacyRoles failed:', err);
}
try {
  await ensureSystemAdminExists();
} catch (err) {
  console.error('[startup] ensureSystemAdminExists failed:', err);
}
try {
  await ensureSystemSettingsTable();
} catch (err) {
  console.error('[startup] ensureSystemSettingsTable failed:', err);
}
try {
  await ensureScormTables();
} catch (err) {
  console.error('[startup] ensureScormTables failed:', err);
}
startPublicationScheduler();

const wsHandlers = createWebSocketHandlers();

const server = Bun.serve({
  port: config.port,
  // Default Bun limit is 128 MB; SCORM/video uploads allow up to 500 MB.
  maxRequestBodySize: 524_288_000,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === '/ws') {
      const user = await authenticateWebSocket(req);
      if (!user) return new Response('Unauthorized', { status: 401 });

      const upgraded = server.upgrade(req, {
        data: { user, rooms: new Set<string>() },
      });
      if (!upgraded) return new Response('WebSocket upgrade failed', { status: 400 });
      return undefined as unknown as Response;
    }

    return app.fetch(req, server);
  },
  websocket: {
    async open(ws) {
      await wsHandlers.open(ws as Parameters<typeof wsHandlers.open>[0]);
    },
    message(ws, message) {
      wsHandlers.message(ws as Parameters<typeof wsHandlers.message>[0], message);
    },
    close(ws) {
      wsHandlers.close(ws as Parameters<typeof wsHandlers.close>[0]);
    },
  },
});

console.log(`YOUniversity2 API running on http://localhost:${server.port}`);
console.log(`WebSocket: ws://localhost:${server.port}/ws?token=<jwt>`);
