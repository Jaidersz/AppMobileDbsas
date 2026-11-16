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

export function evaluateReadingSeverity(
  valueMgDl: number,
  context: MeasurementContext
): {
  severity: GlucoseSeverity;
  label: string;
  detail: string;
} {
  const isPostMeal = context === 'post_meal_1h' || context === 'post_meal_2h';

  if (valueMgDl < 55) {
    return {
      severity: 'alert',
      label: 'Alerta · Hipoglucemia',
      detail: 'Por debajo de 55 mg/dL. Requiere atención inmediata.',
    };
  }

  if (valueMgDl < 70) {
    return {
      severity: 'caution',
      label: 'Precaución · Baja',
      detail: 'Rango bajo (55–69 mg/dL). Vigilar síntomas.',
    };
  }

  if (valueMgDl > 240) {
    return {
      severity: 'alert',
      label: 'Alerta · Muy alta',
      detail: 'Supera 240 mg/dL. Consultar pauta médica.',
    };
  }

  if (isPostMeal) {
    if (valueMgDl <= 180) {
      return {
        severity: 'normal',
        label: 'En rango',
        detail: 'Valor postprandial óptimo (70–180 mg/dL).',
      };
    }
    return {
      severity: 'caution',
      label: 'Precaución · Elevada',
      detail: 'Pico postprandial elevado (181–240 mg/dL).',
    };
  }

  if (valueMgDl <= 130) {
    return {
      severity: 'normal',
      label: 'En rango',
      detail: 'Valor basal dentro de objetivo clínico (70–130 mg/dL).',
    };
  }

  return {
    severity: 'caution',
    label: 'Precaución · Elevada',
    detail: 'Por encima del objetivo basal (131–240 mg/dL).',
  };
}

export function computeGlucoseStats(readings: GlucoseReading[]) {
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
    const { severity } = evaluateReadingSeverity(r.valueMgDl, r.context);
    if (severity === 'normal') normalCount++;
    else if (severity === 'caution') cautionCount++;
    else alertCount++;
  }

  const avgMgDl = sum / readings.length;
  // Clinical Glucose Management Indicator (GMI %) formula from mean glucose mg/dL
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

/**
 * Deduplica lecturas entrantes desde la memoria interna del glucómetro
 * cruzando el timestamp normalizado al minuto + dispositivo + perfil.
 */
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
