import 'dart:async';
import 'package:flutter/material.dart';
import '../models/glucose_models.dart';
import '../services/ble_glucose_service.dart';

class GlucometerScreen extends StatefulWidget {
  final BleGlucoseService bleService;
  final ConnectedMeterInfo? connectedMeter;
  final void Function(ConnectedMeterInfo? info) onConnectionChanged;
  final void Function(ParsedBleGlucose reading, String modelName) onReadingArrived;

  const GlucometerScreen({
    super.key,
    required this.bleService,
    required this.connectedMeter,
    required this.onConnectionChanged,
    required this.onReadingArrived,
  });

  @override
  State<GlucometerScreen> createState() => _GlucometerScreenState();
}

class _GlucometerScreenState extends State<GlucometerScreen> {
  bool _scanning = false;
  bool _connecting = false;
  String? _errorMessage;
  String? _statusMessage;
  List<DiscoveredGlucometer> _discovered = [];
  StreamSubscription<List<DiscoveredGlucometer>>? _scanSub;

  @override
  void dispose() {
    _scanSub?.cancel();
    super.dispose();
  }

  Future<void> _startScan() async {
    setState(() {
      _scanning = true;
      _errorMessage = null;
      _statusMessage = 'Buscando glucómetros cercanos...';
      _discovered = [];
    });

    await _scanSub?.cancel();
    _scanSub = widget.bleService.scanForGlucometers().listen(
      (items) {
        if (mounted) {
          setState(() => _discovered = items);
        }
      },
      onError: (err) {
        if (mounted) {
          setState(() {
            _scanning = false;
            _errorMessage = err.toString().replaceFirst('Bad state: ', '');
          });
        }
      },
      onDone: () {
        if (mounted) {
          setState(() {
            _scanning = false;
            if (_discovered.isEmpty && _errorMessage == null) {
              _statusMessage =
                  'No se encontraron glucómetros cercanos. Verifica que esté encendido y en modo de emparejamiento.';
            }
          });
        }
      },
    );
  }

  Future<void> _connectToDevice(DiscoveredGlucometer item) async {
    setState(() {
      _connecting = true;
      _errorMessage = null;
      _statusMessage = 'Conectando con ${item.advertisedName}...';
    });

    try {
      final info = await widget.bleService.connectAndInspect(
        device: item.device,
        onReadingReceived: (parsed) {
          widget.onReadingArrived(
            parsed,
            item.matchedSpec?.displayName ?? item.advertisedName,
          );
        },
        onDisconnected: () {
          widget.onConnectionChanged(null);
          if (mounted) {
            setState(() {
              _statusMessage = 'El glucómetro se desconectó.';
            });
          }
        },
      );
      widget.onConnectionChanged(info);
      if (mounted) {
        setState(() {
          _connecting = false;
          _scanning = false;
          _statusMessage = info.diagnosticNote;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _connecting = false;
          _errorMessage =
              'No se pudo conectar con ${item.advertisedName}. Intenta nuevamente.';
        });
      }
    }
  }

  Future<void> _requestMemorySync() async {
    try {
      final ok = await widget.bleService.requestStoredRecordsIfSupported();
      if (!ok && mounted) {
        setState(() {
          _errorMessage =
              'Este modelo no confirmó acceso a su memoria interna en esta conexión.';
        });
      } else if (mounted) {
        setState(() {
          _statusMessage = 'Solicitud enviada al glucómetro para leer su memoria.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _errorMessage = 'No se pudo consultar la memoria del equipo.';
        });
      }
    }
  }

  Future<void> _disconnect() async {
    await widget.bleService.disconnect(widget.connectedMeter?.device);
    widget.onConnectionChanged(null);
    if (mounted) {
      setState(() {
        _statusMessage = 'Glucómetro desconectado.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final meter = widget.connectedMeter;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Conectar glucómetro',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 8),
                if (meter != null) ...[
                  Text(
                    'Conectado a: ${meter.displayModel} (${meter.realName})',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 6),
                  Text(meter.diagnosticNote),
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      if (meter.supportsMemorySync)
                        FilledButton(
                          onPressed: _requestMemorySync,
                          child: const Text('Traer memoria del equipo'),
                        ),
                      OutlinedButton(
                        onPressed: _disconnect,
                        child: const Text('Desconectar'),
                      ),
                    ],
                  ),
                ] else ...[
                  const Text(
                    'Enciende el Bluetooth del teléfono y de tu glucómetro para buscar equipos compatibles.',
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: (_scanning || _connecting) ? null : _startScan,
                      icon: const Icon(Icons.bluetooth_searching),
                      label: Text(
                        _scanning ? 'Buscando equipos...' : 'Buscar glucómetros cercanos',
                      ),
                    ),
                  ),
                ],
                if (_statusMessage != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _statusMessage!,
                    style: TextStyle(color: Theme.of(context).colorScheme.primary),
                  ),
                ],
                if (_errorMessage != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _errorMessage!,
                    style: TextStyle(color: Colors.red.shade700),
                  ),
                ],
              ],
            ),
          ),
        ),
        if (_discovered.isNotEmpty) ...[
          const SizedBox(height: 14),
          Card(
            child: Column(
              children: _discovered
                  .map(
                    (d) => ListTile(
                      leading: const Icon(Icons.bluetooth),
                      title: Text(d.matchedSpec?.displayName ?? d.advertisedName),
                      subtitle: Text('Nombre detectado: ${d.advertisedName} · Señal ${d.rssi} dBm'),
                      trailing: FilledButton(
                        onPressed: _connecting ? null : () => _connectToDevice(d),
                        child: const Text('Conectar'),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
        ],
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Diagnóstico y validación física por modelo',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Estos 5 modelos están configurados en la app, pero requieren prueba con equipo físico para confirmar su transmisión inalámbrica real:',
                ),
                const SizedBox(height: 12),
                ...kGlucometerCatalog.map(
                  (spec) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          spec.displayName,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          spec.validationStatusLabel,
                          style: TextStyle(
                            color: Colors.amber.shade800,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(spec.technicalNotes),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
