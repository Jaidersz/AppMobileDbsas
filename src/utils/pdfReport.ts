import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DEVICE_BY_ID, MEASUREMENT_CONTEXTS } from '../data/devicesAndSeeds';
import { GlucoseReading, LocalProfile } from '../types/glucose';
import {
  computeGlucoseStats,
  evaluateReadingSeverity,
  formatGlucoseValue,
  formatShortDateTime,
} from './glucoseMath';

export function exportClinicalPdfReport(
  profile: LocalProfile,
  readings: GlucoseReading[],
  rangeLabel: string
): string {
  const sorted = [...readings].sort((a, b) => b.timestamp - a.timestamp);
  const stats = computeGlucoseStats(sorted);
  const unit = profile.unitPreference;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Header clinical bar
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('DbSas', 14, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text('Reporte Clínico de Glucometría Local-First', 14, 22);

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
  doc.text(`Paciente: ${profile.name}`, 14, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Unidad clínica: ${unit}   |   Objetivo basal: ${formatGlucoseValue(
      profile.targetMinMgDl,
      unit
    )} - ${formatGlucoseValue(profile.targetMaxMgDl, unit)} ${unit}   |   Total de tomas: ${
      stats.count
    }`,
    14,
    51
  );

  // Summary KPI grid
  const kpis = [
    {
      label: 'Promedio del periodo',
      value: `${formatGlucoseValue(stats.avgMgDl, unit)} ${unit}`,
    },
    {
      label: 'Tiempo en rango',
      value: `${stats.inRangePercent}% (${stats.normalCount}/${stats.count})`,
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
      label: 'GMI Estimado',
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

  // Distribution summary line
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Distribución semafórica:  En rango: ${stats.normalCount}   ·   Precaución: ${stats.cautionCount}   ·   Alerta: ${stats.alertCount}`,
    14,
    83
  );

  // Table rows
  const contextMap = Object.fromEntries(
    MEASUREMENT_CONTEXTS.map((c) => [c.id, c.label])
  );

  const tableRows = sorted.map((r) => {
    const { label: statusLabel } = evaluateReadingSeverity(r.valueMgDl, r.context);
    const deviceLabel = DEVICE_BY_ID[r.deviceInfo]?.displayName ?? r.deviceInfo;
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
      deviceLabel,
      tagsAndNote || '—',
    ];
  });

  autoTable(doc, {
    startY: 88,
    head: [
      ['Fecha y hora', 'Glucosa', 'Estado', 'Contexto', 'Dispositivo', 'Etiquetas / Notas'],
    ],
    body: tableRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.2,
      cellPadding: 2.8,
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
        if (text.includes('Alerta')) {
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
      `DbSas · Almacenamiento 100% local en el dispositivo · Página ${i} de ${pageCount}`,
      14,
      287
    );
  }

  const safeName = profile.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_');
  const fileName = `DbSas_Reporte_${safeName}.pdf`;
  doc.save(fileName);
  return fileName;
}
