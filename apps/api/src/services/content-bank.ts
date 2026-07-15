import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  courseModules,
  courseTranslations,
  courses,
  lessonTranslations,
  lessons,
  scormPackages,
} from '../db/schema';
import {
  deleteStorageObject,
  deleteStoragePrefix,
  getStorageObjectMeta,
  listStorageObjects,
} from './storage';

export type ContentBankUsage = {
  courseId: string;
  courseTitle: string;
  moduleId: string;
  moduleTitle: string;
  activityId: string;
  activityTitle: string;
  activityType: string;
};

export type ContentBankItem = {
  id: string;
  kind: 'video' | 'presentation' | 'scorm';
  displayName: string;
  fileName?: string;
  fileKey?: string;
  packageId?: string;
  storagePrefix?: string;
  courseId?: string;
  courseTitle?: string;
  sizeBytes: number;
  uploadedAt?: string;
  usages: ContentBankUsage[];
  orphan: boolean;
};

type ActivityContext = {
  lessonId: string;
  lessonType: string;
  lessonTitle: string;
  moduleId: string;
  moduleTitle: string;
  courseId: string;
  courseTitle: string;
  config: Record<string, unknown>;
};

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export { formatBytes as formatContentBankBytes };

async function loadActivityContexts(locale: string): Promise<ActivityContext[]> {
  const [allLessons, allModules, allCourses, lessonTr, courseTr] = await Promise.all([
    db.select().from(lessons),
    db.select().from(courseModules),
    db.select().from(courses),
    db.select().from(lessonTranslations).where(eq(lessonTranslations.locale, locale)),
    db.select().from(courseTranslations).where(eq(courseTranslations.locale, locale)),
  ]);

  const moduleMap = new Map(allModules.map((m) => [m.id, m]));
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));
  const lessonTitleMap = new Map(lessonTr.map((t) => [t.lessonId, t.title]));
  const courseTitleMap = new Map(courseTr.map((t) => [t.courseId, t.title]));
  const moduleTitleMap = new Map(allModules.map((m) => [m.id, m.title]));

  const contexts: ActivityContext[] = [];
  for (const lesson of allLessons) {
    const mod = moduleMap.get(lesson.moduleId);
    if (!mod) continue;
    const course = courseMap.get(mod.courseId);
    if (!course) continue;
    contexts.push({
      lessonId: lesson.id,
      lessonType: lesson.type,
      lessonTitle: lessonTitleMap.get(lesson.id) ?? '—',
      moduleId: mod.id,
      moduleTitle: mod.title,
      courseId: course.id,
      courseTitle: courseTitleMap.get(course.id) ?? course.slug,
      config: (lesson.config as Record<string, unknown>) ?? {},
    });
  }
  return contexts;
}

function usageFrom(ctx: ActivityContext): ContentBankUsage {
  return {
    courseId: ctx.courseId,
    courseTitle: ctx.courseTitle,
    moduleId: ctx.moduleId,
    moduleTitle: ctx.moduleTitle,
    activityId: ctx.lessonId,
    activityTitle: ctx.lessonTitle,
    activityType: ctx.lessonType,
  };
}

function extractFileKeyFromVideoUrl(videoUrl?: string) {
  if (!videoUrl?.startsWith('/api/media/videos/')) return undefined;
  return videoUrl.slice('/api/media/videos/'.length);
}

function extractFileKeyFromPresentationUrl(presentationUrl?: string) {
  if (!presentationUrl?.startsWith('/api/media/presentations/')) return undefined;
  return decodeURIComponent(presentationUrl.slice('/api/media/presentations/'.length));
}

