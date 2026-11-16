import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  CheckCircle2,
  Cpu,
  Download,
  FilePlus2,
  History,
  Moon,
  Plus,
  RotateCcw,
  Sun,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  BIOMEDICAL_DEVICES,
  DEVICE_BY_ID,
  MAX_LOCAL_PROFILES,
  MEASUREMENT_CONTEXTS,
  PROFILE_COLORS,
  QUICK_TAGS,
} from '../data/devicesAndSeeds';
import {
  BiomedicalDeviceId,
  GlucoseReading,
  GlucoseUnit,
  LocalProfile,
  MeasurementContext,
} from '../types/glucose';
import {
  computeGlucoseStats,
  evaluateReadingSeverity,
  formatDayHeader,
  formatGlucoseValue,
  formatShortDateTime,
  mmolToMgDl,
} from '../utils/glucoseMath';
import { exportClinicalPdfReport } from '../utils/pdfReport';
import { BleCaptureSheet } from './BleCaptureSheet';
import { TrendChart } from './TrendChart';

interface PrototypeWorkspaceProps {
  profiles: LocalProfile[];
  activeProfile: LocalProfile | null;
  readings: GlucoseReading[];
  isDark: boolean;
  onToggleTheme: () => void;
  onSelectProfile: (id: string) => void;
  onCreateProfile: (name: string, unit: GlucoseUnit) => void;
  onDeleteProfile: (id: string) => void;
  onChangeProfileUnit: (id: string, unit: GlucoseUnit) => void;
  onAddReading: (reading: Omit<GlucoseReading, 'id'>) => void;
  onAddBatchReadings: (readings: GlucoseReading[]) => void;
  onDeleteReading: (id: string) => void;
  onResetDemo: () => void;
  pdfToast: string | null;
  onExportPdf: (readingsToExport: GlucoseReading[], rangeLabel: string) => void;
}

type MobileTab = 'summary' | 'history' | 'devices' | 'profiles';
type DateRangeFilter = '7d' | '14d' | '30d' | 'all';

