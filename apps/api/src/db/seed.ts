import bcrypt from 'bcryptjs';
import { db } from './index';
import {
  users,
  courseCategories,
  courses,
  courseTranslations,
  courseModules,
  moduleTranslations,
  lessons,
  lessonTranslations,
  enrollments,
  completionRules,
} from './schema';
import { getDemoUserCredentials } from '../services/demo-users';

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.log('Seed skipped in production (use db:ensure-demo + aws-change-demo-passwords.sh).');
    process.exit(0);
  }

  console.log('Seeding database...');

  const demoUsers = getDemoUserCredentials();
  const adminCreds = demoUsers.admin;
  const studentCreds = demoUsers.student;

  const [admin] = await db
    .insert(users)
    .values({
      email: adminCreds.email,
      passwordHash: await bcrypt.hash(adminCreds.password, 12),
      name: adminCreds.name,
      role: adminCreds.role,
      preferredLocale: 'sk',
    })
    .onConflictDoNothing()
    .returning();

  const [student] = await db
    .insert(users)
    .values({
      email: studentCreds.email,
      passwordHash: await bcrypt.hash(studentCreds.password, 12),
      name: studentCreds.name,
      role: studentCreds.role,
      preferredLocale: 'sk',
    })
    .onConflictDoNothing()
    .returning();

  if (!admin) {
    console.log('Admin already exists, skipping course seed.');
    process.exit(0);
  }

  const [category] = await db
    .insert(courseCategories)
    .values({ slug: 'vseobecne', name: 'Všeobecné', sortOrder: 0 })
    .onConflictDoNothing()
    .returning();

  const courseStart = new Date();
  const courseEnd = new Date();
  courseEnd.setMonth(courseEnd.getMonth() + 3);

  const [course] = await db
    .insert(courses)
    .values({
      slug: 'uvod-do-youniversity2',
      categoryId: category?.id ?? null,
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
      type: 'video',
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
      type: 'test',
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
  console.log('  Admin:   admin / admin');
  console.log('  Student: student / student');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
