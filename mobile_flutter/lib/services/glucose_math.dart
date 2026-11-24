import '../models/glucose_models.dart';

class SeverityEvaluation {
  final GlucoseSeverity severity;
  final String label;
  final String detail;

  const SeverityEvaluation({
    required this.severity,
    required this.label,
    required this.detail,
  });
}

class GlucoseStats {
  final int count;
  final double avgMgDl;
  final int minMgDl;
  final int maxMgDl;
  final int inRangePercent;
  final int normalCount;
  final int cautionCount;
  final int alertCount;
  final double estimatedGmi;

  const GlucoseStats({
    required this.count,
    required this.avgMgDl,
    required this.minMgDl,
    required this.maxMgDl,
    required this.inRangePercent,
    required this.normalCount,
    required this.cautionCount,
    required this.alertCount,
    required this.estimatedGmi,
  });
}

class GlucoseMath {
  static const double mgDlPerMmol = 18.0182;

  static double mgDlToMmol(int mgDl) {
    return double.parse((mgDl / mgDlPerMmol).toStringAsFixed(1));
  }

  static int mmolToMgDl(double mmol) {
    return (mmol * mgDlPerMmol).round();
  }

  static String formatValue(int valueMgDl, GlucoseUnit unit) {
    if (unit == GlucoseUnit.mmolL) {
      return (valueMgDl / mgDlPerMmol).toStringAsFixed(1);
    }
    return valueMgDl.toString();
  }

  static double convertForChart(int valueMgDl, GlucoseUnit unit) {
    if (unit == GlucoseUnit.mmolL) {
      return mgDlToMmol(valueMgDl);
    }
    return valueMgDl.toDouble();
  }

  static SeverityEvaluation evaluateSeverity({
    required int valueMgDl,
    required MeasurementContext context,
    int targetMinMgDl = 70,
    int targetMaxMgDl = 140,
  }) {
    final isPostMeal =
        context == MeasurementContext.postMeal1h ||
        context == MeasurementContext.postMeal2h;
    final lowAlert = (targetMinMgDl - 15).clamp(40, targetMinMgDl);
    final effectiveMax = isPostMeal && targetMaxMgDl < 180 ? 180 : targetMaxMgDl;
    final highAlert = (effectiveMax + 60) > 240 ? (effectiveMax + 60) : 240;

    if (valueMgDl < lowAlert) {
      return const SeverityEvaluation(
        severity: GlucoseSeverity.alert,
        label: 'Valor muy bajo · Atención',
        detail:
            'Valor orientativo muy por debajo de tu meta. Si sientes malestar, busca ayuda y comunícate con tu contacto de emergencia o profesional de salud.',
      );
    }

    if (valueMgDl < targetMinMgDl) {
      return const SeverityEvaluation(
        severity: GlucoseSeverity.caution,
        label: 'Por debajo de tu meta · Precaución',
        detail:
            'Resultado orientativo por debajo de tu rango configurado. Sigue las indicaciones de tu profesional de salud.',
      );
    }

    if (valueMgDl > highAlert) {
      return const SeverityEvaluation(
        severity: GlucoseSeverity.alert,
        label: 'Valor muy alto · Atención',
        detail:
            'Valor orientativo muy elevado respecto a tu rango configurado. Consulta con tu profesional de salud según tu plan.',
      );
    }

    if (valueMgDl <= effectiveMax) {
      return SeverityEvaluation(
        severity: GlucoseSeverity.normal,
        label: 'Dentro de tu meta orientativa',
        detail: isPostMeal
            ? 'Dentro de tu rango orientativo después de comer.'
            : 'Dentro del rango orientativo configurado en tu perfil.',
      );
    }

    return const SeverityEvaluation(
      severity: GlucoseSeverity.caution,
      label: 'Por encima de tu meta · Precaución',
      detail:
          'Resultado orientativo superior a tu rango configurado. Estos colores son solo una guía visual y no constituyen diagnóstico médico.',
    );
  }

  static GlucoseStats computeStats(
    List<GlucoseReading> readings, {
    int targetMinMgDl = 70,
    int targetMaxMgDl = 140,
  }) {
    if (readings.isEmpty) {
      return const GlucoseStats(
        count: 0,
        avgMgDl: 0,
        minMgDl: 0,
        maxMgDl: 0,
        inRangePercent: 0,
        normalCount: 0,
        cautionCount: 0,
        alertCount: 0,
        estimatedGmi: 0,
      );
    }

    int sum = 0;
    int minV = readings.first.valueMgDl;
    int maxV = readings.first.valueMgDl;
    int normal = 0;
    int caution = 0;
    int alert = 0;

    for (final r in readings) {
      sum += r.valueMgDl;
      if (r.valueMgDl < minV) minV = r.valueMgDl;
      if (r.valueMgDl > maxV) maxV = r.valueMgDl;
      final ev = evaluateSeverity(
        valueMgDl: r.valueMgDl,
        context: r.context,
        targetMinMgDl: targetMinMgDl,
        targetMaxMgDl: targetMaxMgDl,
      );
      switch (ev.severity) {
        case GlucoseSeverity.normal:
          normal++;
          break;
        case GlucoseSeverity.caution:
          caution++;
          break;
        case GlucoseSeverity.alert:
          alert++;
          break;
      }
    }

    final avg = sum / readings.length;
    final gmi = double.parse((3.31 + 0.02392 * avg).toStringAsFixed(1));

    return GlucoseStats(
      count: readings.length,
      avgMgDl: avg,
      minMgDl: minV,
      maxMgDl: maxV,
      inRangePercent: ((normal / readings.length) * 100).round(),
      normalCount: normal,
      cautionCount: caution,
      alertCount: alert,
      estimatedGmi: gmi,
    );
  }
}
