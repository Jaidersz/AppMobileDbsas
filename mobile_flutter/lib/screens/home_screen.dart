import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/glucose_models.dart';
import '../services/ble_glucose_service.dart';
import '../services/glucose_math.dart';

class HomeScreen extends StatelessWidget {
  final UserProfile profile;
  final List<GlucoseReading> readings;
  final ConnectedMeterInfo? connectedMeter;
  final VoidCallback onNewMeasurement;
  final VoidCallback onOpenHistory;
  final VoidCallback onOpenGlucometer;
  final VoidCallback onOpenEmergency;
  final VoidCallback onConfirmEmergencyCall;

  const HomeScreen({
    super.key,
    required this.profile,
    required this.readings,
    required this.connectedMeter,
    required this.onNewMeasurement,
    required this.onOpenHistory,
    required this.onOpenGlucometer,
    required this.onOpenEmergency,
    required this.onConfirmEmergencyCall,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unit = profile.preferredUnit;
    final latest = readings.isNotEmpty ? readings.first : null;
    final eval = latest != null
        ? GlucoseMath.evaluateSeverity(
            valueMgDl: latest.valueMgDl,
            context: latest.context,
            targetMinMgDl: profile.targetMinMgDl,
            targetMaxMgDl: profile.targetMaxMgDl,
          )
        : null;
    final stats = GlucoseMath.computeStats(
      readings,
      targetMinMgDl: profile.targetMinMgDl,
      targetMaxMgDl: profile.targetMaxMgDl,
    );
    final emergency = profile.emergencyContact;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  latest != null
                      ? 'Última medición · ${DateFormat('dd MMM, HH:mm').format(DateTime.fromMillisecondsSinceEpoch(latest.timestampMs))}'
                      : 'Última medición de ${profile.name}',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 12),
                if (latest != null && eval != null) ...[
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        GlucoseMath.formatValue(latest.valueMgDl, unit),
                        style: theme.textTheme.displayMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        unit.label,
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  _StatusBanner(severity: eval.severity, label: eval.label),
                  const SizedBox(height: 10),
                  Text(eval.detail, style: theme.textTheme.bodyMedium),
                  const SizedBox(height: 8),
                  Text(
                    '${latest.context.label} · ${latest.captureMethod.label} · ${latest.deviceModel}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ] else ...[
                  Text(
                    'Aún no tienes mediciones guardadas',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Pulsa "Nueva medición" para anotar tu primer resultado o conectar un glucómetro.',
                  ),
                ],
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: onNewMeasurement,
                    icon: const Icon(Icons.add_circle_outline),
                    label: const Text('Nueva medición'),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: onOpenHistory,
                    icon: const Icon(Icons.history),
                    label: Text('Ver historial (${readings.length})'),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.bluetooth, color: theme.colorScheme.primary),
                    const SizedBox(width: 8),
                    Text(
                      'Glucómetro Bluetooth',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  connectedMeter != null
                      ? 'Conectado a ${connectedMeter!.displayModel}'
                      : 'Sin glucómetro conectado',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  connectedMeter != null
                      ? connectedMeter!.diagnosticNote
                      : 'Busca equipos cercanos o revisa la compatibilidad de tu modelo.',
                  style: theme.textTheme.bodySmall,
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: onOpenGlucometer,
                    child: Text(
                      connectedMeter != null
                          ? 'Gestionar glucómetro'
                          : 'Conectar glucómetro',
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.insights, color: theme.colorScheme.primary),
                    const SizedBox(width: 8),
                    Text(
                      'Estado de seguimiento',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  stats.count > 0
                      ? '${stats.inRangePercent}% dentro de tu meta orientativa · Promedio ${GlucoseMath.formatValue(stats.avgMgDl.round(), unit)} ${unit.label}'
                      : 'Registra mediciones para ver tu resumen orientativo.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Los indicadores de color son orientativos según tu meta (${GlucoseMath.formatValue(profile.targetMinMgDl, unit)}–${GlucoseMath.formatValue(profile.targetMaxMgDl, unit)} ${unit.label}) y no son diagnóstico médico.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.phone_in_talk, color: Colors.redAccent),
                    const SizedBox(width: 8),
                    Text(
                      'Contacto de emergencia',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (emergency != null) ...[
                  Text(
                    emergency.name,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text('${emergency.relation} · ${emergency.phone}'),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          style: FilledButton.styleFrom(
                            backgroundColor: Colors.red.shade700,
                            foregroundColor: Colors.white,
                          ),
                          onPressed: onConfirmEmergencyCall,
                          icon: const Icon(Icons.call),
                          label: const Text('Llamar'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      OutlinedButton(
                        onPressed: onOpenEmergency,
                        child: const Text('Editar'),
                      ),
                    ],
                  ),
                ] else ...[
                  const Text(
                    'Aún no hay un contacto guardado para este perfil.',
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: onOpenEmergency,
                      child: const Text('Agregar contacto de emergencia'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _StatusBanner extends StatelessWidget {
  final GlucoseSeverity severity;
  final String label;

  const _StatusBanner({required this.severity, required this.label});

  @override
  Widget build(BuildContext context) {
    final (bg, fg, icon) = switch (severity) {
      GlucoseSeverity.normal => (
          Colors.emeraldOrTealBg(context),
          Colors.green.shade800,
          Icons.check_circle,
        ),
      GlucoseSeverity.caution => (
          Colors.amber.withValues(alpha: 0.16),
          Colors.amber.shade900,
          Icons.warning_amber_rounded,
        ),
      GlucoseSeverity.alert => (
          Colors.red.withValues(alpha: 0.14),
          Colors.red.shade800,
          Icons.error_outline,
        ),
    };

    final effectiveFg = Theme.of(context).brightness == Brightness.dark
        ? Colors.white
        : fg;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18, color: effectiveFg),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: effectiveFg,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

extension _ColorHelpers on Colors {
  static Color emeraldOrTealBg(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark
        ? Colors.teal.withValues(alpha: 0.25)
        : Colors.green.withValues(alpha: 0.14);
  }
}
