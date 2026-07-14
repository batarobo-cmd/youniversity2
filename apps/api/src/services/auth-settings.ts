import { eq } from 'drizzle-orm';
import { config } from '../config';
import { db } from '../db';
import { authSettings } from '../db/schema';
import { extractEmailDomain } from './user-profile';

export type OAuthProviderKey = 'google' | 'microsoft';

export type OAuthProviderSettings = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  tenantId?: string;
};

export type AuthSettingsData = {
  manualLoginEnabled: boolean;
  manualRegistrationEnabled: boolean;
  allowedLoginDomains: string[];
  allowedRegistrationDomains: string[];
  google: OAuthProviderSettings;
  microsoft: OAuthProviderSettings & { tenantId: string };
};

export type PublicAuthConfig = {
  manualLoginEnabled: boolean;
  manualRegistrationEnabled: boolean;
  turnstileSiteKey: string | null;
  oauth: Record<OAuthProviderKey, { enabled: boolean }>;
};

export type AdminAuthSettings = Omit<AuthSettingsData, 'google' | 'microsoft'> & {
  google: OAuthProviderSettings & { hasClientSecret: boolean; configured: boolean };
  microsoft: (OAuthProviderSettings & { tenantId: string }) & {
    hasClientSecret: boolean;
    configured: boolean;
  };
};

const SETTINGS_ID = 1;

function defaultSettingsFromEnv(): AuthSettingsData {
  return {
    manualLoginEnabled: true,
    manualRegistrationEnabled: true,
    allowedLoginDomains: [],
    allowedRegistrationDomains: [],
    google: {
      enabled: Boolean(config.oauth.google.clientId && config.oauth.google.clientSecret),
      clientId: config.oauth.google.clientId,
      clientSecret: config.oauth.google.clientSecret,
    },
    microsoft: {
      enabled: Boolean(config.oauth.microsoft.clientId && config.oauth.microsoft.clientSecret),
      clientId: config.oauth.microsoft.clientId,
      clientSecret: config.oauth.microsoft.clientSecret,
      tenantId: config.oauth.microsoft.tenantId,
    },
  };
}

function normalizeDomains(domains: string[]): string[] {
  return [...new Set(domains.map((d) => d.trim().toLowerCase()).filter(Boolean))];
}

function parseDomainsInput(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return normalizeDomains(value.flatMap((item) => String(item).split(/[\n,;]+/)));
}

