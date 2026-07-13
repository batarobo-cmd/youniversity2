#!/usr/bin/env bash
# Zmeň známe demo heslá na produkcii (admin123, student123, sysadmin123).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE="docker compose -f docker-compose.prod.yml"

if [ $# -lt 1 ]; then
  echo "Použitie: $0 <nové-silné-heslo>"
  echo "Heslo min. 12 znakov. Nastaví ho pre všetky demo účty v DB."
  exit 1
fi

NEW_PASS="$1"
if [ "${#NEW_PASS}" -lt 12 ]; then
  echo "CHYBA: Heslo musí mať aspoň 12 znakov."
  exit 1
fi

$COMPOSE exec -T -e NEW_PASS="$NEW_PASS" api bun -e "
import bcrypt from 'bcryptjs';
import { db } from './src/db';
import { users } from './src/db/schema';
import { inArray } from 'drizzle-orm';

const newPass = process.env.NEW_PASS!;
const hash = await bcrypt.hash(newPass, 12);
const demoEmails = [
  'admin@youniversity2.sk',
  'student@youniversity2.sk',
  'sysadmin@youniversity2.sk',
  'admin@local',
  'student@local',
  'sysadmin@local',
];

const updated = await db
  .update(users)
  .set({ passwordHash: hash, updatedAt: new Date() })
  .where(inArray(users.email, demoEmails))
  .returning({ email: users.email });

console.log('Aktualizované:', updated.map((u) => u.email).join(', ') || '(žiadne demo účty v DB)');
"

echo "Hotovo. Prihlás sa novým heslom (napr. admin@youniversity2.sk)."
