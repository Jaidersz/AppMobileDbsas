import {
  BiomedicalDeviceId,
  BiomedicalDeviceSpec,
  GlucoseReading,
  LocalProfile,
  MeasurementContext,
} from '../types/glucose';

export const BIOMEDICAL_DEVICES: BiomedicalDeviceSpec[] = [
  {
    id: 'OKMeter_Match_II',
    displayName: 'OKMeter Match II',
    advertisedName: 'Match II',
    readTimeSeconds: 5,
    supportsMultiSample: false,
    memoryCapacity: 1000,
    serviceUuid: '00001808-0000-1000-8000-00805f9b34fb',
    characteristicUuid: '00002a18-0000-1000-8000-00805f9b34fb',
    racpUuid: '00002a52-0000-1000-8000-00805f9b34fb',
    summary: 'Lectura rápida en 5s · Memoria interna de hasta 1000 resultados',
  },
  {
    id: 'GlucoLeader_Enhance',
    displayName: 'GlucoLeader Enhance',
    advertisedName: 'Glucoleader',
    readTimeSeconds: 5,
    supportsMultiSample: true,
    memoryCapacity: 500,
    serviceUuid: '00001808-0000-1000-8000-00805f9b34fb',
    characteristicUuid: '00002a18-0000-1000-8000-00805f9b34fb',
    racpUuid: '00002a52-0000-1000-8000-00805f9b34fb',
    summary: 'Protocolo Multimuestra de verificación · Lectura 5s por muestra',
  },
  {
    id: 'Glucocare_D',
    displayName: 'Glucocare D',
    advertisedName: 'Glucocare D',
    readTimeSeconds: 5,
    supportsMultiSample: false,
    memoryCapacity: 1000,
    serviceUuid: '00001808-0000-1000-8000-00805f9b34fb',
    characteristicUuid: '00002a18-0000-1000-8000-00805f9b34fb',
    racpUuid: '00002a52-0000-1000-8000-00805f9b34fb',
    summary: 'Lectura rápida en 5s · Memoria de hasta 1000 registros con Sync RACP',
  },
  {
    id: 'Glucomax',
    displayName: 'Glucomax',
    advertisedName: 'Glucomax',
    readTimeSeconds: 8,
    supportsMultiSample: false,
    memoryCapacity: 450,
    serviceUuid: '00001808-0000-1000-8000-00805f9b34fb',
    characteristicUuid: '00002a18-0000-1000-8000-00805f9b34fb',
    racpUuid: '00002a52-0000-1000-8000-00805f9b34fb',
    summary: 'Análisis enzimático estable de 8s · Memoria interna de 450 tomas',
  },
  {
    id: 'Glucocare_Match',
    displayName: 'Glucocare Match',
    advertisedName: 'Glucocare Match',
    readTimeSeconds: 8,
    supportsMultiSample: false,
    memoryCapacity: 500,
    serviceUuid: '00001808-0000-1000-8000-00805f9b34fb',
    characteristicUuid: '00002a18-0000-1000-8000-00805f9b34fb',
    racpUuid: '00002a52-0000-1000-8000-00805f9b34fb',
    summary: 'Lectura estándar de 8s · Transmisión BLE directa',
  },
];

export const DEVICE_BY_ID: Record<BiomedicalDeviceId, BiomedicalDeviceSpec> =
  BIOMEDICAL_DEVICES.reduce(
    (acc, device) => {
      acc[device.id] = device;
      return acc;
    },
    {} as Record<BiomedicalDeviceId, BiomedicalDeviceSpec>
  );