export function isEmailDomainAllowed(email: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true;
  const domain = extractEmailDomain(email);
  if (!domain) return false;
  return allowedDomains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

async function readSettingsRow() {
  const [row] = await db.select().from(authSettings).where(eq(authSettings.id, SETTINGS_ID)).limit(1);
  return row;
}

export async function getAuthSettings(): Promise<AuthSettingsData> {
  const row = await readSettingsRow();
  if (!row) return defaultSettingsFromEnv();

  const stored = row.settings as Partial<AuthSettingsData>;
  const defaults = defaultSettingsFromEnv();

  return {
    manualLoginEnabled: true,
    manualRegistrationEnabled: stored.manualRegistrationEnabled ?? defaults.manualRegistrationEnabled,
    allowedLoginDomains: normalizeDomains(stored.allowedLoginDomains ?? defaults.allowedLoginDomains),
    allowedRegistrationDomains: normalizeDomains(
      stored.allowedRegistrationDomains ?? defaults.allowedRegistrationDomains,
    ),
    google: {
      enabled: stored.google?.enabled ?? defaults.google.enabled,
      clientId: stored.google?.clientId ?? defaults.google.clientId,
      clientSecret: stored.google?.clientSecret || defaults.google.clientSecret,
    },
    microsoft: {
      enabled: stored.microsoft?.enabled ?? defaults.microsoft.enabled,
      clientId: stored.microsoft?.clientId ?? defaults.microsoft.clientId,
      clientSecret: stored.microsoft?.clientSecret || defaults.microsoft.clientSecret,
      tenantId: stored.microsoft?.tenantId ?? defaults.microsoft.tenantId,
    },
  };
}

export async function getPublicAuthConfig(): Promise<PublicAuthConfig> {
  const settings = await getAuthSettings();
  const siteKey = config.turnstile.siteKey.trim();
  return {
    manualLoginEnabled: true,
    manualRegistrationEnabled: settings.manualRegistrationEnabled,
    turnstileSiteKey: siteKey || null,
    oauth: {
      google: {
        enabled: settings.google.enabled && Boolean(settings.google.clientId && settings.google.clientSecret),
      },
      microsoft: {
        enabled:
          settings.microsoft.enabled &&
          Boolean(settings.microsoft.clientId && settings.microsoft.clientSecret),
      },
    },
  };
}

export async function getAdminAuthSettings(): Promise<AdminAuthSettings> {
  const settings = await getAuthSettings();
  return {
    manualLoginEnabled: true,
    manualRegistrationEnabled: settings.manualRegistrationEnabled,
    allowedLoginDomains: settings.allowedLoginDomains,
    allowedRegistrationDomains: settings.allowedRegistrationDomains,
    google: {
      ...settings.google,
      clientSecret: '',
      hasClientSecret: Boolean(settings.google.clientSecret),
      configured: Boolean(settings.google.clientId.trim() && settings.google.clientSecret),
    },
    microsoft: {
      ...settings.microsoft,
      clientSecret: '',
      hasClientSecret: Boolean(settings.microsoft.clientSecret),
      configured: Boolean(settings.microsoft.clientId.trim() && settings.microsoft.clientSecret),
    },
  };
}

export async function updateAuthSettings(
  patch: Partial<{
    manualLoginEnabled: boolean;
    manualRegistrationEnabled: boolean;
    allowedLoginDomains: string[];
    allowedRegistrationDomains: string[];
    google: Partial<OAuthProviderSettings>;
    microsoft: Partial<OAuthProviderSettings & { tenantId: string }>;
  }>,
): Promise<AdminAuthSettings> {
  const current = await getAuthSettings();

  const next: AuthSettingsData = {
    manualLoginEnabled: true,
    manualRegistrationEnabled: patch.manualRegistrationEnabled ?? current.manualRegistrationEnabled,
    allowedLoginDomains:
      patch.allowedLoginDomains !== undefined
        ? parseDomainsInput(patch.allowedLoginDomains)
        : current.allowedLoginDomains,
    allowedRegistrationDomains:
      patch.allowedRegistrationDomains !== undefined
        ? parseDomainsInput(patch.allowedRegistrationDomains)
        : current.allowedRegistrationDomains,
    google: {
      enabled: patch.google?.enabled ?? current.google.enabled,
      clientId: patch.google?.clientId?.trim() ?? current.google.clientId,
      clientSecret:
        patch.google?.clientSecret !== undefined && patch.google.clientSecret.trim()
          ? patch.google.clientSecret.trim()
          : current.google.clientSecret,
    },
    microsoft: {
      enabled: patch.microsoft?.enabled ?? current.microsoft.enabled,
      clientId: patch.microsoft?.clientId?.trim() ?? current.microsoft.clientId,
      clientSecret:
        patch.microsoft?.clientSecret !== undefined && patch.microsoft.clientSecret.trim()
          ? patch.microsoft.clientSecret.trim()
          : current.microsoft.clientSecret,
      tenantId: patch.microsoft?.tenantId?.trim() || current.microsoft.tenantId || 'common',
    },
  };

  await db
    .insert(authSettings)
    .values({ id: SETTINGS_ID, settings: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: authSettings.id,
      set: { settings: next, updatedAt: new Date() },
    });

  return getAdminAuthSettings();
}

export type ResolvedOAuthProvider = {
  enabled: boolean;
  configured: boolean;
  clientId: string;
  clientSecret: string;
  tenantId: string;
};

export async function resolveOAuthProvider(provider: OAuthProviderKey): Promise<ResolvedOAuthProvider> {
  const settings = await getAuthSettings();
  const providerSettings = settings[provider];
  const clientId = providerSettings.clientId.trim();
  const clientSecret = providerSettings.clientSecret.trim();
  const tenantId =
    provider === 'microsoft'
      ? (settings.microsoft.tenantId?.trim() || 'common')
      : 'common';

  return {
    enabled: providerSettings.enabled,
    configured: Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
    tenantId,
  };
}

export async function isOAuthProviderActive(provider: OAuthProviderKey): Promise<boolean> {
  const resolved = await resolveOAuthProvider(provider);
  return resolved.enabled && resolved.configured;
}
