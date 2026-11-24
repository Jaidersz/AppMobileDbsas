import 'dart:io';
import 'dart:typed_data';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';
import '../models/glucose_models.dart';
import 'glucose_math.dart';

class PdfReportService {
  static Future<Uint8List> buildReportBytes({
    required UserProfile profile,
    required List<GlucoseReading> readings,
    required String rangeLabel,
  }) async {
    final sorted = [...readings]
      ..sort((a, b) => b.timestampMs.compareTo(a.timestampMs));
    final stats = GlucoseMath.computeStats(
      sorted,
      targetMinMgDl: profile.targetMinMgDl,
      targetMaxMgDl: profile.targetMaxMgDl,
    );
    final unit = profile.preferredUnit;
    final dateFormat = DateFormat('dd/MM/yyyy HH:mm');
    final generatedAt = dateFormat.format(DateTime.now());

    final doc = pw.Document();

    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(28),
        footer: (ctx) => pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          children: [
            pw.Text(
              'Glucosoft App · Datos almacenados localmente',
              style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
            ),
            pw.Text(
              'Página ${ctx.pageNumber} de ${ctx.pagesCount}',
              style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
            ),
          ],
        ),
        build: (context) => [
          pw.Container(
            padding: const pw.EdgeInsets.all(16),
            decoration: pw.BoxDecoration(
              color: PdfColor.fromHex('#0F766E'),
              borderRadius: pw.BorderRadius.circular(8),
            ),
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(
                      'Glucosoft App',
                      style: pw.TextStyle(
                        color: PdfColors.white,
                        fontSize: 18,
                        fontWeight: pw.FontWeight.bold,
                      ),
                    ),
                    pw.SizedBox(height: 2),
                    pw.Text(
                      'Reporte de Glucosa para Consulta Médica',
                      style: const pw.TextStyle(
                        color: PdfColors.white,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.end,
                  children: [
                    pw.Text(
                      'Generado: $generatedAt',
                      style: const pw.TextStyle(
                        color: PdfColors.white,
                        fontSize: 9,
                      ),
                    ),
                    pw.Text(
                      'Periodo: $rangeLabel',
                      style: const pw.TextStyle(
                        color: PdfColors.white,
                        fontSize: 9,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          pw.SizedBox(height: 16),
          pw.Text(
            'Perfil: ${profile.name}',
            style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold),
          ),
          pw.SizedBox(height: 4),
          pw.Text(
            'Unidad: ${unit.label}  |  Meta orientativa: ${GlucoseMath.formatValue(profile.targetMinMgDl, unit)} - ${GlucoseMath.formatValue(profile.targetMaxMgDl, unit)} ${unit.label}  |  Total: ${stats.count} mediciones',
            style: const pw.TextStyle(fontSize: 9.5, color: PdfColors.grey700),
          ),
          pw.SizedBox(height: 12),
          pw.Row(
            children: [
              _kpiBox(
                'Promedio',
                stats.count > 0
                    ? '${GlucoseMath.formatValue(stats.avgMgDl.round(), unit)} ${unit.label}'
                    : '—',
              ),
              pw.SizedBox(width: 8),
              _kpiBox(
                'En meta orientativa',
                stats.count > 0
                    ? '${stats.inRangePercent}% (${stats.normalCount}/${stats.count})'
                    : '—',
              ),
              pw.SizedBox(width: 8),
              _kpiBox(
                'Mínima / Máxima',
                stats.count > 0
                    ? '${GlucoseMath.formatValue(stats.minMgDl, unit)} / ${GlucoseMath.formatValue(stats.maxMgDl, unit)} ${unit.label}'
                    : '—',
              ),
            ],
          ),
          pw.SizedBox(height: 10),
          pw.Text(
            'Aviso orientativo: Los colores y rangos son una guía visual configurable según las indicaciones del profesional de salud y no constituyen diagnóstico médico.',
            style: const pw.TextStyle(fontSize: 8.5, color: PdfColors.grey600),
          ),
          pw.SizedBox(height: 14),
          pw.TableHelper.fromTextArray(
            headerStyle: pw.TextStyle(
              fontSize: 8.5,
              fontWeight: pw.FontWeight.bold,
              color: PdfColors.blueGrey900,
            ),
            cellStyle: const pw.TextStyle(fontSize: 8.5),
            headerDecoration: const pw.BoxDecoration(color: PdfColors.grey200),
            headers: [
              'Fecha y hora',
              'Glucosa',
              'Contexto',
              'Glucómetro / Método',
              'Notas',
            ],
            data: sorted.map((r) {
              final dt = DateTime.fromMillisecondsSinceEpoch(r.timestampMs);
              final notes = [
                if (r.tags.isNotEmpty) r.tags.join(', '),
                if (r.note.isNotEmpty) r.note,
              ].join(' — ');
              return [
                dateFormat.format(dt),
                '${GlucoseMath.formatValue(r.valueMgDl, unit)} ${unit.label}',
                r.context.label,
                '${r.deviceModel} (${r.captureMethod.label})',
                notes.isEmpty ? '—' : notes,
              ];
            }).toList(),
          ),
        ],
      ),
    );

    return doc.save();
  }

  static pw.Widget _kpiBox(String label, String value) {
    return pw.Expanded(
      child: pw.Container(
        padding: const pw.EdgeInsets.all(10),
        decoration: pw.BoxDecoration(
          color: PdfColors.grey100,
          borderRadius: pw.BorderRadius.circular(6),
          border: pw.Border.all(color: PdfColors.grey300),
        ),
        child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text(
              label,
              style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700),
            ),
            pw.SizedBox(height: 4),
            pw.Text(
              value,
              style: pw.TextStyle(fontSize: 10.5, fontWeight: pw.FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }

  static Future<File> savePdfToDevice({
    required UserProfile profile,
    required List<GlucoseReading> readings,
    required String rangeLabel,
  }) async {
    final bytes = await buildReportBytes(
      profile: profile,
      readings: readings,
      rangeLabel: rangeLabel,
    );
    final dir = await getApplicationDocumentsDirectory();
    final safeName = profile.name.replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '_');
    final file = File('${dir.path}/Glucosoft_Reporte_$safeName.pdf');
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  static Future<void> previewAndShare({
    required UserProfile profile,
    required List<GlucoseReading> readings,
    required String rangeLabel,
  }) async {
    final file = await savePdfToDevice(
      profile: profile,
      readings: readings,
      rangeLabel: rangeLabel,
    );
    await Share.shareXFiles(
      [XFile(file.path)],
      subject: 'Reporte de glucosa - ${profile.name}',
      text: 'Historial de glucosa generado con Glucosoft App ($rangeLabel).',
    );
  }

  static Future<void> printOrSave({
    required UserProfile profile,
    required List<GlucoseReading> readings,
    required String rangeLabel,
  }) async {
    final bytes = await buildReportBytes(
      profile: profile,
      readings: readings,
      rangeLabel: rangeLabel,
    );
    final safeName = profile.name.replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '_');
    await Printing.sharePdf(
      bytes: bytes,
      filename: 'Glucosoft_Reporte_$safeName.pdf',
    );
  }
}