export const MEASUREMENT_CONTEXTS: {
  id: MeasurementContext;
  label: string;
  shortLabel: string;
  description: string;
}[] = [
  {
    id: 'fasting',
    label: 'En ayunas',
    shortLabel: 'Ayunas',
    description: 'Mínimo 8 horas sin ingesta calórica',
  },
  {
    id: 'pre_meal',
    label: 'Antes de comer',
    shortLabel: 'Pre-comida',
    description: 'Justo antes de desayuno, almuerzo o cena',
  },
  {
    id: 'post_meal_1h',
    label: '1 hora después de comer',
    shortLabel: '1h Post',
    description: 'Pico postprandial temprano',
  },
  {
    id: 'post_meal_2h',
    label: '2 horas después de comer',
    shortLabel: '2h Post',
    description: 'Control postprandial estándar',
  },
  {
    id: 'bedtime',
    label: 'Antes de dormir',
    shortLabel: 'Nocturna',
    description: 'Verificación de seguridad nocturna',
  },
  {
    id: 'symptoms',
    label: 'Tras sentir síntomas',
    shortLabel: 'Síntomas',
    description: 'Mareo, temblor, sudoración o fatiga',
  },
];

export const QUICK_TAGS = [
  'Comí postre',
  'Hice ejercicio',
  'Medicación',
  'Estrés',
  'Hidratación',
  'Desayuno ligero',
];

export const MAX_LOCAL_PROFILES = 3;

export const PROFILE_COLORS = ['#007AFF', '#0D9488', '#4F46E5'];

export function createSeedData(): {
  profiles: LocalProfile[];
  readings: GlucoseReading[];
} {
  const now = Date.now();
  const hour = 3600 * 1000;
  const day = 24 * hour;

  const profiles: LocalProfile[] = [
    {
      id: 'prof_mateo',
      name: 'Mateo Vargas',
      unitPreference: 'mg/dL',
      targetMinMgDl: 70,
      targetMaxMgDl: 140,
      accentHex: '#007AFF',
      createdAt: now - 25 * day,
    },
    {
      id: 'prof_elena',
      name: 'Elena Ríos',
      unitPreference: 'mmol/L',
      targetMinMgDl: 70,
      targetMaxMgDl: 140,
      accentHex: '#0D9488',
      createdAt: now - 14 * day,
    },
  ];

  const readings: GlucoseReading[] = [
    {
      id: 'rd_m1',
      profileId: 'prof_mateo',
      valueMgDl: 98,
      timestamp: now - 6 * day + 7.5 * hour,
      context: 'fasting',
      quickTags: ['Hidratación'],
      note: 'Despertar tranquilo, buen descanso.',
      deviceInfo: 'OKMeter_Match_II',
      source: 'ble',
    },
    {
      id: 'rd_m2',
      profileId: 'prof_mateo',
      valueMgDl: 152,
      timestamp: now - 5 * day + 14 * hour,
      context: 'post_meal_2h',
      quickTags: ['Comí postre'],
      note: 'Almuerzo familiar con fruta dulce.',
      deviceInfo: 'OKMeter_Match_II',
      source: 'ble',
    },
    {
      id: 'rd_m3',
      profileId: 'prof_mateo',
      valueMgDl: 112,
      timestamp: now - 4 * day + 21.5 * hour,
      context: 'bedtime',
      quickTags: ['Hice ejercicio'],
      note: 'Caminata de 35 minutos en la tarde.',
      deviceInfo: 'Glucocare_D',
      source: 'ble_sync',
    },
    {
      id: 'rd_m4',
      profileId: 'prof_mateo',
      valueMgDl: 104,
      timestamp: now - 3 * day + 8 * hour,
      context: 'fasting',
      quickTags: ['Medicación'],
      note: 'Dosis matutina tomada a tiempo.',
      deviceInfo: 'OKMeter_Match_II',
      source: 'ble',
    },
    {
      id: 'rd_m5',
      profileId: 'prof_mateo',
      valueMgDl: 196,
      timestamp: now - 2 * day + 15 * hour,
      context: 'post_meal_1h',
      quickTags: ['Comí postre', 'Estrés'],
      note: 'Reunión laboral intensa después de comer.',
      deviceInfo: 'GlucoLeader_Enhance',
      source: 'ble',
      multiSampleValuesMgDl: [194, 198],
    },
    {
      id: 'rd_m6',
      profileId: 'prof_mateo',
      valueMgDl: 118,
      timestamp: now - 1 * day + 12.5 * hour,
      context: 'pre_meal',
      quickTags: ['Desayuno ligero'],
      note: '',
      deviceInfo: 'Glucocare_D',
      source: 'ble',
    },
    {
      id: 'rd_m7',
      profileId: 'prof_mateo',
      valueMgDl: 106,
      timestamp: now - 3 * hour,
      context: 'fasting',
      quickTags: ['Hidratación'],
      note: 'Control matutino estable.',
      deviceInfo: 'OKMeter_Match_II',
      source: 'ble',
    },
    {
      id: 'rd_e1',
      profileId: 'prof_elena',
      valueMgDl: 92,
      timestamp: now - 4 * day + 7 * hour,
      context: 'fasting',
      quickTags: [],
      note: 'En ayunas sin novedad.',
      deviceInfo: 'Glucomax',
      source: 'ble',
    },
    {
      id: 'rd_e2',
      profileId: 'prof_elena',
      valueMgDl: 138,
      timestamp: now - 2 * day + 14.5 * hour,
      context: 'post_meal_2h',
      quickTags: ['Hice ejercicio'],
      note: 'Estiramiento suave tras almorzar.',
      deviceInfo: 'Glucocare_Match',
      source: 'ble',
    },
    {
      id: 'rd_e3',
      profileId: 'prof_elena',
      valueMgDl: 64,
      timestamp: now - 10 * hour,
      context: 'symptoms',
      quickTags: ['Desayuno ligero'],
      note: 'Leve sensación de mareo antes de cenar.',
      deviceInfo: 'Glucomax',
      source: 'ble',
    },
  ];

  return { profiles, readings };
}

