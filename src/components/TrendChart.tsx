import React, { useMemo, useState } from 'react';
import { MEASUREMENT_CONTEXTS } from '../data/devicesAndSeeds';
import { GlucoseReading, GlucoseUnit } from '../types/glucose';
import {
  convertForChart,
  evaluateReadingSeverity,
  formatGlucoseValue,
  formatShortDateTime,
} from '../utils/glucoseMath';

interface TrendChartProps {
  readings: GlucoseReading[];
  unit: GlucoseUnit;
  targetMinMgDl: number;
  targetMaxMgDl: number;
}

export const TrendChart: React.FC<TrendChartProps> = ({
  readings,
  unit,
  targetMinMgDl,
  targetMaxMgDl,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...readings].sort((a, b) => a.timestamp - b.timestamp),
    [readings]
  );

  const width = 680;
  const height = 240;
  const padLeft = 48;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 34;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const { minVal, maxVal } = useMemo(() => {
    const minDomainMg = 40;
    const maxDomainMg = 280;
    const vals = sorted.map((r) => r.valueMgDl);
    const localMin = vals.length > 0 ? Math.min(...vals, minDomainMg) : minDomainMg;
    const localMax = vals.length > 0 ? Math.max(...vals, maxDomainMg) : maxDomainMg;
    return {
      minVal: convertForChart(Math.max(30, localMin - 10), unit),
      maxVal: convertForChart(localMax + 15, unit),
    };
  }, [sorted, unit]);

  const yTicks = useMemo(() => {
    const refMg = unit === 'mmol/L' ? [54, 90, 144, 198, 252] : [50, 100, 150, 200, 250];
    return refMg
      .map((mg) => convertForChart(mg, unit))
      .filter((v) => v >= minVal && v <= maxVal);
  }, [minVal, maxVal, unit]);

  const getY = (valConverted: number) => {
    const ratio = (valConverted - minVal) / Math.max(1, maxVal - minVal);
    return padTop + plotH - ratio * plotH;
  };

  const points = useMemo(() => {
    if (sorted.length === 0) return [];
    const minTime = sorted[0].timestamp;
    const maxTime = sorted[sorted.length - 1].timestamp;
    const span = Math.max(1, maxTime - minTime);

    return sorted.map((r, idx) => {
      const x =
        sorted.length === 1
          ? padLeft + plotW / 2
          : padLeft + ((r.timestamp - minTime) / span) * plotW;
      const converted = convertForChart(r.valueMgDl, unit);
      const y = getY(converted);
      const { severity, label } = evaluateReadingSeverity(
        r.valueMgDl,
        r.context,
        targetMinMgDl,
        targetMaxMgDl
      );
      return { reading: r, x, y, severity, statusLabel: label, idx };
    });
  }, [sorted, unit, minVal, maxVal, plotW, plotH, targetMinMgDl, targetMaxMgDl]);

  const linePath = useMemo(() => {
    if (points.length < 2) return '';
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
  }, [points]);

  const bandTopY = getY(convertForChart(targetMaxMgDl, unit));
  const bandBottomY = getY(convertForChart(targetMinMgDl, unit));

  const activePoint =
    points.find((p) => p.reading.id === hoveredId) ??
    (points.length > 0 ? points[points.length - 1] : null);

  const contextLabels = useMemo(
    () =>
      Object.fromEntries(MEASUREMENT_CONTEXTS.map((c) => [c.id, c.shortLabel])),
    []
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-60 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-center px-6">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Aún no hay mediciones en estas fechas
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Registra una nueva medición o selecciona un periodo más amplio para ver cómo ha variado tu glucosa.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activePoint && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-mono font-semibold text-sm tabular-nums text-slate-900 dark:text-white">
              {formatGlucoseValue(activePoint.reading.valueMgDl, unit)} {unit}
            </span>
            <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
              ·
            </span>
            <span
              className={`font-medium ${
                activePoint.severity === 'normal'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : activePoint.severity === 'caution'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              {activePoint.statusLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 tabular-nums">
            <span>{contextLabels[activePoint.reading.context]}</span>
            <span aria-hidden="true">·</span>
            <span>{activePoint.reading.deviceModel}</span>
            <span aria-hidden="true">·</span>
            <span>{formatShortDateTime(activePoint.reading.timestamp)}</span>
          </div>
        </div>
      )}

      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none"
          role="img"
          aria-label="Gráfico de evolución de glucosa"
        >
          <rect
            x={padLeft}
            y={Math.min(bandTopY, bandBottomY)}
            width={plotW}
            height={Math.max(4, Math.abs(bandBottomY - bandTopY))}
            className="fill-emerald-500/10 dark:fill-emerald-400/10"
            rx={4}
          />
          <text
            x={padLeft + 8}
            y={Math.min(bandTopY, bandBottomY) + 12}
            className="fill-emerald-700/75 dark:fill-emerald-400/75 text-[10px] font-medium"
          >
            Meta orientativa ({formatGlucoseValue(targetMinMgDl, unit)}–
            {formatGlucoseValue(targetMaxMgDl, unit)} {unit})
          </text>

          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  className="stroke-slate-200 dark:stroke-slate-800"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono tabular-nums"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {linePath && (
            <path
              d={linePath}
              fill="none"
              className="stroke-slate-400/75 dark:stroke-slate-500/80"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {points.map((pt) => {
            const isActive = activePoint?.reading.id === pt.reading.id;
            const fillClass =
              pt.severity === 'normal'
                ? 'fill-emerald-500'
                : pt.severity === 'caution'
                ? 'fill-amber-500'
                : 'fill-rose-500';
            const strokeClass =
              pt.severity === 'normal'
                ? 'stroke-emerald-200 dark:stroke-emerald-950'
                : pt.severity === 'caution'
                ? 'stroke-amber-200 dark:stroke-amber-950'
                : 'stroke-rose-200 dark:stroke-rose-950';

            return (
              <g
                key={pt.reading.id}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredId(pt.reading.id)}
                onClick={() => setHoveredId(pt.reading.id)}
              >
                {isActive && (
                  <line
                    x1={pt.x}
                    y1={padTop}
                    x2={pt.x}
                    y2={height - padBottom}
                    className="stroke-teal-500/35 dark:stroke-teal-400/35"
                    strokeWidth={1}
                  />
                )}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isActive ? 7 : 5}
                  className={`${fillClass} ${strokeClass} transition-transform duration-150`}
                  strokeWidth={isActive ? 3 : 2}
                />
                <circle cx={pt.x} cy={pt.y} r={16} fill="transparent" />
              </g>
            );
          })}

          {points.length > 0 && (
            <>
              <text
                x={padLeft}
                y={height - 10}
                textAnchor="start"
                className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono tabular-nums"
              >
                {formatShortDateTime(points[0].reading.timestamp)}
              </text>
              {points.length > 1 && (
                <text
                  x={width - padRight}
                  y={height - 10}
                  textAnchor="end"
                  className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono tabular-nums"
                >
                  {formatShortDateTime(points[points.length - 1].reading.timestamp)}
                </text>
              )}
            </>
          )}
        </svg>
      </div>
    </div>
  );
};
