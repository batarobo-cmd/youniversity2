import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireRole, type AuthUser } from '../middleware/auth';
import {
  listContentBank,
  purgeContentBankItem,
  renameContentBankItem,
  unlinkContentBankFromActivity,
} from '../services/content-bank';
import { recordUserActivity } from '../services/activity-log';

export const contentBankRoutes = new Hono();

contentBankRoutes.use('*', authMiddleware);
contentBankRoutes.use('*', requireRole('admin'));

contentBankRoutes.get('/', async (c) => {
  const locale = c.req.query('locale') ?? 'sk';
  const q = c.req.query('q');
  return c.json(await listContentBank(locale, q));
});

const renameSchema = z.object({
  displayName: z.string().min(1).max(500),
  locale: z.string().optional(),
});

contentBankRoutes.patch('/:itemId', async (c) => {
  const user = c.get('user') as AuthUser;
  const itemId = decodeURIComponent(c.req.param('itemId'));
  const body = renameSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  try {
    await renameContentBankItem(itemId, body.data.displayName, body.data.locale ?? 'sk');
    void recordUserActivity(user.id, 'content_bank.renamed', {
      payload: { itemId, displayName: body.data.displayName },
    });
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

const unlinkSchema = z.object({
  activityId: z.string().uuid(),
});

contentBankRoutes.post('/:itemId/unlink', async (c) => {
  const user = c.get('user') as AuthUser;
  const itemId = decodeURIComponent(c.req.param('itemId'));
  const body = unlinkSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Invalid input' }, 400);

  try {
    await unlinkContentBankFromActivity(body.data.activityId, itemId);
    void recordUserActivity(user.id, 'content_bank.unlinked', {
      payload: { itemId, activityId: body.data.activityId },
    });
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

contentBankRoutes.delete('/:itemId', async (c) => {
  const user = c.get('user') as AuthUser;
  const itemId = decodeURIComponent(c.req.param('itemId'));
  const locale = c.req.query('locale') ?? 'sk';

  try {
    await purgeContentBankItem(itemId, locale);
    void recordUserActivity(user.id, 'content_bank.purged', { payload: { itemId } });
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
