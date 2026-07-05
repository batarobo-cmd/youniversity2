import bcrypt from 'bcryptjs';
import { db } from './index';
import {
  users,
  courses,
  courseTranslations,
  courseModules,
  moduleTranslations,
  lessons,
  lessonTranslations,
  enrollments,
  completionRules,
} from './schema';

async function seed() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('admin123', 12);

  const [admin] = await db
    .insert(users)
    .values({
      email: 'admin@youniversity2.sk',
      passwordHash,
      name: 'Admin',
      role: 'admin',
      preferredLocale: 'sk',
    })
    .onConflictDoNothing()
    .returning();

  const [student] = await db
    .insert(users)
    .values({
      email: 'student@youniversity2.sk',
      passwordHash: await bcrypt.hash('student123', 12),
      name: 'Ján Študent',
      role: 'student',
      preferredLocale: 'sk',
    })
    .onConflictDoNothing()
    .returning();

  if (!admin) {
    console.log('Admin already exists, skipping course seed.');
    process.exit(0);
  }

  const courseStart = new Date();
  const courseEnd = new Date();
  courseEnd.setMonth(courseEnd.getMonth() + 3);

  const [course] = await db
    .insert(courses)
    .values({
      slug: 'uvod-do-youniversity2',
      defaultLocale: 'sk',
      isPublished: true,
      createdById: admin.id,
      startsAt: courseStart,
      endsAt: courseEnd,
    })
    .returning();

  await db.insert(courseTranslations).values({
    courseId: course.id,
    locale: 'sk',
    title: 'Úvod do YOUniversity2',
    description: 'Ukážkový kurz pre otestovanie realtime LMS systému.',
    source: 'manual',
  });

  await db.insert(courseTranslations).values({
    courseId: course.id,
    locale: 'en',
    title: 'Introduction to YOUniversity2',
    description: 'Demo course to test the realtime LMS system.',
    source: 'manual',
  });

  const [mod1] = await db
    .insert(courseModules)
    .values({ courseId: course.id, sortOrder: 0, isRequired: true })
    .returning();

  await db.insert(moduleTranslations).values({
    moduleId: mod1.id,
    locale: 'sk',
    title: 'Modul 1 — Základy',
    source: 'manual',
  });

  const [lessonVideo] = await db
    .insert(lessons)
    .values({
      moduleId: mod1.id,
      type: 'embed',
      sortOrder: 0,
      isRequired: true,
      config: {
        videoSource: 'youtube',
        embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        minWatchPercent: 80,
      },
    })
    .returning();

  await db.insert(lessonTranslations).values({
    lessonId: lessonVideo.id,
    locale: 'sk',
    title: 'Úvodné video',
    content: 'Pozrite si úvodné video kurzu.',
    source: 'manual',
  });

  const [lessonQuiz] = await db
    .insert(lessons)
    .values({
      moduleId: mod1.id,
      type: 'quiz',
      sortOrder: 1,
      isRequired: true,
      config: { passingScore: 70, maxAttempts: 3 },
    })
    .returning();

  await db.insert(lessonTranslations).values({
    lessonId: lessonQuiz.id,
    locale: 'sk',
    title: 'Záverečný test',
    source: 'manual',
  });

  await db.insert(completionRules).values([
    { courseId: course.id, type: 'all_lessons_complete', config: {}, isRequired: true },
    { courseId: course.id, type: 'quiz_min_score', config: { minScore: 70 }, isRequired: true },
  ]);

  if (student) {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 2);
    await db.insert(enrollments).values({
      userId: student.id,
      courseId: course.id,
      status: 'active',
      expiresAt,
    });
  }

  console.log('Seed complete!');
  console.log('  Admin:   admin@youniversity2.sk / admin123');
  console.log('  Student: student@youniversity2.sk / student123');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
