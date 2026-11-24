import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:permission_handler/permission_handler.dart';
import '../models/glucose_models.dart';

class DiscoveredGlucometer {
  final BluetoothDevice device;
  final String advertisedName;
  final int rssi;
  final BiomedicalDeviceSpec? matchedSpec;

  const DiscoveredGlucometer({
    required this.device,
    required this.advertisedName,
    required this.rssi,
    this.matchedSpec,
  });
}

class ConnectedMeterInfo {
  final BluetoothDevice device;
  final String realName;
  final String displayModel;
  final bool supportsStandardGlucose;
  final bool supportsMemorySync;
  final List<String> discoveredServicesSummary;
  final String diagnosticNote;

  const ConnectedMeterInfo({
    required this.device,
    required this.realName,
    required this.displayModel,
    required this.supportsStandardGlucose,
    required this.supportsMemorySync,
    required this.discoveredServicesSummary,
    required this.diagnosticNote,
  });
}

class ParsedBleGlucose {
  final int valueMgDl;
  final DateTime timestamp;

  const ParsedBleGlucose({
    required this.valueMgDl,
    required this.timestamp,
  });
}

class BleGlucoseService {
  static final Guid glucoseServiceUuid =
      Guid('00001808-0000-1000-8000-00805f9b34fb');
  static final Guid glucoseMeasurementCharUuid =
      Guid('00002a18-0000-1000-8000-00805f9b34fb');
  static final Guid racpCharUuid =
      Guid('00002a52-0000-1000-8000-00805f9b34fb');

  BluetoothCharacteristic? _racpChar;
  StreamSubscription<List<int>>? _measurementSub;
  StreamSubscription<BluetoothConnectionState>? _connectionSub;

  Future<bool> ensureBluetoothPermissions() async {
    if (Platform.isAndroid) {
      final statuses = await [
        Permission.bluetoothScan,
        Permission.bluetoothConnect,
        Permission.locationWhenInUse,
      ].request();

      final scanOk = statuses[Permission.bluetoothScan]?.isGranted ?? false;
      final connectOk = statuses[Permission.bluetoothConnect]?.isGranted ?? false;
      final locOk = statuses[Permission.locationWhenInUse]?.isGranted ?? false;
      return (scanOk && connectOk) || locOk;
    }
    return true;
  }

  static BiomedicalDeviceSpec? matchKnownModel(String advertisedName) {
    final lower = advertisedName.toLowerCase();
    for (final spec in kGlucometerCatalog) {
      for (final prefix in spec.advertisedPrefixes) {
        if (lower.contains(prefix.toLowerCase())) {
          return spec;
        }
      }
    }
    return null;
  }

  /// Decodificador oficial Bluetooth SIG (característica 0x2A18).
  static ParsedBleGlucose? parseStandardGlucoseMeasurement(List<int> bytes) {
    if (bytes.length < 12) return null;
    final flags = bytes[0];
    final hasTimeOffset = (flags & 0x01) != 0;
    final hasConcentration = (flags & 0x02) != 0;
    if (!hasConcentration) return null;

    DateTime timestamp = DateTime.now();
    if (bytes.length >= 10) {
      final year = (bytes[4] << 8) | bytes[3];
      final month = bytes[5];
      final day = bytes[6];
      final hour = bytes[7];
      final minute = bytes[8];
      final second = bytes[9];
      if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        int offsetMinutes = 0;
        if (hasTimeOffset && bytes.length >= 12) {
          final rawOff = (bytes[11] << 8) | bytes[10];
          offsetMinutes = rawOff >= 0x8000 ? rawOff - 0x10000 : rawOff;
        }
        timestamp = DateTime(year, month, day, hour, minute, second)
            .add(Duration(minutes: offsetMinutes));
      }
    }

    final concOffset = hasTimeOffset ? 12 : 10;
    if (bytes.length < concOffset + 2) return null;

    final raw = (bytes[concOffset + 1] << 8) | bytes[concOffset];
    final mantissaRaw = raw & 0x0FFF;
    final mantissa = mantissaRaw >= 0x0800 ? mantissaRaw - 0x1000 : mantissaRaw;
    final expRaw = (raw >> 12) & 0x0F;
    final exponent = expRaw >= 0x08 ? expRaw - 0x10 : expRaw;

    final value = mantissa * math.pow(10, exponent).toDouble();
    final isMolPerL = (flags & 0x04) != 0;
    final mgDl = isMolPerL ? value * 18018.2 : value * 100000.0;
    if (mgDl.isNaN || mgDl < 20 || mgDl > 650) return null;

