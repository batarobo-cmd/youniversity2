import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const id = c.req.header('X-Request-Id')?.trim() || randomUUID();
  c.header('X-Request-Id', id);
  await next();
};
