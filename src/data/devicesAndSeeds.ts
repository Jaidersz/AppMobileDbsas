import {
  BiomedicalDeviceId,
  BiomedicalDeviceSpec,
  MeasurementContext,
} from '../types/glucose';

export const BIOMEDICAL_DEVICES: BiomedicalDeviceSpec[] = [
  {
    id: 'OKMeter_Match_II',
    displayName: 'OKMeter Match II',
    advertisedNames: ['Match II', 'OKMeter', 'OK-Meter', 'OK Pro'],
    confirmedReadTimeSeconds: 5,
    supportsMultiSample: false,
    memoryCapacityLabel: 'Hasta 1,000 memorias internas',
    hasConfirmedBluetooth: false,
    verificationStatus: 'non_ble_base_variant_possible',
    protocolNotes:
      'La versión estándar de OKMeter Match II opera de forma local sin Bluetooth integrado; variantes Bluetooth de la línea OKMeter deben validarse con el equipo físico para confirmar si implementan el perfil estándar de glucosa o un servicio propietario.',
    summary: 'Medidor rápido de 5 segundos · Requiere validación física si tu lote incluye Bluetooth',
  },
  {
    id: 'GlucoLeader_Enhance',
    displayName: 'GlucoLeader Enhance',
    advertisedNames: ['GlucoLeader', 'Glucoleader', 'Enhance', 'HMD'],
    confirmedReadTimeSeconds: 5,
    supportsMultiSample: true,
    memoryCapacityLabel: 'Hasta 800 memorias internas',
    hasConfirmedBluetooth: true,
    verificationStatus: 'needs_physical_validation',
    protocolNotes:
      'Cuenta con variantes Bluetooth para sincronización móvil (fabricante HMD Biomedical / Diagnósticos Biomédicos). Se debe validar físicamente si expone el perfil estándar de glucosa o protocolo serial propietario.',
    summary: 'Permite segunda confirmación · Versión Bluetooth pendiente de validación física',
  },
  {
    id: 'Glucocare_D',
    displayName: 'Glucocare D',
    advertisedNames: ['Glucocare D', 'Glucocare', 'DB Life'],
    confirmedReadTimeSeconds: 5,
    supportsMultiSample: false,
    memoryCapacityLabel: '180 a 1,000 memorias según lote',
    hasConfirmedBluetooth: true,
    verificationStatus: 'needs_physical_validation',
    protocolNotes:
      'Modelos recientes de la serie Glucocare incluyen Bluetooth; otros lotes funcionan únicamente con memoria local. Requiere prueba física para confirmar características de transmisión y lectura de memoria.',
    summary: 'Lectura rápida de 5 segundos · Pendiente de validación física según lote',
  },
  {
    id: 'Glucomax',
    displayName: 'Glucomax',
    advertisedNames: ['Glucomax', 'GlucoMax'],
    confirmedReadTimeSeconds: 8,
    supportsMultiSample: false,
    memoryCapacityLabel: 'Hasta 450 memorias internas',
    hasConfirmedBluetooth: false,
    verificationStatus: 'needs_physical_validation',
    protocolNotes:
      'Equipo electroquímico de 8 segundos. Debe verificarse con la unidad física si posee radio Bluetooth activa o si sus resultados se registran manualmente en la aplicación.',
    summary: 'Lectura en 8 segundos · Requiere confirmar disponibilidad Bluetooth en unidad física',
  },
  {
    id: 'Glucocare_Match',
    displayName: 'Glucocare Match',
    advertisedNames: ['Glucocare Match', 'GLM-76L', 'Match', 'DB Life'],
    confirmedReadTimeSeconds: 8,
    supportsMultiSample: false,
    memoryCapacityLabel: 'Memoria interna según versión (GLM-76L)',
    hasConfirmedBluetooth: true,
    verificationStatus: 'standard_ble_candidate',
    protocolNotes:
      'El modelo Glucocare Match (GLM-76L) cuenta con conectividad Bluetooth integrada. Se intenta conexión mediante servicio estándar de glucosa y lectura genérica de servicios, pendiente de verificación con el equipo físico.',
    summary: 'Con Bluetooth integrado · Listo para prueba y validación con equipo físico',
  },
];

export const DEVICE_BY_ID: Record<BiomedicalDeviceId, BiomedicalDeviceSpec> = {
  ...BIOMEDICAL_DEVICES.reduce(
    (acc, device) => {
      acc[device.id] = device;
      return acc;
    },
    {} as Record<BiomedicalDeviceId, BiomedicalDeviceSpec>
  ),
  Otro_Compatible: {
    id: 'Otro_Compatible',
    displayName: 'Otro glucómetro compatible',
    advertisedNames: [],
    supportsMultiSample: false,
    memoryCapacityLabel: 'Variable según fabricante',
    hasConfirmedBluetooth: true,
    verificationStatus: 'standard_ble_candidate',
    protocolNotes:
      'Dispositivo estándar de glucosa o equipo ingresado manualmente.',
    summary: 'Equipo estándar o registro manual personalizado',
  },
};

export const MEASUREMENT_CONTEXTS: {
  id: MeasurementContext;
  label: string;
  shortLabel: string;
  description: string;
}[] = [
  {
    id: 'fasting',
    label: 'En ayunas',
    shortLabel: 'En ayunas',
    description: 'Al despertar, antes de desayunar',
  },
  {
    id: 'pre_meal',
    label: 'Antes de comer',
    shortLabel: 'Antes de comer',
    description: 'Justo antes del almuerzo o la cena',
  },
  {
    id: 'post_meal_1h',
    label: 'Una hora después de comer',
    shortLabel: '1h después',
    description: 'Una hora después de terminar tu comida',
  },
  {
    id: 'post_meal_2h',
    label: 'Dos horas después de comer',
    shortLabel: '2h después',
    description: 'Control habitual dos horas después de comer',
  },
  {
    id: 'bedtime',
    label: 'Antes de dormir',
    shortLabel: 'Al dormir',
    description: 'Para revisar cómo estás antes de descansar',
  },
  {
    id: 'symptoms',
    label: 'Después de presentar síntomas',
    shortLabel: 'Con síntomas',
    description: 'Mareo, temblor, sudoración o cansancio',
  },
];

export const QUICK_TAGS = [
  'Comí postre',
  'Hice ejercicio',
  'Tomé medicina',
  'Día estresante',
  'Tomé agua',
  'Comida ligera',
];

export const MAX_LOCAL_PROFILES = 3;

export const PROFILE_COLORS = ['#0F766E', '#0284C7', '#4F46E5'];
