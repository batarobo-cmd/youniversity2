import { eq } from 'drizzle-orm';
import { db } from '../db';
import { systemSettings } from '../db/schema';
import { ensureSystemSettingsTable } from '../db/ensure-system-settings-table';

export type SystemSettingsData = {
  commandPaletteEnabled: boolean;
};

export type PublicSystemFeatures = SystemSettingsData;

const SETTINGS_ID = 1;

const DEFAULTS: SystemSettingsData = {
  commandPaletteEnabled: false,
};

let tableReady = false;

async function ensureReady() {
  if (tableReady) return;
  await ensureSystemSettingsTable();
  tableReady = true;
}

async function readSettingsRow() {
  try {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.id, SETTINGS_ID))
      .limit(1);
    return row;
  } catch {
    return undefined;
  }
}

export async function getSystemSettings(): Promise<SystemSettingsData> {
  await ensureReady();
  const row = await readSettingsRow();
  if (!row) return { ...DEFAULTS };

  const stored = row.settings as Partial<SystemSettingsData>;
  return {
    commandPaletteEnabled: stored.commandPaletteEnabled ?? DEFAULTS.commandPaletteEnabled,
  };
}

export async function getPublicSystemFeatures(): Promise<PublicSystemFeatures> {
  return getSystemSettings();
}

export async function updateSystemSettings(
  patch: Partial<SystemSettingsData>,
): Promise<SystemSettingsData> {
  await ensureReady();
  const current = await getSystemSettings();
  const next: SystemSettingsData = {
    commandPaletteEnabled: patch.commandPaletteEnabled ?? current.commandPaletteEnabled,
  };

  await db
    .insert(systemSettings)
    .values({ id: SETTINGS_ID, settings: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettings.id,
      set: { settings: next, updatedAt: new Date() },
    });

  return next;
}