/**
 * Simula la memoria interna de hasta 1000 registros almacenados en equipos
 * como Glucocare_D y OKMeter_Match_II, incluyendo deliberadamente 1-2 registros
 * con timestamp idéntico a lecturas ya existentes para validar la deduplicación.
 */
export function buildSimulatedDeviceMemoryBuffer(
  deviceId: BiomedicalDeviceId,
  existingReadings: GlucoseReading[],
  profileId: string
): Omit<GlucoseReading, 'id'>[] {
  const now = Date.now();
  const hour = 3600 * 1000;
  const day = 24 * hour;

  const existingDuplicate = existingReadings[0];
  const duplicateSample: Omit<GlucoseReading, 'id'> = existingDuplicate
    ? {
        profileId,
        valueMgDl: existingDuplicate.valueMgDl,
        timestamp: existingDuplicate.timestamp,
        context: existingDuplicate.context,
        quickTags: existingDuplicate.quickTags,
        note: 'Registro ya sincronizado previamente en memoria del equipo',
        deviceInfo: deviceId,
        source: 'ble_sync',
      }
    : {
        profileId,
        valueMgDl: 109,
        timestamp: now - 4 * hour,
        context: 'fasting',
        quickTags: [],
        note: 'Lectura de memoria interna',
        deviceInfo: deviceId,
        source: 'ble_sync',
      };

  const freshReadings: Omit<GlucoseReading, 'id'>[] = [
    {
      profileId,
      valueMgDl: 101,
      timestamp: now - 5 * day + 8.2 * hour,
      context: 'fasting',
      quickTags: ['Hidratación'],
      note: 'Descargado automáticamente de memoria interna',
      deviceInfo: deviceId,
      source: 'ble_sync',
    },
    {
      profileId,
      valueMgDl: 144,
      timestamp: now - 3 * day + 14.3 * hour,
      context: 'post_meal_2h',
      quickTags: [],
      note: 'Descargado automáticamente de memoria interna',
      deviceInfo: deviceId,
      source: 'ble_sync',
    },
    {
      profileId,
      valueMgDl: 127,
      timestamp: now - 1 * day + 21.1 * hour,
      context: 'bedtime',
      quickTags: ['Medicación'],
      note: 'Descargado automáticamente de memoria interna',
      deviceInfo: deviceId,
      source: 'ble_sync',
    },
    {
      profileId,
      valueMgDl: 168,
      timestamp: now - 18 * hour,
      context: 'post_meal_1h',
      quickTags: ['Comí postre'],
      note: 'Descargado automáticamente de memoria interna',
      deviceInfo: deviceId,
      source: 'ble_sync',
    },
  ];

  return [duplicateSample, ...freshReadings];
}
