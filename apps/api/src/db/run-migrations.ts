import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';

const migrationsFolder = path.join(import.meta.dir, '../../drizzle');
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://youniversity:youniversity@localhost:5432/youniversity2';

/** DBs created with `db:push` have no drizzle migration journal — stamp baseline before migrate. */
async function baselineLegacyPushSchema(client: postgres.Sql): Promise<void> {
  const [{ exists }] = await client<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS exists
  `;
  if (!exists) return;

  const migrations = readMigrationFiles({ migrationsFolder });
  if (migrations.length === 0) return;

  await client`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await client`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;

  const applied = await client<{ hash: string }[]>`
    SELECT hash FROM drizzle.__drizzle_migrations
  `;
  const appliedHashes = new Set(applied.map((row) => row.hash));

  let stamped = 0;
  for (const migration of migrations) {
    if (appliedHashes.has(migration.hash)) continue;
    await client`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${migration.hash}, ${migration.folderMillis})
    `;
    stamped += 1;
  }

  if (stamped > 0) {
    console.log(`[db] Baselined ${stamped} migration(s) on existing schema (legacy db:push).`);
  }
}

async function main() {
  const client = postgres(databaseUrl, { max: 1 });
  try {
    await baselineLegacyPushSchema(client);
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    console.log('[db] Migrations up to date.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[db] Migration failed:', err);
  process.exit(1);
});
