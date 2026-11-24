import {
  GlucoseReading,
  GlucoseSeverity,
  GlucoseUnit,
  MeasurementContext,
} from '../types/glucose';

const MGDL_PER_MMOL = 18.0182;

export function mgDlToMmol(mgDl: number): number {
  return Number((mgDl / MGDL_PER_MMOL).toFixed(1));
}

export function mmolToMgDl(mmol: number): number {
  return Math.round(mmol * MGDL_PER_MMOL);
}

export function formatGlucoseValue(valueMgDl: number, unit: GlucoseUnit): string {
  if (unit === 'mmol/L') {
    return (valueMgDl / MGDL_PER_MMOL).toFixed(1);
  }
  return Math.round(valueMgDl).toString();
}

export function convertForChart(valueMgDl: number, unit: GlucoseUnit): number {
  if (unit === 'mmol/L') {
    return Number((valueMgDl / MGDL_PER_MMOL).toFixed(1));
  }
  return Math.round(valueMgDl);
}

/**
 * Evaluación orientativa según rangos configurables del perfil.
 * No constituye diagnóstico médico.
 */
export function evaluateReadingSeverity(
  valueMgDl: number,
  context: MeasurementContext,
  targetMinMgDl = 70,
  targetMaxMgDl = 140
): {
  severity: GlucoseSeverity;
  label: string;
  detail: string;
} {
  const isPostMeal = context === 'post_meal_1h' || context === 'post_meal_2h';
  const lowAlertThreshold = Math.max(40, targetMinMgDl - 15);
  const effectiveUpperBound = isPostMeal
    ? Math.max(targetMaxMgDl, 180)
    : targetMaxMgDl;
  const highAlertThreshold = Math.max(effectiveUpperBound + 60, 240);

  if (valueMgDl < lowAlertThreshold) {
    return {
      severity: 'alert',
      label: 'Valor muy bajo · Atención',
      detail:
        'Valor orientativo muy por debajo de tu meta. Si sientes malestar, busca apoyo y comunícate con tu contacto de emergencia o profesional de salud.',
    };
  }

  if (valueMgDl < targetMinMgDl) {
    return {
      severity: 'caution',
      label: 'Por debajo de tu meta · Precaución',
      detail:
        'Resultado orientativo por debajo de tu rango configurado. Sigue las indicaciones de tu profesional de salud.',
    };
  }

  if (valueMgDl > highAlertThreshold) {
    return {
      severity: 'alert',
      label: 'Valor muy alto · Atención',
      detail:
        'Valor orientativo muy elevado respecto a tu rango configurado. Consulta con tu profesional de salud según tu plan de cuidado.',
    };
  }

  if (valueMgDl <= effectiveUpperBound) {
    return {
      severity: 'normal',
      label: 'Dentro de tu meta orientativa',
      detail: isPostMeal
        ? 'Dentro de tu rango de referencia después de comer.'
        : 'Dentro del rango orientativo configurado en tu perfil.',
    };
  }

  return {
    severity: 'caution',
    label: 'Por encima de tu meta · Precaución',
    detail:
      'Resultado orientativo superior a tu rango configurado. Estos colores son solo una guía visual y no reemplazan el criterio médico.',
  };
}

export function computeGlucoseStats(
  readings: GlucoseReading[],
  targetMinMgDl = 70,
  targetMaxMgDl = 140
) {
  if (readings.length === 0) {
    return {
      count: 0,
      avgMgDl: 0,
      minMgDl: 0,
      maxMgDl: 0,
      inRangePercent: 0,
      normalCount: 0,
      cautionCount: 0,
      alertCount: 0,
      estimatedGmi: 0,
    };
  }

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let normalCount = 0;
  let cautionCount = 0;
  let alertCount = 0;

  for (const r of readings) {
    sum += r.valueMgDl;
    if (r.valueMgDl < min) min = r.valueMgDl;
    if (r.valueMgDl > max) max = r.valueMgDl;
    const { severity } = evaluateReadingSeverity(
      r.valueMgDl,
      r.context,
      targetMinMgDl,
      targetMaxMgDl
    );
    if (severity === 'normal') normalCount++;
    else if (severity === 'caution') cautionCount++;
    else alertCount++;
  }

  const avgMgDl = sum / readings.length;
  const estimatedGmi = Number((3.31 + 0.02392 * avgMgDl).toFixed(1));

  return {
    count: readings.length,
    avgMgDl,
    minMgDl: min,
    maxMgDl: max,
    inRangePercent: Math.round((normalCount / readings.length) * 100),
    normalCount,
    cautionCount,
    alertCount,
    estimatedGmi,
  };
}

export function deduplicateIncomingReadings(
  existing: GlucoseReading[],
  incoming: Omit<GlucoseReading, 'id'>[]
): {
  uniqueReadings: GlucoseReading[];
  skippedDuplicates: number;
} {
  const existingKeys = new Set(
    existing.map(
      (item) =>
        `${item.profileId}:${Math.floor(item.timestamp / 60000)}:${item.valueMgDl}`
    )
  );

  const uniqueReadings: GlucoseReading[] = [];
  let skippedDuplicates = 0;

  incoming.forEach((candidate, idx) => {
    const key = `${candidate.profileId}:${Math.floor(
      candidate.timestamp / 60000
    )}:${candidate.valueMgDl}`;

    if (existingKeys.has(key)) {
      skippedDuplicates++;
    } else {
      existingKeys.add(key);
      uniqueReadings.push({
        ...candidate,
        id: `rd_sync_${Date.now()}_${idx}`,
      });
    }
  });

  return { uniqueReadings, skippedDuplicates };
}

export function formatShortDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function formatDayHeader(timestamp: number): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(timestamp));
}
