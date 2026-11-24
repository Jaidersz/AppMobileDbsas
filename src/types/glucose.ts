export type GlucoseUnit = 'mg/dL' | 'mmol/L';

export type BiomedicalDeviceId =
  | 'OKMeter_Match_II'
  | 'GlucoLeader_Enhance'
  | 'Glucocare_D'
  | 'Glucomax'
  | 'Glucocare_Match'
  | 'Otro_Compatible';

export type HardwareVerificationStatus =
  | 'needs_physical_validation'
  | 'standard_ble_candidate'
  | 'non_ble_base_variant_possible';

export interface BiomedicalDeviceSpec {
  id: BiomedicalDeviceId;
  displayName: string;
  advertisedNames: string[];
  confirmedReadTimeSeconds?: 5 | 8;
  supportsMultiSample: boolean;
  memoryCapacityLabel: string;
  hasConfirmedBluetooth: boolean;
  verificationStatus: HardwareVerificationStatus;
  protocolNotes: string;
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

export type CaptureMethod = 'manual' | 'bluetooth';

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

export interface LocalProfile {
  id: string;
  name: string;
  unitPreference: GlucoseUnit;
  targetMinMgDl: number;
  targetMaxMgDl: number;
  accentHex: string;
  createdAt: number;
  updatedAt?: number;
  emergencyContact?: EmergencyContact;
}

export interface GlucoseReading {
  id: string;
  profileId: string;
  valueMgDl: number;
  originalUnit?: GlucoseUnit;
  timestamp: number;
  context: MeasurementContext;
  quickTags: string[];
  note: string;
  captureMethod: CaptureMethod;
  deviceModel: string;
  deviceId?: BiomedicalDeviceId;
  deviceInfoSummary?: string;
}

export type PatientTab =
  | 'home'
  | 'history'
  | 'devices'
  | 'emergency'
  | 'profiles';

export type TextScaleMode = 'normal' | 'large';