export const PrototypeWorkspace: React.FC<PrototypeWorkspaceProps> = ({
  profiles,
  activeProfile,
  readings,
  isDark,
  onToggleTheme,
  onSelectProfile,
  onCreateProfile,
  onDeleteProfile,
  onChangeProfileUnit,
  onAddReading,
  onAddBatchReadings,
  onDeleteReading,
  onResetDemo,
  pdfToast,
  onExportPdf,
}) => {
  const [mobileTab, setMobileTab] = useState<MobileTab>('summary');
  const [rangeFilter, setRangeFilter] = useState<DateRangeFilter>('14d');
  const [contextFilter, setContextFilter] = useState<MeasurementContext | 'all'>('all');
  const [isBleOpen, setIsBleOpen] = useState(false);

  const [connectedDeviceId, setConnectedDeviceId] = useState<BiomedicalDeviceId | null>(() => {
    try {
      const saved = localStorage.getItem('dbsas_connected_device_v1') as BiomedicalDeviceId | null;
      return saved && DEVICE_BY_ID[saved] ? saved : null;
    } catch {
      return null;
    }
  });

  const handleConnectedDeviceChange = (deviceId: BiomedicalDeviceId | null) => {
    setConnectedDeviceId(deviceId);
    try {
      if (deviceId) localStorage.setItem('dbsas_connected_device_v1', deviceId);
      else localStorage.removeItem('dbsas_connected_device_v1');
    } catch {
      // Ignore storage errors
    }
  };

  // New profile inline form state
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileUnit, setNewProfileUnit] = useState<GlucoseUnit>('mg/dL');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profilePendingDelete, setProfilePendingDelete] = useState<LocalProfile | null>(null);

  // Manual entry modal state
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [manualValueInput, setManualValueInput] = useState(
    activeProfile?.unitPreference === 'mmol/L' ? '6.1' : '110'
  );
  const [manualDevice, setManualDevice] = useState<BiomedicalDeviceId>('OKMeter_Match_II');
  const [manualContext, setManualContext] = useState<MeasurementContext>('fasting');
  const [manualTags, setManualTags] = useState<string[]>([]);
  const [manualNote, setManualNote] = useState('');

  const profileReadings = useMemo(
    () =>
      activeProfile
        ? readings
            .filter((r) => r.profileId === activeProfile.id)
            .sort((a, b) => b.timestamp - a.timestamp)
        : [],
    [readings, activeProfile]
  );

  const filteredReadings = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;
    const cutoff =
      rangeFilter === '7d'
        ? now - 7 * dayMs
        : rangeFilter === '14d'
        ? now - 14 * dayMs
        : rangeFilter === '30d'
        ? now - 30 * dayMs
        : 0;

    return profileReadings.filter((r) => {
      if (cutoff > 0 && r.timestamp < cutoff) return false;
      if (contextFilter !== 'all' && r.context !== contextFilter) return false;
      return true;
    });
  }, [profileReadings, rangeFilter, contextFilter]);

  const stats = useMemo(() => computeGlucoseStats(filteredReadings), [filteredReadings]);
  const latestReading = profileReadings[0] ?? null;
  const latestEvaluation = latestReading
    ? evaluateReadingSeverity(latestReading.valueMgDl, latestReading.context)
    : null;

  const groupedByDay = useMemo(() => {
    const groups: { dayLabel: string; items: GlucoseReading[] }[] = [];
    for (const r of filteredReadings) {
      const label = formatDayHeader(r.timestamp);
      const existing = groups.find((g) => g.dayLabel === label);
      if (existing) existing.items.push(r);
      else groups.push({ dayLabel: label, items: [r] });
    }
    return groups;
  }, [filteredReadings]);

  const contextLabelMap = useMemo(
    () => Object.fromEntries(MEASUREMENT_CONTEXTS.map((c) => [c.id, c.label])),
    []
  );

  const rangeLabelText =
    rangeFilter === '7d'
      ? 'Últimos 7 días'
      : rangeFilter === '14d'
      ? 'Últimos 14 días'
      : rangeFilter === '30d'
      ? 'Últimos 30 días'
      : 'Historial completo';

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newProfileName.trim();
    if (!trimmed) {
      setProfileError('Ingresa un nombre para el perfil local.');
      return;
    }
    if (profiles.length >= MAX_LOCAL_PROFILES) {
      setProfileError('Límite máximo de 3 perfiles locales alcanzado.');
      return;
    }
    setProfileError(null);
    onCreateProfile(trimmed, newProfileUnit);
    setNewProfileName('');
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) return;
    const numeric = parseFloat(manualValueInput);
    if (Number.isNaN(numeric) || numeric <= 0) return;
    const valueMgDl =
      activeProfile.unitPreference === 'mmol/L'
        ? mmolToMgDl(numeric)
        : Math.round(numeric);

    onAddReading({
      profileId: activeProfile.id,
      valueMgDl: Math.max(25, Math.min(600, valueMgDl)),
      timestamp: Date.now(),
      context: manualContext,
      quickTags: manualTags,
      note: manualNote.trim(),
      deviceInfo: manualDevice,
      source: 'manual',
    });
    setIsManualOpen(false);
    setManualNote('');
    setManualTags([]);
  };

  const openManualModal = () => {
    if (!activeProfile) return;
    setManualValueInput(activeProfile.unitPreference === 'mmol/L' ? '5.9' : '108');
    setManualDevice(connectedDeviceId ?? 'OKMeter_Match_II');
    setIsManualOpen(true);
  };

  const connectedDevice = connectedDeviceId ? DEVICE_BY_ID[connectedDeviceId] : null;

  if (!activeProfile) {
    return (
      <div className="space-y-6">
        <div className="max-w-lg mx-auto p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Crea tu perfil local
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              No hay perfiles activos en este dispositivo. Ingresa tu nombre para comenzar a registrar tus lecturas de glucosa de forma privada (máximo 3 perfiles).
            </p>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-3">
            <input
              type="text"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="Nombre del paciente"
              maxLength={32}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center gap-3">
              <select
                value={newProfileUnit}
                onChange={(e) => setNewProfileUnit(e.target.value as GlucoseUnit)}
                aria-label="Unidad inicial del perfil"
                className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200"
              >
                <option value="mg/dL">mg/dL</option>
                <option value="mmol/L">mmol/L</option>
              </select>
              <button
                type="submit"
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
              >
                Crear primer perfil
              </button>
            </div>
            {profileError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {profileError}
              </p>
            )}
          </form>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={onToggleTheme}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{isDark ? 'Modo Claro' : 'Modo Oscuro'}</span>
            </button>
            <button
              type="button"
              onClick={onResetDemo}
              className="font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar perfiles de ejemplo</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Workspace Toolbar: Profile Switcher, Unit Toggle, Light/Dark Switch */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Perfiles locales ({profiles.length}/{MAX_LOCAL_PROFILES})
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {profiles.map((prof) => {
              const active = prof.id === activeProfile.id;
              return (
                <div
                  key={prof.id}
                  className={`min-h-[40px] rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center border overflow-hidden ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                      : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectProfile(prof.id)}
                    className="px-3.5 py-1.5 flex items-center gap-2 min-h-[40px]"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: prof.accentHex }}
                      aria-hidden="true"
                    />
                    <span>{prof.name}</span>
                    <span className="opacity-70 font-mono">{prof.unitPreference}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfilePendingDelete(prof)}
                    className={`pr-2.5 pl-1.5 min-h-[40px] flex items-center justify-center transition-colors ${
                      active
                        ? 'text-slate-300 hover:text-rose-300 dark:text-slate-500 dark:hover:text-rose-600'
                        : 'text-slate-400 hover:text-rose-600 dark:hover:text-rose-400'
                    }`}
                    title={`Eliminar perfil de ${prof.name}`}
                    aria-label={`Eliminar perfil de ${prof.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
            {profiles.length < MAX_LOCAL_PROFILES && (
              <button
                type="button"
                onClick={() => setMobileTab('profiles')}
                className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium text-blue-600 dark:text-blue-400 border border-dashed border-blue-300 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Nuevo perfil</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Unit selector for active profile */}
          <div
            className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800"
            role="group"
            aria-label="Selector de unidad glucémica"
          >
            {(['mg/dL', 'mmol/L'] as GlucoseUnit[]).map((u) => {
              const active = activeProfile.unitPreference === u;
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => onChangeProfileUnit(activeProfile.id, u)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {u}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
            aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{isDark ? 'Modo Claro' : 'Modo Oscuro'}</span>
          </button>

          <button
            type="button"
            onClick={onResetDemo}
            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Restaurar datos locales iniciales"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reiniciar</span>
          </button>
        </div>
      </div>

      {pdfToast && (
        <div
          role="status"
          className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center justify-between"
        >
          <span>{pdfToast}</span>
        </div>
      )}

      {/* Main 2-Column Responsive Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: Interactive Mobile Simulator (Apple Health Ergonomics) */}
        <section
          className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col min-h-[640px]"
          aria-label="Simulador de aplicación móvil DbSas"
        >
          {/* Mobile Top App Bar */}
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                Almacenamiento local · Sin nube
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                Hola, {activeProfile.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={openManualModal}
              className="min-h-[44px] px-3 rounded-xl text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Manual</span>
            </button>
          </div>

          {/* Active Bluetooth Meter Banner */}
          <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 flex items-center justify-between gap-2 text-xs">
            {connectedDevice ? (
              <>
                <div className="flex items-center gap-2 min-w-0 text-emerald-700 dark:text-emerald-400 font-medium">
                  <Bluetooth className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    Conectado a: <strong>{connectedDevice.displayName}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsBleOpen(true)}
                    className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Medir
                  </button>
                  <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => handleConnectedDeviceChange(null)}
                    className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                  >
                    Desconectar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 min-w-0 text-slate-500 dark:text-slate-400">
                  <Bluetooth className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Sin glucómetro conectado por BLE</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBleOpen(true)}
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                >
                  Conectar
                </button>
              </>
            )}
          </div>

          {/* Mobile Scrollable Body */}
          <div className="p-5 flex-1 overflow-y-auto space-y-5">
            {mobileTab === 'summary' && (
              <>
                {/* Hero Glucose Reading Card */}
                {latestReading && latestEvaluation ? (
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 space-y-4">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>Última lectura</span>
                      <span className="font-mono tabular-nums">
                        {formatShortDateTime(latestReading.timestamp)}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between gap-4">
                      <div>
                        <span className="text-5xl font-extrabold font-mono tabular-nums tracking-tight text-slate-900 dark:text-white">
                          {formatGlucoseValue(
                            latestReading.valueMgDl,
                            activeProfile.unitPreference
                          )}
                        </span>
                        <span className="ml-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                          {activeProfile.unitPreference}
                        </span>
                      </div>

                      <div
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                          latestEvaluation.severity === 'normal'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : latestEvaluation.severity === 'caution'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {latestEvaluation.severity === 'normal' ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                        )}
                        <span>{latestEvaluation.label}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {latestEvaluation.detail}
                    </p>

                    <div className="pt-3 border-t border-slate-200/80 dark:border-slate-700/70 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{contextLabelMap[latestReading.context]}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {DEVICE_BY_ID[latestReading.deviceInfo]?.displayName}
                      </span>
                      {latestReading.quickTags.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{latestReading.quickTags.join(' / ')}</span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Sin mediciones registradas aún
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Empareja un glucómetro de Diagnósticos Biomédicos debajo para capturar tu primera lectura.
                    </p>
                  </div>
                )}

                {/* Compact 2-Column Mobile Stat Tiles */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Tiempo en rango
                    </div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                      {stats.inRangePercent}%
                    </div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {stats.normalCount} de {stats.count} tomas
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Promedio ({rangeFilter === 'all' ? 'Todo' : rangeFilter})
                    </div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                      {stats.count > 0
                        ? formatGlucoseValue(stats.avgMgDl, activeProfile.unitPreference)
                        : '—'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {activeProfile.unitPreference}
                    </div>
                  </div>
                </div>

                {/* Recent 3 Items */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Registros recientes
                    </h3>
                    <button
                      type="button"
                      onClick={() => setMobileTab('history')}
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Ver historial completo
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                    {profileReadings.slice(0, 3).map((item) => {
                      const ev = evaluateReadingSeverity(item.valueMgDl, item.context);
                      return (
                        <div
                          key={item.id}
                          className="px-4 py-3 flex items-center justify-between gap-3 bg-white dark:bg-slate-900"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {contextLabelMap[item.context]}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {DEVICE_BY_ID[item.deviceInfo]?.displayName} ·{' '}
                              {formatShortDateTime(item.timestamp)}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                              {formatGlucoseValue(
                                item.valueMgDl,
                                activeProfile.unitPreference
                              )}{' '}
                              <span className="text-[11px] font-normal text-slate-400">
                                {activeProfile.unitPreference}
                              </span>
                            </div>
                            <div
                              className={`text-[11px] font-medium ${
                                ev.severity === 'normal'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : ev.severity === 'caution'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-rose-700 dark:text-rose-400'
                              }`}
                            >
                              {ev.severity === 'normal'
                                ? 'En rango'
                                : ev.severity === 'caution'
                                ? 'Precaución'
                                : 'Alerta'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {mobileTab === 'history' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Bitácora de {activeProfile.name}
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {filteredReadings.length} tomas
                  </span>
                </div>

                {groupedByDay.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                    No hay registros que coincidan con el filtro actual.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {groupedByDay.map((group) => (
                      <div key={group.dayLabel} className="space-y-2">
                        <div className="text-xs font-semibold capitalize text-slate-500 dark:text-slate-400">
                          {group.dayLabel}
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                          {group.items.map((item) => {
                            const ev = evaluateReadingSeverity(item.valueMgDl, item.context);
                            return (
                              <div
                                key={item.id}
                                className="p-3.5 bg-white dark:bg-slate-900 flex items-start justify-between gap-3"
                              >
                                <div className="min-w-0 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                                      {formatGlucoseValue(
                                        item.valueMgDl,
                                        activeProfile.unitPreference
                                      )}{' '}
                                      {activeProfile.unitPreference}
                                    </span>
                                    <span
                                      className={`text-[11px] font-semibold ${
                                        ev.severity === 'normal'
                                          ? 'text-emerald-700 dark:text-emerald-400'
                                          : ev.severity === 'caution'
                                          ? 'text-amber-700 dark:text-amber-400'
                                          : 'text-rose-700 dark:text-rose-400'
                                      }`}
                                    >
                                      {ev.label}
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-600 dark:text-slate-400">
                                    {contextLabelMap[item.context]} ·{' '}
                                    {DEVICE_BY_ID[item.deviceInfo]?.displayName}
                                  </div>
                                  {(item.quickTags.length > 0 || item.note) && (
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                      {[
                                        item.quickTags.join(', '),
                                        item.note,
                                      ]
                                        .filter(Boolean)
                                        .join(' — ')}
                                    </div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onDeleteReading(item.id)}
                                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors shrink-0"
                                  aria-label="Eliminar registro"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {mobileTab === 'devices' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Catálogo Diagnósticos Biomédicos
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Equipos certificados con filtro de escaneo BLE exclusivo y metadato obligatorio <code className="font-mono">deviceInfo</code>.
                  </p>
                </div>
                <div className="space-y-2.5">
                  {BIOMEDICAL_DEVICES.map((dev) => {
                    const isPaired = connectedDeviceId === dev.id;
                    return (
                      <div
                        key={dev.id}
                        className={`p-3.5 rounded-2xl border space-y-2 transition-colors ${
                          isPaired
                            ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900 dark:text-white">
                            {dev.displayName}
                          </span>
                          <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400 tabular-nums">
                            {dev.supportsMultiSample ? 'Multimuestra' : `${dev.readTimeSeconds}s`} ·{' '}
                            {dev.memoryCapacity} mem
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {dev.summary}
                        </p>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            {isPaired ? 'Conectado actualmente' : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              handleConnectedDeviceChange(dev.id);
                              setIsBleOpen(true);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                              isPaired
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-blue-500'
                            }`}
                          >
                            {isPaired ? 'Medir o sincronizar' : 'Conectar equipo'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleConnectedDeviceChange(null);
                    setIsBleOpen(true);
                  }}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                >
                  Escanear dispositivos cercanos (BLE)
                </button>
              </div>
            )}

            {mobileTab === 'profiles' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Gestión de Perfiles Locales (Máx. 3)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Sin registro ni cuentas. Cada perfil mantiene su propio historial aislado en este dispositivo.
                  </p>
                </div>

                <div className="space-y-2.5">
                  {profiles.map((p) => {
                    const isCurrent = p.id === activeProfile.id;
                    const count = readings.filter((r) => r.profileId === p.id).length;
                    return (
                      <div
                        key={p.id}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                          isCurrent
                            ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectProfile(p.id);
                            setMobileTab('summary');
                          }}
                          className="text-left min-w-0 flex-1"
                        >
                          <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {p.name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            {count} mediciones · {p.unitPreference}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setProfilePendingDelete(p)}
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                          aria-label={`Eliminar perfil ${p.name}`}
                          title={`Eliminar perfil ${p.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {profiles.length < MAX_LOCAL_PROFILES ? (
                  <form
                    onSubmit={handleProfileSubmit}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3"
                  >
                    <label
                      htmlFor="new-profile-name"
                      className="block text-xs font-semibold text-slate-900 dark:text-white"
                    >
                      Crear perfil local ({profiles.length}/{MAX_LOCAL_PROFILES})
                    </label>
                    <input
                      id="new-profile-name"
                      type="text"
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      placeholder="Nombre del paciente (ej. Sofía)"
                      maxLength={32}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <select
                        value={newProfileUnit}
                        onChange={(e) => setNewProfileUnit(e.target.value as GlucoseUnit)}
                        aria-label="Unidad inicial del perfil"
                        className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-800 dark:text-slate-200"
                      >
                        <option value="mg/dL">mg/dL</option>
                        <option value="mmol/L">mmol/L</option>
                      </select>
                      <button
                        type="submit"
                        className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity"
                      >
                        Crear perfil
                      </button>
                    </div>
                    {profileError && (
                      <p className="text-xs text-rose-600 dark:text-rose-400">
                        {profileError}
                      </p>
                    )}
                  </form>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    Límite máximo de 3 perfiles locales alcanzado. Elimina un perfil existente si necesitas crear otro.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Mobile Ergonomic Thumb-Zone Primary CTA + Bottom Tab Bar */}
          <div className="p-4 pt-2 border-t border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 space-y-3">
            <button
              type="button"
              onClick={() => setIsBleOpen(true)}
              className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all"
            >
              <Bluetooth className="w-4 h-4" />
              <span>
                {connectedDevice
                  ? `Recibir lectura · ${connectedDevice.displayName}`
                  : 'Conectar Glucómetro BLE'}
              </span>
            </button>

            <nav
              className="grid grid-cols-4 gap-1"
              aria-label="Navegación inferior móvil"
            >
              {(
                [
                  { id: 'summary', label: 'Resumen', icon: Activity },
                  { id: 'history', label: 'Historial', icon: History },
                  { id: 'devices', label: 'Equipos', icon: Cpu },
                  { id: 'profiles', label: 'Perfiles', icon: Users },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = mobileTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMobileTab(tab.id)}
                    className={`min-h-[44px] py-1.5 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors ${
                      active
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/40'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[11px] font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </section>

        {/* RIGHT COLUMN: Clinical Analytics, Trend Chart & Medical PDF Export */}
        <section
          className="lg:col-span-7 space-y-6"
          aria-label="Analítica clínica y exportación PDF"
        >
          {/* Trend & Filter Card */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Tendencia Glucémica · {activeProfile.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Semáforo clínico calibrado por contexto · Conversión exacta en {activeProfile.unitPreference}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                  {(
                    [
                      { id: '7d', label: '7d' },
                      { id: '14d', label: '14d' },
                      { id: '30d', label: '30d' },
                      { id: 'all', label: 'Todo' },
                    ] as const
                  ).map((rng) => {
                    const active = rangeFilter === rng.id;
                    return (
                      <button
                        key={rng.id}
                        type="button"
                        onClick={() => setRangeFilter(rng.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          active
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {rng.label}
                      </button>
                    );
                  })}
                </div>

                <select
                  value={contextFilter}
                  onChange={(e) =>
                    setContextFilter(e.target.value as MeasurementContext | 'all')
                  }
                  aria-label="Filtrar por contexto clínico"
                  className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  <option value="all">Todos los contextos</option>
                  {MEASUREMENT_CONTEXTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 4-Column KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Promedio
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                  {stats.count > 0
                    ? formatGlucoseValue(stats.avgMgDl, activeProfile.unitPreference)
                    : '—'}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    {activeProfile.unitPreference}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  En rango
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
                  {stats.inRangePercent}%
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Mín / Máx
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                  {stats.count > 0
                    ? `${formatGlucoseValue(
                        stats.minMgDl,
                        activeProfile.unitPreference
                      )} / ${formatGlucoseValue(
                        stats.maxMgDl,
                        activeProfile.unitPreference
                      )}`
                    : '—'}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  GMI estimado
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                  {stats.count > 0 ? `${stats.estimatedGmi}%` : '—'}
                </div>
              </div>
            </div>

            <TrendChart
              readings={filteredReadings}
              unit={activeProfile.unitPreference}
              targetMinMgDl={activeProfile.targetMinMgDl}
              targetMaxMgDl={activeProfile.targetMaxMgDl}
            />
          </div>

          {/* Medical PDF Export & Audit Table */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Registro Detallado por Dispositivo y Reporte Médico
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Incluye el equipo exacto de Diagnósticos Biomédicos (<code className="font-mono">deviceInfo</code>) en la tabla y en el PDF clínico.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onExportPdf(filteredReadings, rangeLabelText)}
                disabled={filteredReadings.length === 0}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Descargar PDF Médico</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-4 font-medium">Fecha y hora</th>
                    <th className="py-2.5 pr-4 font-medium">Glucosa</th>
                    <th className="py-2.5 pr-4 font-medium">Estado</th>
                    <th className="py-2.5 pr-4 font-medium">Contexto</th>
                    <th className="py-2.5 pr-4 font-medium">Dispositivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {filteredReadings.slice(0, 8).map((r) => {
                    const ev = evaluateReadingSeverity(r.valueMgDl, r.context);
                    return (
                      <tr key={r.id}>
                        <td className="py-3 pr-4 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {formatShortDateTime(r.timestamp)}
                        </td>
                        <td className="py-3 pr-4 font-mono tabular-nums font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          {formatGlucoseValue(r.valueMgDl, activeProfile.unitPreference)}{' '}
                          {activeProfile.unitPreference}
                        </td>
                        <td
                          className={`py-3 pr-4 font-medium whitespace-nowrap ${
                            ev.severity === 'normal'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : ev.severity === 'caution'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {ev.label}
                        </td>
                        <td className="py-3 pr-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {contextLabelMap[r.context]}
                        </td>
                        <td className="py-3 pr-4 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {r.deviceInfo}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredReadings.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                  No hay lecturas en este filtro para exportar.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* BLE Capture Modal */}
      <BleCaptureSheet
        isOpen={isBleOpen}
        onClose={() => setIsBleOpen(false)}
        profileId={activeProfile.id}
        profileName={activeProfile.name}
        unit={activeProfile.unitPreference}
        connectedDeviceId={connectedDeviceId}
        onConnectedDeviceChange={handleConnectedDeviceChange}
        existingReadings={profileReadings}
        onSaveSingleReading={onAddReading}
        onSaveBatchReadings={onAddBatchReadings}
      />

      {/* Manual Entry Modal (Enforces mandatory deviceInfo) */}
      {isManualOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Registro manual asistido"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FilePlus2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Registro manual con dispositivo
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsManualOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Cerrar registro manual"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="manual-glucose"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Nivel de glucosa ({activeProfile.unitPreference})
                </label>
                <input
                  id="manual-glucose"
                  type="number"
                  step={activeProfile.unitPreference === 'mmol/L' ? '0.1' : '1'}
                  min={activeProfile.unitPreference === 'mmol/L' ? '1.5' : '25'}
                  max={activeProfile.unitPreference === 'mmol/L' ? '33.0' : '600'}
                  value={manualValueInput}
                  onChange={(e) => setManualValueInput(e.target.value)}
                  required
                  className="w-full min-h-[48px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="manual-device"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Equipo de Diagnósticos Biomédicos (deviceInfo obligatorio)
                </label>
                <select
                  id="manual-device"
                  value={manualDevice}
                  onChange={(e) =>
                    setManualDevice(e.target.value as BiomedicalDeviceId)
                  }
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white"
                >
                  {BIOMEDICAL_DEVICES.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.displayName} ({d.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="manual-context"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Contexto de la medición
                </label>
                <select
                  id="manual-context"
                  value={manualContext}
                  onChange={(e) =>
                    setManualContext(e.target.value as MeasurementContext)
                  }
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white"
                >
                  {MEASUREMENT_CONTEXTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Etiquetas rápidas
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_TAGS.map((tag) => {
                    const active = manualTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setManualTags((prev) =>
                            prev.includes(tag)
                              ? prev.filter((t) => t !== tag)
                              : [...prev, tag]
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                          active
                            ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="manual-note"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Nota (opcional)
                </label>
                <input
                  id="manual-note"
                  type="text"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="Observación clínica..."
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
              >
                Guardar medición
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Alert Modal for Profile Deletion */}
      {profilePendingDelete && (() => {
        const deletedReadingsCount = readings.filter(
          (r) => r.profileId === profilePendingDelete.id
        ).length;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-profile-title"
            aria-describedby="delete-profile-desc"
          >
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="space-y-1.5">
                  <h3
                    id="delete-profile-title"
                    className="text-base font-bold text-slate-900 dark:text-white"
                  >
                    ¿Eliminar el perfil de {profilePendingDelete.name}?
                  </h3>
                  <p
                    id="delete-profile-desc"
                    className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed"
                  >
                    Si confirmas esta acción, se borrará el perfil junto con todas las{' '}
                    <strong className="text-slate-900 dark:text-white font-semibold">
                      {deletedReadingsCount}{' '}
                      {deletedReadingsCount === 1
                        ? 'toma de glucosa registrada'
                        : 'tomas de glucosa registradas'}
                    </strong>{' '}
                    por esta persona en este dispositivo. Esta acción no se puede deshacer.
                  </p>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setProfilePendingDelete(null)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteProfile(profilePendingDelete.id);
                    setProfilePendingDelete(null);
                  }}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors"
                >
                  Sí, eliminar perfil y sus tomas
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
