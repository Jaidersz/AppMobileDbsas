enum GlucoseUnit {
  mgDl('mg/dL'),
  mmolL('mmol/L');

  final String label;
  const GlucoseUnit(this.label);

  static GlucoseUnit fromString(String? value) {
    return value == 'mmol/L' ? GlucoseUnit.mmolL : GlucoseUnit.mgDl;
  }
}

enum MeasurementContext {
  fasting('fasting', 'En ayunas', 'Al despertar, antes de desayunar'),
  preMeal('pre_meal', 'Antes de comer', 'Justo antes del almuerzo o la cena'),
  postMeal1h('post_meal_1h', 'Una hora después de comer', 'Una hora después de terminar tu comida'),
  postMeal2h('post_meal_2h', 'Dos horas después de comer', 'Control habitual dos horas después de comer'),
  bedtime('bedtime', 'Antes de dormir', 'Para revisar cómo estás antes de descansar'),
  symptoms('symptoms', 'Después de presentar síntomas', 'Mareo, temblor, sudoración o cansancio');

  final String key;
  final String label;
  final String description;
  const MeasurementContext(this.key, this.label, this.description);

  static MeasurementContext fromKey(String? key) {
    return MeasurementContext.values.firstWhere(
      (c) => c.key == key,
      orElse: () => MeasurementContext.fasting,
    );
  }
}

enum CaptureMethod {
  manual('manual', 'Manual'),
  bluetooth('bluetooth', 'Bluetooth');

  final String key;
  final String label;
  const CaptureMethod(this.key, this.label);

  static CaptureMethod fromKey(String? key) {
    return key == 'bluetooth' ? CaptureMethod.bluetooth : CaptureMethod.manual;
  }
}

enum GlucoseSeverity { normal, caution, alert }

class EmergencyContact {
  final String name;
  final String phone;
  final String relation;

  const EmergencyContact({
    required this.name,
    required this.phone,
    required this.relation,
  });
}

class UserProfile {
  final String id;
  final String name;
  final GlucoseUnit preferredUnit;
  final int targetMinMgDl;
  final int targetMaxMgDl;
  final EmergencyContact? emergencyContact;
  final int createdAtMs;

  const UserProfile({
    required this.id,
    required this.name,
    required this.preferredUnit,
    this.targetMinMgDl = 70,
    this.targetMaxMgDl = 140,
    this.emergencyContact,
    required this.createdAtMs,
  });

  Map<String, dynamic> toDbMap() {
    return {
      'id': id,
      'name': name,
      'preferred_unit': preferredUnit.label,
      'target_min_mg_dl': targetMinMgDl,
      'target_max_mg_dl': targetMaxMgDl,
      'emergency_name': emergencyContact?.name,
      'emergency_phone': emergencyContact?.phone,
      'emergency_relation': emergencyContact?.relation,
      'created_at_ms': createdAtMs,
    };
  }

  factory UserProfile.fromDbMap(Map<String, dynamic> map) {
    final eName = map['emergency_name'] as String?;
    final ePhone = map['emergency_phone'] as String?;
    final eRel = map['emergency_relation'] as String?;
    return UserProfile(
      id: map['id'] as String,
      name: map['name'] as String,
      preferredUnit: GlucoseUnit.fromString(map['preferred_unit'] as String?),
      targetMinMgDl: (map['target_min_mg_dl'] as int?) ?? 70,
      targetMaxMgDl: (map['target_max_mg_dl'] as int?) ?? 140,
      emergencyContact: (eName != null && eName.isNotEmpty && ePhone != null && ePhone.isNotEmpty)
          ? EmergencyContact(
              name: eName,
              phone: ePhone,
              relation: (eRel != null && eRel.isNotEmpty) ? eRel : 'Familiar / Confianza',
            )
          : null,
      createdAtMs: map['created_at_ms'] as int,
    );
  }

  UserProfile copyWith({
    String? name,
    GlucoseUnit? preferredUnit,
    int? targetMinMgDl,
    int? targetMaxMgDl,
    EmergencyContact? emergencyContact,
  }) {
    return UserProfile(
      id: id,
      name: name ?? this.name,
      preferredUnit: preferredUnit ?? this.preferredUnit,
      targetMinMgDl: targetMinMgDl ?? this.targetMinMgDl,
      targetMaxMgDl: targetMaxMgDl ?? this.targetMaxMgDl,
      emergencyContact: emergencyContact ?? this.emergencyContact,
      createdAtMs: createdAtMs,
    );
  }
}

class GlucoseReading {
  final String id;
  final String profileId;
  final int valueMgDl;
  final GlucoseUnit unitEntered;
  final int timestampMs;
  final MeasurementContext context;
  final List<String> tags;
  final String note;
  final CaptureMethod captureMethod;
  final String deviceModel;
  final String? deviceInfo;

  const GlucoseReading({
    required this.id,
    required this.profileId,
    required this.valueMgDl,
    required this.unitEntered,
    required this.timestampMs,
    required this.context,
    this.tags = const [],
    this.note = '',
    required this.captureMethod,
    required this.deviceModel,
    this.deviceInfo,
  });

