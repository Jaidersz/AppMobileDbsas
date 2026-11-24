import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DEVICE_BY_ID, MEASUREMENT_CONTEXTS } from '../data/devicesAndSeeds';
import { GlucoseReading, LocalProfile } from '../types/glucose';
import {
  computeGlucoseStats,
  evaluateReadingSeverity,
  formatGlucoseValue,
  formatShortDateTime,
} from './glucoseMath';

export interface PdfExportResult {
  fileName: string;
  sharedViaSystem: boolean;
}

export function buildClinicalPdfDocument(
  profile: LocalProfile,
  readings: GlucoseReading[],
  rangeLabel: string
): { doc: jsPDF; fileName: string } {
  const sorted = [...readings].sort((a, b) => b.timestamp - a.timestamp);
  const stats = computeGlucoseStats(
    sorted,
    profile.targetMinMgDl,
    profile.targetMaxMgDl
  );
  const unit = profile.unitPreference;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Header clinical bar
  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, 210, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Glucosoft App', 14, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(204, 251, 241);
  doc.text('Reporte de Glucosa para Consulta Médica', 14, 22);

  const generatedAt = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());
  doc.setFontSize(9);
  doc.text(`Emitido: ${generatedAt}`, 196, 15, { align: 'right' });
  doc.text(`Periodo: ${rangeLabel}`, 196, 22, { align: 'right' });

  // Patient metadata block
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`Perfil: ${profile.name}`, 14, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Unidad: ${unit}   |   Meta orientativa: ${formatGlucoseValue(
      profile.targetMinMgDl,
      unit
    )} - ${formatGlucoseValue(profile.targetMaxMgDl, unit)} ${unit}   |   Mediciones: ${
      stats.count
    }`,
    14,
    51
  );

  // Summary KPI grid
  const kpis = [
    {
      label: 'Promedio del periodo',
      value:
        stats.count > 0
          ? `${formatGlucoseValue(stats.avgMgDl, unit)} ${unit}`
          : '—',
    },
    {
      label: 'Dentro de meta',
      value:
        stats.count > 0
          ? `${stats.inRangePercent}% (${stats.normalCount}/${stats.count})`
          : '—',
    },
    {
      label: 'Mínima / Máxima',
      value:
        stats.count > 0
          ? `${formatGlucoseValue(stats.minMgDl, unit)} / ${formatGlucoseValue(
              stats.maxMgDl,
              unit
            )} ${unit}`
          : '—',
    },
    {
      label: 'GMI orientativo',
      value: stats.count > 0 ? `${stats.estimatedGmi}%` : '—',
    },
  ];

  const cardWidth = 43.5;
  kpis.forEach((kpi, i) => {
    const x = 14 + i * (cardWidth + 2.5);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, 57, cardWidth, 18, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 3, 63);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.value, x + 3, 71);
  });

  // Distribution summary & orientative disclaimer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Resumen orientativo:  En meta: ${stats.normalCount}   ·   Precaución: ${stats.cautionCount}   ·   Atención: ${stats.alertCount}`,
    14,
    83
  );
  doc.setFontSize(7.8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Nota: Los colores y rangos son orientativos según la configuración del perfil y no constituyen diagnóstico médico.',
    14,
    88.5
  );

  // Table rows
  const contextMap = Object.fromEntries(
    MEASUREMENT_CONTEXTS.map((c) => [c.id, c.label])
  );

  const tableRows = sorted.map((r) => {
    const { label: statusLabel } = evaluateReadingSeverity(
      r.valueMgDl,
      r.context,
      profile.targetMinMgDl,
      profile.targetMaxMgDl
    );
    const deviceLabel =
      r.deviceModel ||
      (r.deviceId ? DEVICE_BY_ID[r.deviceId]?.displayName : '') ||
      'No especificado';
    const methodLabel = r.captureMethod === 'bluetooth' ? 'Bluetooth' : 'Manual';
    const tagsAndNote = [
      r.quickTags.length > 0 ? r.quickTags.join(', ') : '',
      r.note ? r.note : '',
    ]
      .filter(Boolean)
      .join(' — ');

    return [
      formatShortDateTime(r.timestamp),
      `${formatGlucoseValue(r.valueMgDl, unit)} ${unit}`,
      statusLabel,
      contextMap[r.context] ?? r.context,
      `${deviceLabel} (${methodLabel})`,
      tagsAndNote || '—',
    ];
  });

  autoTable(doc, {
    startY: 93,
    head: [
      ['Fecha y hora', 'Glucosa', 'Referencia', 'Contexto', 'Glucómetro / Método', 'Notas'],
    ],
    body: tableRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.0,
      cellPadding: 2.6,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        const text = String(data.cell.raw);
        if (text.includes('Atención')) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        } else if (text.includes('Precaución')) {
          data.cell.styles.textColor = [217, 119, 6];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [5, 150, 105];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  // Footer note on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Glucosoft App · Almacenamiento local privado · Página ${i} de ${pageCount}`,
      14,
      287
    );
  }

  const safeName = profile.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_');
  const fileName = `Glucosoft_Reporte_${safeName || 'Perfil'}.pdf`;
  return { doc, fileName };
}

export async function exportClinicalPdfReport(
  profile: LocalProfile,
  readings: GlucoseReading[],
  rangeLabel: string,
  shareIfAvailable = false
): Promise<PdfExportResult> {
  const { doc, fileName } = buildClinicalPdfDocument(profile, readings, rangeLabel);

  if (shareIfAvailable && typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      const blob = doc.output('blob');
      const file = new File([blob], fileName, { type: 'application/pdf' });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (!nav.canShare || nav.canShare({ files: [file] })) {
        await navigator.share({
          title: `Reporte de glucosa - ${profile.name}`,
          text: `Historial de glucosa generado con Glucosoft App (${rangeLabel}).`,
          files: [file],
        });
        return { fileName, sharedViaSystem: true };
      }
    } catch {
      // Fallback to direct download if user cancels share or browser blocks file share
    }
  }

  doc.save(fileName);
  return { fileName, sharedViaSystem: false };
}