    return ParsedBleGlucose(
      valueMgDl: mgDl.round(),
      timestamp: timestamp,
    );
  }

  Stream<List<DiscoveredGlucometer>> scanForGlucometers() async* {
    final granted = await ensureBluetoothPermissions();
    if (!granted) {
      throw StateError('Se requieren permisos de Bluetooth para buscar glucómetros.');
    }

    final adapterState = await FlutterBluePlus.adapterState.first;
    if (adapterState != BluetoothAdapterState.on) {
      throw StateError('Enciende el Bluetooth de tu teléfono para buscar tu glucómetro.');
    }

    await FlutterBluePlus.startScan(timeout: const Duration(seconds: 12));

    yield* FlutterBluePlus.scanResults.map((results) {
      final list = <DiscoveredGlucometer>[];
      for (final r in results) {
        final name = r.device.platformName.trim();
        final advName = r.advertisementData.advName.trim();
        final effectiveName = name.isNotEmpty ? name : advName;
        final advertisesGlucose =
            r.advertisementData.serviceUuids.contains(glucoseServiceUuid);
        final matched = effectiveName.isNotEmpty ? matchKnownModel(effectiveName) : null;

        if (advertisesGlucose || matched != null || effectiveName.isNotEmpty) {
          list.add(
            DiscoveredGlucometer(
              device: r.device,
              advertisedName: effectiveName.isNotEmpty ? effectiveName : 'Dispositivo cercano',
              rssi: r.rssi,
              matchedSpec: matched,
            ),
          );
        }
      }
      return list;
    });
  }

  Future<void> stopScan() async {
    await FlutterBluePlus.stopScan();
  }

  Future<ConnectedMeterInfo> connectAndInspect({
    required BluetoothDevice device,
    required void Function(ParsedBleGlucose reading) onReadingReceived,
    required void Function() onDisconnected,
  }) async {
    await stopScan();
    await device.connect(timeout: const Duration(seconds: 12));

    await _connectionSub?.cancel();
    _connectionSub = device.connectionState.listen((state) {
      if (state == BluetoothConnectionState.disconnected) {
        _racpChar = null;
        onDisconnected();
      }
    });

    final services = await device.discoverServices();
    final serviceUuids = services.map((s) => s.uuid.toString()).toList();
    final realName = device.platformName.trim().isNotEmpty
        ? device.platformName.trim()
        : 'Glucómetro Bluetooth';
    final spec = matchKnownModel(realName);
    final displayModel = spec?.displayName ?? realName;

    bool supportsStandard = false;
    bool supportsRacp = false;

    for (final service in services) {
      if (service.uuid == glucoseServiceUuid) {
        for (final ch in service.characteristics) {
          if (ch.uuid == glucoseMeasurementCharUuid) {
            await ch.setNotifyValue(true);
            await _measurementSub?.cancel();
            _measurementSub = ch.onValueReceived.listen((bytes) {
              final parsed = parseStandardGlucoseMeasurement(bytes);
              if (parsed != null) {
                onReadingReceived(parsed);
              }
            });
            supportsStandard = true;
          } else if (ch.uuid == racpCharUuid) {
            await ch.setNotifyValue(true);
            _racpChar = ch;
            supportsRacp = true;
          }
        }
      }
    }

    final note = supportsStandard
        ? (supportsRacp
            ? 'Compatible con transmisión estándar y consulta de memoria.'
            : 'Compatible con transmisión en vivo de mediciones.')
        : 'El equipo se conectó, pero no expone el servicio estándar de glucosa. Requiere validación física del protocolo propietario.';

    return ConnectedMeterInfo(
      device: device,
      realName: realName,
      displayModel: displayModel,
      supportsStandardGlucose: supportsStandard,
      supportsMemorySync: supportsRacp,
      discoveredServicesSummary: serviceUuids,
      diagnosticNote: note,
    );
  }

  Future<bool> requestStoredRecordsIfSupported() async {
    if (_racpChar == null) return false;
    await _racpChar!.write([0x01, 0x01], withoutResponse: false);
    return true;
  }

  Future<void> disconnect(BluetoothDevice? device) async {
    await _measurementSub?.cancel();
    await _connectionSub?.cancel();
    _racpChar = null;
    if (device != null) {
      await device.disconnect();
    }
  }
}
