import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/glucose_models.dart';
import '../services/glucose_math.dart';
import '../services/pdf_report_service.dart';

class HistoryScreen extends StatefulWidget {
  final UserProfile profile;
  final List<GlucoseReading> readings;
  final Future<void> Function(String readingId) onDeleteReading;

  const HistoryScreen({
    super.key,
    required this.profile,
    required this.readings,
    required this.onDeleteReading,
  });

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  int _daysFilter = 14; // 0 = all
  MeasurementContext? _contextFilter;
  bool _busyPdf = false;

  List<GlucoseReading> get _filtered {
    final now = DateTime.now().millisecondsSinceEpoch;
    final cutoff = _daysFilter > 0 ? now - (_daysFilter * 86400000) : 0;

    return widget.readings.where((r) {
      if (cutoff > 0 && r.timestampMs < cutoff) return false;
      if (_contextFilter != null && r.context != _contextFilter) return false;
      return true;
    }).toList();
  }

  String get _rangeLabel => switch (_daysFilter) {
        7 => 'Últimos 7 días',
        14 => 'Últimos 14 días',
        30 => 'Últimos 30 días',
        _ => 'Historial completo',
      };

  Future<void> _exportPdf({required bool share}) async {
    setState(() => _busyPdf = true);
    try {
      if (share) {
        await PdfReportService.previewAndShare(
          profile: widget.profile,
          readings: _filtered,
          rangeLabel: _rangeLabel,
        );
      } else {
        await PdfReportService.printOrSave(
          profile: widget.profile,
          readings: _filtered,
          rangeLabel: _rangeLabel,
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('No se pudo generar el PDF: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busyPdf = false);
    }
  }

  Future<void> _confirmDelete(GlucoseReading r) async {
    final unit = widget.profile.preferredUnit;
    final val = GlucoseMath.formatValue(r.valueMgDl, unit);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Eliminar esta medición?'),
        content: Text(
          'Se borrará permanentemente el registro de $val ${unit.label}. Esta acción no se puede deshacer.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await widget.onDeleteReading(r.id);
    }
  }

  void _showReadingDetails(GlucoseReading r) {
    final unit = widget.profile.preferredUnit;
    final dt = DateTime.fromMillisecondsSinceEpoch(r.timestampMs);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          '${GlucoseMath.formatValue(r.valueMgDl, unit)} ${unit.label}',
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Fecha: ${DateFormat('dd/MM/yyyy HH:mm').format(dt)}'),
            const SizedBox(height: 6),
            Text('Contexto: ${r.context.label}'),
            const SizedBox(height: 6),
            Text('Método: ${r.captureMethod.label}'),
            const SizedBox(height: 6),
            Text('Glucómetro: ${r.deviceModel}'),
            if (r.tags.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text('Etiquetas: ${r.tags.join(', ')}'),
            ],
            if (r.note.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text('Notas: ${r.note}'),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cerrar'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final items = _filtered;
    final unit = widget.profile.preferredUnit;
    final sortedAsc = [...items]
      ..sort((a, b) => a.timestampMs.compareTo(b.timestampMs));

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Historial de ${widget.profile.name}',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final d in [7, 14, 30, 0])
                      ChoiceChip(
                        label: Text(d == 0 ? 'Todo' : '$d días'),
                        selected: _daysFilter == d,
                        onSelected: (_) => setState(() => _daysFilter = d),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<MeasurementContext?>(
                  value: _contextFilter,
                  decoration: const InputDecoration(
                    labelText: 'Filtrar por momento',
                    border: OutlineInputBorder(),
                  ),
                  items: [
                    const DropdownMenuItem(
                      value: null,
                      child: Text('Todos los momentos'),
                    ),
                    ...MeasurementContext.values.map(
                      (c) => DropdownMenuItem(value: c, child: Text(c.label)),
                    ),
                  ],
                  onChanged: (val) => setState(() => _contextFilter = val),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed:
                            items.isEmpty || _busyPdf ? null : () => _exportPdf(share: false),
                        icon: const Icon(Icons.picture_as_pdf),
                        label: const Text('Guardar PDF'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed:
                            items.isEmpty || _busyPdf ? null : () => _exportPdf(share: true),
                        icon: const Icon(Icons.share),
                        label: const Text('Compartir'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        if (sortedAsc.length >= 2)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Tendencia de glucosa (${unit.label})',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 180,
                    child: LineChart(
                      LineChartData(
                        gridData: const FlGridData(show: true),
                        titlesData: const FlTitlesData(
                          rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                          topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                          bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        ),
                        lineBarsData: [
                          LineChartBarData(
                            isCurved: true,
                            color: Theme.of(context).colorScheme.primary,
                            barWidth: 3,
                            spots: [
                              for (int i = 0; i < sortedAsc.length; i++)
                                FlSpot(
                                  i.toDouble(),
                                  GlucoseMath.convertForChart(
                                    sortedAsc[i].valueMgDl,
                                    unit,
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 14),
        if (items.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'No hay mediciones registradas en este periodo.',
                textAlign: TextAlign.center,
              ),
            ),
          )
        else
          ...items.map((r) {
            final dt = DateTime.fromMillisecondsSinceEpoch(r.timestampMs);
            final ev = GlucoseMath.evaluateSeverity(
              valueMgDl: r.valueMgDl,
              context: r.context,
              targetMinMgDl: widget.profile.targetMinMgDl,
              targetMaxMgDl: widget.profile.targetMaxMgDl,
            );
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Card(
                child: ListTile(
                  onTap: () => _showReadingDetails(r),
                  title: Text(
                    '${GlucoseMath.formatValue(r.valueMgDl, unit)} ${unit.label} · ${ev.label}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: Text(
                    '${DateFormat('dd/MM/yyyy HH:mm').format(dt)}\n${r.context.label} · ${r.deviceModel} (${r.captureMethod.label})',
                  ),
                  isThreeLine: true,
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline),
                    tooltip: 'Eliminar medición',
                    onPressed: () => _confirmDelete(r),
                  ),
                ),
              ),
            );
          }),
      ],
    );
  }
}
