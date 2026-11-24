import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DB_STORAGE_KEY,
  StorageLike,
  initializeOrMigrateLocalDb,
  saveLocalDb,
} from '../utils/localDb.ts';
import {
  computeGlucoseStats,
  deduplicateIncomingReadings,
  evaluateReadingSeverity,
  formatGlucoseValue,
  mgDlToMmol,
  mmolToMgDl,
} from '../utils/glucoseMath.ts';
import { parseStandardGlucoseMeasurement } from '../components/BleCaptureSheet.tsx';
import { buildClinicalPdfDocument } from '../utils/pdfReport.ts';
import { MAX_LOCAL_PROFILES } from '../data/devicesAndSeeds.ts';
import { GlucoseReading, LocalProfile } from '../types/glucose.ts';

class MemoryStorage implements StorageLike {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

test('1 & 2. Base de datos local se crea limpia en el primer inicio y persiste al reabrir', () => {
  const storage = new MemoryStorage();
  const initial = initializeOrMigrateLocalDb(storage);

  assert.equal(initial.schemaVersion, 2);
  assert.equal(initial.profiles.length, 0);
  assert.equal(initial.readings.length, 0);
  assert.ok(storage.getItem(DB_STORAGE_KEY) !== null);

  const profile: LocalProfile = {
    id: 'prof_1',
    name: 'Ana Pérez',
    unitPreference: 'mg/dL',
    targetMinMgDl: 75,
    targetMaxMgDl: 135,
    accentHex: '#0F766E',
    createdAt: Date.now(),
    emergencyContact: {
      name: 'Luis Pérez',
      relation: 'Hijo',
      phone: '+57 300 111 2233',
    },
  };

  const reading: GlucoseReading = {
    id: 'rd_1',
    profileId: 'prof_1',
    valueMgDl: 108,
    originalUnit: 'mg/dL',
    timestamp: Date.now(),
    context: 'fasting',
    quickTags: ['Tomé agua'],
    note: 'Sin novedad',
    captureMethod: 'manual',
    deviceModel: 'OKMeter Match II',
    deviceId: 'OKMeter_Match_II',
  };

  saveLocalDb(storage, {
    schemaVersion: 2,
    profiles: [profile],
    readings: [reading],
    activeProfileId: profile.id,
  });

  // Simular cierre y reapertura de la aplicación
  const reopened = initializeOrMigrateLocalDb(storage);
  assert.equal(reopened.profiles.length, 1);
  assert.equal(reopened.profiles[0].name, 'Ana Pérez');
  assert.equal(reopened.profiles[0].emergencyContact?.name, 'Luis Pérez');
  assert.equal(reopened.readings.length, 1);
  assert.equal(reopened.readings[0].valueMgDl, 108);
  assert.equal(reopened.readings[0].deviceModel, 'OKMeter Match II');
});

test('3, 4 & 5. Límite máximo de 3 perfiles, separación de historiales y eliminación segura', () => {
  const storage = new MemoryStorage();
  const profiles: LocalProfile[] = [1, 2, 3, 4].map((i) => ({
    id: `p_${i}`,
    name: `Persona ${i}`,
    unitPreference: 'mg/dL',
    targetMinMgDl: 70,
    targetMaxMgDl: 140,
    accentHex: '#0F766E',
    createdAt: Date.now() + i,
  }));

  const readings: GlucoseReading[] = [
    {
      id: 'r_p1',
      profileId: 'p_1',
      valueMgDl: 99,
      timestamp: Date.now(),
      context: 'fasting',
      quickTags: [],
      note: '',
      captureMethod: 'manual',
      deviceModel: 'Glucocare Match',
    },
    {
      id: 'r_p2',
      profileId: 'p_2',
      valueMgDl: 145,
      timestamp: Date.now(),
      context: 'post_meal_2h',
      quickTags: [],
      note: '',
      captureMethod: 'manual',
      deviceModel: 'Glucomax',
    },
  ];

  saveLocalDb(storage, {
    schemaVersion: 2,
    profiles, // intento de guardar 4
    readings,
    activeProfileId: 'p_1',
  });

  const loaded = initializeOrMigrateLocalDb(storage);
  assert.equal(loaded.profiles.length, MAX_LOCAL_PROFILES);
  assert.equal(
    loaded.readings.filter((r) => r.profileId === 'p_1').length,
    1
  );
  assert.equal(
    loaded.readings.filter((r) => r.profileId === 'p_2').length,
    1
  );

  // Eliminar p_1 y sus mediciones asociadas
  const remainingProfiles = loaded.profiles.filter((p) => p.id !== 'p_1');
  const remainingReadings = loaded.readings.filter((r) => r.profileId !== 'p_1');
  saveLocalDb(storage, {
    schemaVersion: 2,
    profiles: remainingProfiles,
    readings: remainingReadings,
    activeProfileId: remainingProfiles[0].id,
  });

  const afterDelete = initializeOrMigrateLocalDb(storage);
  assert.equal(afterDelete.profiles.length, 2);
  assert.equal(afterDelete.readings.length, 1);
  assert.equal(afterDelete.readings[0].profileId, 'p_2');
});

test('6 & 7. Conversión mg/dL <-> mmol/L, rangos configurables y deduplicación', () => {
  assert.equal(mgDlToMmol(180), 10.0);
  assert.equal(mmolToMgDl(5.5), 99);
  assert.equal(formatGlucoseValue(108, 'mmol/L'), '6.0');

  const normalEval = evaluateReadingSeverity(115, 'fasting', 70, 140);
  assert.equal(normalEval.severity, 'normal');

  const strictEval = evaluateReadingSeverity(115, 'fasting', 70, 110);
  assert.equal(strictEval.severity, 'caution');

  const ts = Date.now();
  const existing: GlucoseReading[] = [
    {
      id: 'ex_1',
      profileId: 'p_1',
      valueMgDl: 112,
      timestamp: ts,
      context: 'fasting',
      quickTags: [],
      note: '',
      captureMethod: 'bluetooth',
      deviceModel: 'Glucocare Match',
    },
  ];

  const dedup = deduplicateIncomingReadings(existing, [
    {
      profileId: 'p_1',
      valueMgDl: 112,
      timestamp: ts + 10000, // mismo minuto
      context: 'fasting',
      quickTags: [],
      note: '',
      captureMethod: 'bluetooth',
      deviceModel: 'Glucocare Match',
    },
    {
      profileId: 'p_1',
      valueMgDl: 124,
      timestamp: ts + 120000,
      context: 'post_meal_1h',
      quickTags: [],
      note: '',
      captureMethod: 'bluetooth',
      deviceModel: 'Glucocare Match',
    },
  ]);

  assert.equal(dedup.skippedDuplicates, 1);
  assert.equal(dedup.uniqueReadings.length, 1);
  assert.equal(dedup.uniqueReadings[0].valueMgDl, 124);
});

test('8. Decodificador estándar de glucosa (0x2A18) y cálculo de estadísticas', () => {
  // Construir paquete 0x2A18: flags=0x02 (concentración presente, kg/L, sin time offset)
  // seq=1, year=2026 (0x07EA), month=11, day=23, hour=8, min=30, sec=0
  // SFLOAT 110 mg/dL = 0.00110 kg/L = 110 * 10^-5 (exp=-5 -> 0xB, mantissa=110 -> 0x06E -> 0xB06E)
  const buffer = new ArrayBuffer(14);
  const view = new DataView(buffer);
  view.setUint8(0, 0x02);
  view.setUint16(1, 1, true);
  view.setUint16(3, 2026, true);
  view.setUint8(5, 11);
  view.setUint8(6, 23);
  view.setUint8(7, 8);
  view.setUint8(8, 30);
  view.setUint8(9, 0);
  view.setUint16(10, 0xb06e, true);

  const parsed = parseStandardGlucoseMeasurement(view);
  assert.ok(parsed !== null);
  assert.equal(parsed.valueMgDl, 110);

  const stats = computeGlucoseStats([
    {
      id: 's1',
      profileId: 'p1',
      valueMgDl: 100,
      timestamp: Date.now(),
      context: 'fasting',
      quickTags: [],
      note: '',
      captureMethod: 'manual',
      deviceModel: 'Glucomax',
    },
    {
      id: 's2',
      profileId: 'p1',
      valueMgDl: 130,
      timestamp: Date.now(),
      context: 'post_meal_2h',
      quickTags: [],
      note: '',
      captureMethod: 'bluetooth',
      deviceModel: 'Glucocare Match',
    },
  ]);

  assert.equal(stats.count, 2);
  assert.equal(stats.avgMgDl, 115);
  assert.equal(stats.inRangePercent, 100);
});

test('9. Generación de reporte PDF de Glucosoft App sin referencias a nombres antiguos', () => {
  const profile: LocalProfile = {
    id: 'p_pdf',
    name: 'Carlos Mendoza',
    unitPreference: 'mg/dL',
    targetMinMgDl: 70,
    targetMaxMgDl: 140,
    accentHex: '#0F766E',
    createdAt: Date.now(),
  };

  const { doc, fileName } = buildClinicalPdfDocument(
    profile,
    [
      {
        id: 'r_pdf_1',
        profileId: 'p_pdf',
        valueMgDl: 112,
        timestamp: Date.now(),
        context: 'fasting',
        quickTags: ['Tomé agua'],
        note: 'Control matutino',
        captureMethod: 'manual',
        deviceModel: 'Glucocare D',
      },
    ],
    'Últimos 14 días'
  );

  assert.equal(fileName, 'Glucosoft_Reporte_Carlos_Mendoza.pdf');
  const pdfOutput = doc.output('arraybuffer');
  assert.ok(pdfOutput.byteLength > 1000);
});
