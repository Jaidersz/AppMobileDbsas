import {
  GlucoseReading,
  LocalProfile,
  TextScaleMode,
} from '../types/glucose';
import { MAX_LOCAL_PROFILES } from '../data/devicesAndSeeds';

export interface GlucosoftDbState {
  schemaVersion: number;
  profiles: LocalProfile[];
  readings: GlucoseReading[];
  activeProfileId: string;
}

export const DB_STORAGE_KEY = 'glucosoft_local_db_v2';
export const PREFS_KEYS = {
  theme: 'glucosoft_theme_v1',
  textScale: 'glucosoft_text_scale_v1',
  onboardingDone: 'glucosoft_onboarding_done_v1',
  connectedDevice: 'glucosoft_connected_device_v1',
};

const LEGACY_KEYS = {
  profiles: 'glucopulse_profiles_v1',
  readings: 'glucopulse_readings_v1',
  activeProfileId: 'glucopulse_active_profile_v1',
  theme: 'glucopulse_theme_v1',
  textScale: 'dbsas_text_scale_v1',
  onboardingDone: 'dbsas_onboarding_done_v1',
  connectedDevice: 'dbsas_connected_device_v1',
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function normalizeLegacyReading(raw: Record<string, unknown>): GlucoseReading {
  const source = raw.source as string | undefined;
  const captureMethod =
    raw.captureMethod === 'bluetooth' || raw.captureMethod === 'manual'
      ? raw.captureMethod
      : source === 'ble' || source === 'ble_sync'
      ? 'bluetooth'
      : 'manual';

  const deviceId = (raw.deviceId || raw.deviceInfo) as
    | GlucoseReading['deviceId']
    | undefined;
  const deviceModel =
    typeof raw.deviceModel === 'string' && raw.deviceModel
      ? raw.deviceModel
      : typeof raw.deviceInfo === 'string'
      ? raw.deviceInfo.replace(/_/g, ' ')
      : 'Registro manual';

  return {
    id: String(raw.id ?? `rd_${Date.now()}`),
    profileId: String(raw.profileId ?? ''),
    valueMgDl: Number(raw.valueMgDl ?? 100),
    originalUnit:
      raw.originalUnit === 'mmol/L' || raw.originalUnit === 'mg/dL'
        ? raw.originalUnit
        : 'mg/dL',
    timestamp: Number(raw.timestamp ?? Date.now()),
    context: (raw.context as GlucoseReading['context']) ?? 'fasting',
    quickTags: Array.isArray(raw.quickTags)
      ? raw.quickTags.map((t) => String(t))
      : [],
    note: typeof raw.note === 'string' ? raw.note : '',
    captureMethod,
    deviceModel,
    deviceId,
    deviceInfoSummary:
      typeof raw.deviceInfoSummary === 'string'
        ? raw.deviceInfoSummary
        : undefined,
  };
}

/**
 * Inicializa o migra la base de datos local sin perder datos previos del usuario.
 * Si es la primera apertura real, inicia limpia sin perfiles simulados.
 */
export function initializeOrMigrateLocalDb(storage: StorageLike): GlucosoftDbState {
  try {
    const rawV2 = storage.getItem(DB_STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<GlucosoftDbState>;
      const validProfiles = Array.isArray(parsed.profiles)
        ? parsed.profiles.slice(0, MAX_LOCAL_PROFILES)
        : [];
      const validProfileIds = new Set(validProfiles.map((p) => p.id));
      const validReadings = Array.isArray(parsed.readings)
        ? parsed.readings
            .map((r) => normalizeLegacyReading(r as unknown as Record<string, unknown>))
            .filter((r) => validProfileIds.has(r.profileId))
        : [];
      const activeProfileId =
        parsed.activeProfileId && validProfileIds.has(parsed.activeProfileId)
          ? parsed.activeProfileId
          : validProfiles[0]?.id ?? '';

      return {
        schemaVersion: 2,
        profiles: validProfiles,
        readings: validReadings,
        activeProfileId,
      };
    }

    // Migrate from v1 keys only if real user data existed (exclude old hardcoded demo seeds if untouched)
    const rawLegacyProfiles = storage.getItem(LEGACY_KEYS.profiles);
    const rawLegacyReadings = storage.getItem(LEGACY_KEYS.readings);
    const rawLegacyActive = storage.getItem(LEGACY_KEYS.activeProfileId);

    if (rawLegacyProfiles) {
      const parsedProfiles = JSON.parse(rawLegacyProfiles) as LocalProfile[];
      const parsedReadings = rawLegacyReadings
        ? (JSON.parse(rawLegacyReadings) as Record<string, unknown>[])
        : [];

      const validProfiles = Array.isArray(parsedProfiles)
        ? parsedProfiles.slice(0, MAX_LOCAL_PROFILES)
        : [];
      const profileIds = new Set(validProfiles.map((p) => p.id));
      const migratedReadings = Array.isArray(parsedReadings)
        ? parsedReadings
            .map(normalizeLegacyReading)
            .filter((r) => profileIds.has(r.profileId))
        : [];

      const activeId =
        rawLegacyActive && profileIds.has(rawLegacyActive)
          ? rawLegacyActive
          : validProfiles[0]?.id ?? '';

      const migratedState: GlucosoftDbState = {
        schemaVersion: 2,
        profiles: validProfiles,
        readings: migratedReadings,
        activeProfileId: activeId,
      };
      saveLocalDb(storage, migratedState);
      return migratedState;
    }
  } catch {
    // Fallback to clean empty database on corrupt storage
  }

  const fresh: GlucosoftDbState = {
    schemaVersion: 2,
    profiles: [],
    readings: [],
    activeProfileId: '',
  };
  saveLocalDb(storage, fresh);
  return fresh;
}

export function saveLocalDb(storage: StorageLike, state: GlucosoftDbState): void {
  storage.setItem(
    DB_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 2,
      profiles: state.profiles.slice(0, MAX_LOCAL_PROFILES),
      readings: state.readings,
      activeProfileId: state.activeProfileId,
    })
  );
}

export function readInitialTextScale(storage: StorageLike): TextScaleMode {
  const val =
    storage.getItem(PREFS_KEYS.textScale) ??
    storage.getItem(LEGACY_KEYS.textScale);
  return val === 'large' ? 'large' : 'normal';
}

export function readInitialOnboardingDone(storage: StorageLike): boolean {
  return (
    storage.getItem(PREFS_KEYS.onboardingDone) === 'true' ||
    storage.getItem(LEGACY_KEYS.onboardingDone) === 'true'
  );
}
