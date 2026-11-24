import 'package:flutter_test/flutter_test.dart';
import 'package:glucosoft_app/models/glucose_models.dart';
import 'package:glucosoft_app/services/ble_glucose_service.dart';
import 'package:glucosoft_app/services/glucose_math.dart';

void main() {
  test('Conversión exacta mg/dL <-> mmol/L', () {
    expect(GlucoseMath.mgDlToMmol(180), 10.0);
    expect(GlucoseMath.mmolToMgDl(5.5), 99);
    expect(GlucoseMath.formatValue(108, GlucoseUnit.mmolL), '6.0');
  });

  test('Evaluación orientativa respeta rangos configurables', () {
    final normal = GlucoseMath.evaluateSeverity(
      valueMgDl: 120,
      context: MeasurementContext.fasting,
      targetMinMgDl: 70,
      targetMaxMgDl: 140,
    );
    expect(normal.severity, GlucoseSeverity.normal);

    final strict = GlucoseMath.evaluateSeverity(
      valueMgDl: 120,
      context: MeasurementContext.fasting,
      targetMinMgDl: 70,
      targetMaxMgDl: 110,
    );
    expect(strict.severity, GlucoseSeverity.caution);
  });

  test('Decodificador estándar de glucosa 0x2A18 interpreta SFLOAT correctamente', () {
    // 110 mg/dL -> 110 * 10^-5 kg/L -> exp=-5 (0xB), mantissa=110 (0x06E) -> 0xB06E
    final bytes = <int>[
      0x02, // flags: concentration present, kg/L, no time offset
      0x01, 0x00, // sequence 1
      0xEA, 0x07, // year 2026
      11, 23, 8, 30, 0, // 2026-11-23 08:30:00
      0x6E, 0xB0, // SFLOAT 110 mg/dL
    ];

    final parsed = BleGlucoseService.parseStandardGlucoseMeasurement(bytes);
    expect(parsed, isNotNull);
    expect(parsed!.valueMgDl, 110);
  });

  test('Serialización de perfil y medición conserva método y modelo del glucómetro', () {
    final profile = UserProfile(
      id: 'p_1',
      name: 'María',
      preferredUnit: GlucoseUnit.mgDl,
      targetMinMgDl: 75,
      targetMaxMgDl: 135,
      emergencyContact: const EmergencyContact(
        name: 'Juan',
        phone: '+57 300 000 0000',
        relation: 'Esposo',
      ),
      createdAtMs: 1700000000000,
    );

    final map = profile.toDbMap();
    final restored = UserProfile.fromDbMap(map);
    expect(restored.name, 'María');
    expect(restored.targetMinMgDl, 75);
    expect(restored.emergencyContact?.name, 'Juan');

    const reading = GlucoseReading(
      id: 'r_1',
      profileId: 'p_1',
      valueMgDl: 114,
      unitEntered: GlucoseUnit.mgDl,
      timestampMs: 1700000000000,
      context: MeasurementContext.fasting,
      captureMethod: CaptureMethod.manual,
      deviceModel: 'Glucocare Match',
    );
    final restoredReading = GlucoseReading.fromDbMap(reading.toDbMap());
    expect(restoredReading.deviceModel, 'Glucocare Match');
    expect(restoredReading.captureMethod, CaptureMethod.manual);
  });
}
