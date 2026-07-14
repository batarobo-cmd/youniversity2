import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config';
import * as schema from './schema';

const client = postgres(config.databaseUrl, {
  max: config.databasePoolMax,
  idle_timeout: 30,
  connect_timeout: 10,
});
export const db = drizzle(client, { schema });
