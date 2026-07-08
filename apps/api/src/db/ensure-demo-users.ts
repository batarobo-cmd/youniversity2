import bcrypt from 'bcryptjs';
import { db } from './index';
import { users } from './schema';

async function ensureDemoUsers() {
  const adminHash = await bcrypt.hash('admin123', 12);
  const studentHash = await bcrypt.hash('student123', 12);

  await db
    .insert(users)
    .values({
      email: 'admin@youniversity2.sk',
      passwordHash: adminHash,
      name: 'Admin',
      role: 'admin',
      preferredLocale: 'sk',
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        passwordHash: adminHash,
        name: 'Admin',
        role: 'admin',
        updatedAt: new Date(),
      },
    });

  await db
    .insert(users)
    .values({
      email: 'student@youniversity2.sk',
      passwordHash: studentHash,
      name: 'Ján Študent',
      role: 'student',
      preferredLocale: 'sk',
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        passwordHash: studentHash,
        name: 'Ján Študent',
        role: 'student',
        updatedAt: new Date(),
      },
    });

  console.log('Demo users ready:');
  console.log('  admin@youniversity2.sk / admin123');
  console.log('  student@youniversity2.sk / student123');
}

ensureDemoUsers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