export async function listContentBank(locale = 'sk', query?: string) {
  const contexts = await loadActivityContexts(locale);
  const items = new Map<string, ContentBankItem>();

  const ensureItem = (
    id: string,
    kind: ContentBankItem['kind'],
    partial: Partial<ContentBankItem>,
  ) => {
    const existing = items.get(id);
    if (existing) return existing;
    const created: ContentBankItem = {
      id,
      kind,
      displayName: partial.displayName ?? '—',
      fileName: partial.fileName,
      fileKey: partial.fileKey,
      packageId: partial.packageId,
      storagePrefix: partial.storagePrefix,
      courseId: partial.courseId,
      courseTitle: partial.courseTitle,
      sizeBytes: partial.sizeBytes ?? 0,
      uploadedAt: partial.uploadedAt,
      usages: [],
      orphan: false,
    };
    items.set(id, created);
    return created;
  };

  for (const ctx of contexts) {
    const cfg = ctx.config;
    if (ctx.lessonType === 'video') {
      const fileKey = (cfg.fileKey as string) || extractFileKeyFromVideoUrl(cfg.videoUrl as string);
      if (!fileKey) continue;
      const id = `video:${fileKey}`;
      const item = ensureItem(id, 'video', {
        displayName: (cfg.fileName as string) || fileKey.split('/').pop() || 'Video',
        fileName: cfg.fileName as string | undefined,
        fileKey,
        courseId: ctx.courseId,
        courseTitle: ctx.courseTitle,
      });
      item.usages.push(usageFrom(ctx));
    }

    if (ctx.lessonType === 'presentation') {
      const fileKey =
        (cfg.fileKey as string) || extractFileKeyFromPresentationUrl(cfg.presentationUrl as string);
      if (!fileKey) continue;
      const id = `presentation:${fileKey}`;
      const item = ensureItem(id, 'presentation', {
        displayName: (cfg.fileName as string) || fileKey.split('/').pop() || 'Prezentácia',
        fileName: cfg.fileName as string | undefined,
        fileKey,
        courseId: ctx.courseId,
        courseTitle: ctx.courseTitle,
      });
      item.usages.push(usageFrom(ctx));
    }

    if (ctx.lessonType === 'scorm') {
      const sc = (cfg.scorm as Record<string, unknown>) ?? cfg;
      const packageId = sc.packageId as string | undefined;
      if (!packageId) continue;
      const id = `scorm:${packageId}`;
      const item = ensureItem(id, 'scorm', {
        displayName: (sc.title as string) || 'SCORM balík',
        packageId,
        courseId: ctx.courseId,
        courseTitle: ctx.courseTitle,
      });
      item.usages.push(usageFrom(ctx));
    }
  }

  const scormRows = await db.select().from(scormPackages);
  for (const pkg of scormRows) {
    const id = `scorm:${pkg.id}`;
    const item = ensureItem(id, 'scorm', {
      displayName: pkg.title,
      packageId: pkg.id,
      storagePrefix: pkg.storagePrefix,
      courseId: pkg.courseId,
      uploadedAt: pkg.createdAt.toISOString(),
    });
    if (!item.storagePrefix) item.storagePrefix = pkg.storagePrefix;
    if (!item.uploadedAt) item.uploadedAt = pkg.createdAt.toISOString();
  }

  for (const item of items.values()) {
    if (item.kind === 'scorm' && item.storagePrefix) {
      const objects = await listStorageObjects(item.storagePrefix, 500);
      item.sizeBytes = objects.reduce((sum, obj) => sum + obj.size, 0);
      if (!item.uploadedAt) {
        const latest = objects
          .map((o) => o.lastModified)
          .filter(Boolean)
          .sort()
          .at(-1);
        item.uploadedAt = latest;
      }
    } else if (item.fileKey) {
      const meta = await getStorageObjectMeta(item.fileKey);
      if (meta) {
        item.sizeBytes = meta.size;
        item.uploadedAt = meta.lastModified ?? item.uploadedAt;
      }
    }
    item.orphan = item.usages.length === 0;
    if (!item.courseTitle && item.usages[0]) item.courseTitle = item.usages[0].courseTitle;
    if (!item.courseId && item.usages[0]) item.courseId = item.usages[0].courseId;
  }

  let list = [...items.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  const q = query?.trim().toLowerCase();
  if (q) {
    list = list.filter((item) => {
      const haystack = [
        item.displayName,
        item.fileName ?? '',
        item.kind,
        item.courseTitle ?? '',
        ...item.usages.map((u) => `${u.courseTitle} ${u.moduleTitle} ${u.activityTitle}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  const totalBytes = list.reduce((sum, item) => sum + item.sizeBytes, 0);
  return { items: list, totalBytes, totalCount: list.length };
}

export async function renameContentBankItem(
  itemId: string,
  displayName: string,
  locale = 'sk',
) {
  const trimmed = displayName.trim();
  if (!trimmed) throw new Error('Display name required');

  const [kind, ref] = itemId.split(':');
  if (!kind || !ref) throw new Error('Invalid item id');

  if (kind === 'scorm') {
    await db.update(scormPackages).set({ title: trimmed, updatedAt: new Date() }).where(eq(scormPackages.id, ref));
    const contexts = await loadActivityContexts(locale);
    for (const ctx of contexts) {
      const sc = (ctx.config.scorm as Record<string, unknown>) ?? ctx.config;
      if (sc.packageId !== ref) continue;
      const nextConfig = {
        ...ctx.config,
        scorm: { ...sc, title: trimmed },
      };
      await db.update(lessons).set({ config: nextConfig }).where(eq(lessons.id, ctx.lessonId));
    }
    return { ok: true };
  }

  const contexts = await loadActivityContexts(locale);
  let updated = 0;
  for (const ctx of contexts) {
    const cfg = { ...ctx.config };
    if (kind === 'video' && cfg.fileKey === ref) {
      cfg.fileName = trimmed;
      await db.update(lessons).set({ config: cfg }).where(eq(lessons.id, ctx.lessonId));
      updated += 1;
    }
    if (kind === 'presentation' && cfg.fileKey === ref) {
      cfg.fileName = trimmed;
      await db.update(lessons).set({ config: cfg }).where(eq(lessons.id, ctx.lessonId));
      updated += 1;
    }
  }
  if (updated === 0) throw new Error('Item not found');
  return { ok: true, updated };
}

function clearedConfigForKind(kind: string, config: Record<string, unknown>) {
  if (kind === 'video') {
    const next = { ...config };
    delete next.fileKey;
    delete next.videoUrl;
    delete next.fileName;
    delete next.videoSource;
    return next;
  }
  if (kind === 'presentation') {
    const next = { ...config };
    delete next.fileKey;
    delete next.presentationUrl;
    delete next.fileName;
    delete next.fileContentType;
    return next;
  }
  if (kind === 'scorm') {
    const next = { ...config };
    delete next.scorm;
    return next;
  }
  return config;
}

export async function unlinkContentBankFromActivity(activityId: string, itemId: string) {
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, activityId)).limit(1);
  if (!lesson) throw new Error('Activity not found');

  const [kind, ref] = itemId.split(':');
  const cfg = (lesson.config as Record<string, unknown>) ?? {};
  let matches = false;

  if (kind === 'video' && lesson.type === 'video' && cfg.fileKey === ref) matches = true;
  if (kind === 'presentation' && lesson.type === 'presentation' && cfg.fileKey === ref) matches = true;
  if (kind === 'scorm' && lesson.type === 'scorm') {
    const sc = (cfg.scorm as Record<string, unknown>) ?? {};
    if (sc.packageId === ref) matches = true;
  }
  if (!matches) throw new Error('Asset not linked to this activity');

  await db
    .update(lessons)
    .set({ config: clearedConfigForKind(lesson.type, cfg) })
    .where(eq(lessons.id, activityId));
  return { ok: true };
}

export async function purgeContentBankItem(itemId: string, locale = 'sk') {
  const bank = await listContentBank(locale);
  const item = bank.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error('Item not found');

  const contexts = await loadActivityContexts(locale);
  for (const ctx of contexts) {
    const cfg = (ctx.config as Record<string, unknown>) ?? {};
    let shouldClear = false;
    if (item.kind === 'video' && ctx.lessonType === 'video' && cfg.fileKey === item.fileKey) shouldClear = true;
    if (item.kind === 'presentation' && ctx.lessonType === 'presentation' && cfg.fileKey === item.fileKey)
      shouldClear = true;
    if (item.kind === 'scorm' && ctx.lessonType === 'scorm') {
      const sc = (cfg.scorm as Record<string, unknown>) ?? {};
      if (sc.packageId === item.packageId) shouldClear = true;
    }
    if (shouldClear) {
      await db
        .update(lessons)
        .set({ config: clearedConfigForKind(ctx.lessonType, cfg) })
        .where(eq(lessons.id, ctx.lessonId));
    }
  }

  if (item.kind === 'scorm' && item.packageId) {
    if (item.storagePrefix) await deleteStoragePrefix(item.storagePrefix);
    await db.delete(scormPackages).where(eq(scormPackages.id, item.packageId));
  } else if (item.fileKey) {
    await deleteStorageObject(item.fileKey);
  }

  return { ok: true };
}
