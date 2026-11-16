export type GlucoseUnit = 'mg/dL' | 'mmol/L';

export type BiomedicalDeviceId =
  | 'OKMeter_Match_II'
  | 'GlucoLeader_Enhance'
  | 'Glucocare_D'
  | 'Glucomax'
  | 'Glucocare_Match';

export interface BiomedicalDeviceSpec {
  id: BiomedicalDeviceId;
  displayName: string;
  advertisedName: string;
  readTimeSeconds: 5 | 8;
  supportsMultiSample: boolean;
  memoryCapacity: number;
  serviceUuid: string;
  characteristicUuid: string;
  racpUuid: string;
  summary: string;
}

export type MeasurementContext =
  | 'fasting'
  | 'pre_meal'
  | 'post_meal_1h'
  | 'post_meal_2h'
  | 'bedtime'
  | 'symptoms';

export type GlucoseSeverity = 'normal' | 'caution' | 'alert';

export type ReadingSource = 'ble' | 'ble_sync' | 'manual';

export interface LocalProfile {
  id: string;
  name: string;
  unitPreference: GlucoseUnit;
  targetMinMgDl: number;
  targetMaxMgDl: number;
  accentHex: string;
  createdAt: number;
}

export interface GlucoseReading {
  id: string;
  profileId: string;
  valueMgDl: number;
  timestamp: number;
  context: MeasurementContext;
  quickTags: string[];
  note: string;
  deviceInfo: BiomedicalDeviceId;
  source: ReadingSource;
  multiSampleValuesMgDl?: [number, number];
}

export type AppSection =
  | 'prototype'
  | 'isar'
  | 'wireframes'
  | 'ble'
  | 'architecture';