  Map<String, dynamic> toDbMap() {
    return {
      'id': id,
      'profile_id': profileId,
      'value_mg_dl': valueMgDl,
      'unit_entered': unitEntered.label,
      'timestamp_ms': timestampMs,
      'context': context.key,
      'tags': tags.join('||'),
      'note': note,
      'capture_method': captureMethod.key,
      'device_model': deviceModel,
      'device_info': deviceInfo,
    };
  }

  factory GlucoseReading.fromDbMap(Map<String, dynamic> map) {
    final rawTags = (map['tags'] as String?) ?? '';
    return GlucoseReading(
      id: map['id'] as String,
      profileId: map['profile_id'] as String,
      valueMgDl: map['value_mg_dl'] as int,
      unitEntered: GlucoseUnit.fromString(map['unit_entered'] as String?),
      timestampMs: map['timestamp_ms'] as int,
      context: MeasurementContext.fromKey(map['context'] as String?),
      tags: rawTags.isEmpty ? [] : rawTags.split('||'),
      note: (map['note'] as String?) ?? '',
      captureMethod: CaptureMethod.fromKey(map['capture_method'] as String?),
      deviceModel: (map['device_model'] as String?) ?? 'No especificado',
      deviceInfo: map['device_info'] as String?,
    );
  }
}

class BiomedicalDeviceSpec {
  final String id;
  final String displayName;
  final List<String> advertisedPrefixes;
  final String validationStatusLabel;
  final String technicalNotes;
  final String memoryCapacityLabel;

  const BiomedicalDeviceSpec({
    required this.id,
    required this.displayName,
    required this.advertisedPrefixes,
    required this.validationStatusLabel,
    required this.technicalNotes,
    required this.memoryCapacityLabel,
  });
}

const List<BiomedicalDeviceSpec> kGlucometerCatalog = [
  BiomedicalDeviceSpec(
    id: 'OKMeter_Match_II',
    displayName: 'OKMeter Match II',
    advertisedPrefixes: ['Match II', 'OKMeter', 'OK-Meter', 'OK Pro'],
    validationStatusLabel: 'Requiere validación física (versión estándar sin Bluetooth)',
    technicalNotes:
        'La versión base de OKMeter Match II funciona sin radio inalámbrica. Si dispones de una variante Bluetooth de esta línea, debe probarse físicamente si expone el perfil estándar 0x1808 o servicio propietario.',
    memoryCapacityLabel: 'Hasta 1,000 memorias internas',
  ),
  BiomedicalDeviceSpec(
    id: 'GlucoLeader_Enhance',
    displayName: 'GlucoLeader Enhance',
    advertisedPrefixes: ['GlucoLeader', 'Glucoleader', 'Enhance', 'HMD'],
    validationStatusLabel: 'Pendiente de validación física',
    technicalNotes:
        'Dispone de versión Bluetooth para sincronización móvil. Requiere validación física para confirmar si utiliza características estándar 0x1808/0x2A18 o canal serial propietario.',
    memoryCapacityLabel: 'Hasta 800 memorias internas',
  ),
  BiomedicalDeviceSpec(
    id: 'Glucocare_D',
    displayName: 'Glucocare D',
    advertisedPrefixes: ['Glucocare D', 'Glucocare', 'DB Life'],
    validationStatusLabel: 'Pendiente de validación física',
    technicalNotes:
        'Algunos lotes incluyen Bluetooth y otros operan solo con memoria local. Necesita validación física en el teléfono para confirmar lectura automática y memoria.',
    memoryCapacityLabel: '180 a 1,000 memorias según versión',
  ),
  BiomedicalDeviceSpec(
    id: 'Glucomax',
    displayName: 'Glucomax',
    advertisedPrefixes: ['Glucomax', 'GlucoMax'],
    validationStatusLabel: 'Requiere confirmar radio Bluetooth en equipo físico',
    technicalNotes:
        'Medidor de 8 segundos. Debe verificarse con el equipo físico si cuenta con transmisión inalámbrica activa o si su uso es exclusivamente por lectura manual.',
    memoryCapacityLabel: 'Hasta 450 memorias internas',
  ),
  BiomedicalDeviceSpec(
    id: 'Glucocare_Match',
    displayName: 'Glucocare Match',
    advertisedPrefixes: ['Glucocare Match', 'GLM-76L', 'Match', 'DB Life'],
    validationStatusLabel: 'Bluetooth integrado · Pendiente de prueba física',
    technicalNotes:
        'El modelo Glucocare Match (GLM-76L) cuenta con Bluetooth integrado. La app intenta descubrimiento estándar (0x1808) y diagnóstico de servicios para confirmar su formato real en físico.',
    memoryCapacityLabel: 'Según versión del equipo',
  ),
];

const List<String> kQuickTags = [
  'Comí postre',
  'Hice ejercicio',
  'Tomé medicina',
  'Día estresante',
  'Tomé agua',
  'Comida ligera',
];
