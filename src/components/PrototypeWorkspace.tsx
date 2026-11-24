import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  CheckCircle2,
  Cpu,
  Download,
  Edit3,
  FilePlus2,
  HelpCircle,
  History,
  Info,
  Moon,
  Phone,
  PhoneCall,
  Plus,
  Share2,
  Sun,
  Trash2,
  Type,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  BIOMEDICAL_DEVICES,
  MAX_LOCAL_PROFILES,
  MEASUREMENT_CONTEXTS,
  QUICK_TAGS,
} from '../data/devicesAndSeeds';
import {
  BiomedicalDeviceId,
  EmergencyContact,
  GlucoseReading,
  GlucoseUnit,
  LocalProfile,
  MeasurementContext,
  PatientTab,
  TextScaleMode,
} from '../types/glucose';
import {
  computeGlucoseStats,
  evaluateReadingSeverity,
  formatDayHeader,
  formatGlucoseValue,
  formatShortDateTime,
  mmolToMgDl,
} from '../utils/glucoseMath';
import { BleCaptureSheet, ConnectedMeterSession } from './BleCaptureSheet';
import { EmergencyContactSection } from './EmergencyContactSection';
import { GuidedOnboarding } from './GuidedOnboarding';
import { TrendChart } from './TrendChart';

interface PrototypeWorkspaceProps {
  profiles: LocalProfile[];
  activeProfile: LocalProfile | null;
  readings: GlucoseReading[];
  activeTab: PatientTab;
  onSelectTab: (tab: PatientTab) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  textScale: TextScaleMode;
  onToggleTextScale: () => void;
  showGuide: boolean;
  onOpenGuide: () => void;
  onCloseGuide: () => void;
  onSelectProfile: (id: string) => void;
  onCreateProfile: (name: string, unit: GlucoseUnit) => void;
  onUpdateProfile: (
    id: string,
    updates: {
      name: string;
      unitPreference: GlucoseUnit;
      targetMinMgDl: number;
      targetMaxMgDl: number;
    }
  ) => void;
  onDeleteProfile: (id: string) => void;
  onChangeProfileUnit: (id: string, unit: GlucoseUnit) => void;
  onUpdateEmergencyContact: (profileId: string, contact: EmergencyContact) => void;
  onAddReading: (reading: Omit<GlucoseReading, 'id'>) => void;
  onAddBatchReadings: (readings: GlucoseReading[]) => void;
  onDeleteReading: (id: string) => void;
  actionFeedback: string | null;
  onNotify: (message: string) => void;
  onExportPdf: (
    readingsToExport: GlucoseReading[],
    rangeLabel: string,
    shareIfAvailable?: boolean
  ) => void;
}

type DateRangeFilter = '7d' | '14d' | '30d' | 'all';

function toLocalDatetimeInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export const PrototypeWorkspace: React.FC<PrototypeWorkspaceProps> = ({
  profiles,
  activeProfile,
  readings,
  activeTab,
  onSelectTab,
  isDark,
  onToggleTheme,
  textScale,
  onToggleTextScale,
  showGuide,
  onOpenGuide,
  onCloseGuide,
  onSelectProfile,
  onCreateProfile,
  onUpdateProfile,
  onDeleteProfile,
  onChangeProfileUnit,
  onUpdateEmergencyContact,
  onAddReading,
  onAddBatchReadings,
  onDeleteReading,
  actionFeedback,
  onNotify,
  onExportPdf,
}) => {
  const [rangeFilter, setRangeFilter] = useState<DateRangeFilter>('14d');
  const [contextFilter, setContextFilter] = useState<MeasurementContext | 'all'>('all');
  const [isBleOpen, setIsBleOpen] = useState(false);
  const [isMeasureChoiceOpen, setIsMeasureChoiceOpen] = useState(false);
  const [connectedSession, setConnectedSession] =
    useState<ConnectedMeterSession | null>(null);

  // Profile creation, edit & deletion confirmation state
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileUnit, setNewProfileUnit] = useState<GlucoseUnit>('mg/dL');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<LocalProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editUnit, setEditUnit] = useState<GlucoseUnit>('mg/dL');
  const [editTargetMin, setEditTargetMin] = useState('70');
  const [editTargetMax, setEditTargetMax] = useState('140');
  const [profilePendingDelete, setProfilePendingDelete] =
    useState<LocalProfile | null>(null);

  // Reading details & deletion confirmation state
  const [readingDetail, setReadingDetail] = useState<GlucoseReading | null>(null);
  const [readingPendingDelete, setReadingPendingDelete] =
    useState<GlucoseReading | null>(null);

  // Emergency call confirmation state (NEVER call automatically)
  const [contactPendingCall, setContactPendingCall] =
    useState<EmergencyContact | null>(null);

  // Manual entry modal state
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [manualValueInput, setManualValueInput] = useState('110');
  const [manualEntryUnit, setManualEntryUnit] = useState<GlucoseUnit>('mg/dL');
  const [manualDateTime, setManualDateTime] = useState(
    toLocalDatetimeInputValue(Date.now())
  );
  const [manualDevice, setManualDevice] =
    useState<BiomedicalDeviceId>('OKMeter_Match_II');
  const [manualCustomModel, setManualCustomModel] = useState('');
  const [manualContext, setManualContext] =
    useState<MeasurementContext>('fasting');
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

  const stats = useMemo(
    () =>
      computeGlucoseStats(
        filteredReadings,
        activeProfile?.targetMinMgDl ?? 70,
        activeProfile?.targetMaxMgDl ?? 140
      ),
    [filteredReadings, activeProfile]
  );

  const latestReading = profileReadings[0] ?? null;
  const latestEvaluation =
    latestReading && activeProfile
      ? evaluateReadingSeverity(
          latestReading.valueMgDl,
          latestReading.context,
          activeProfile.targetMinMgDl,
          activeProfile.targetMaxMgDl
        )
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
      setProfileError('Por favor escribe un nombre para crear el perfil.');
      return;
    }
    if (profiles.length >= MAX_LOCAL_PROFILES) {
      setProfileError('Ya tienes el máximo de 3 perfiles en este dispositivo.');
      return;
    }
    setProfileError(null);
    onCreateProfile(trimmed, newProfileUnit);
    setNewProfileName('');
    onNotify(`Perfil de ${trimmed} creado y guardado localmente.`);
  };

  const openEditProfileModal = (p: LocalProfile) => {
    setEditingProfile(p);
    setEditName(p.name);
    setEditUnit(p.unitPreference);
    setEditTargetMin(
      formatGlucoseValue(p.targetMinMgDl, p.unitPreference)
    );
    setEditTargetMax(
      formatGlucoseValue(p.targetMaxMgDl, p.unitPreference)
    );
  };

  const handleSaveProfileEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;
    const trimmed = editName.trim();
    if (!trimmed) return;

    const minNum = parseFloat(editTargetMin);
    const maxNum = parseFloat(editTargetMax);
    let minMg =
      editUnit === 'mmol/L' ? mmolToMgDl(minNum || 3.9) : Math.round(minNum || 70);
    let maxMg =
      editUnit === 'mmol/L' ? mmolToMgDl(maxNum || 7.8) : Math.round(maxNum || 140);

    minMg = Math.max(45, Math.min(200, minMg));
    maxMg = Math.max(minMg + 20, Math.min(350, maxMg));

    onUpdateProfile(editingProfile.id, {
      name: trimmed,
      unitPreference: editUnit,
      targetMinMgDl: minMg,
      targetMaxMgDl: maxMg,
    });
    setEditingProfile(null);
    onNotify(`Cambios guardados en el perfil de ${trimmed}.`);
  };

  const openManualModal = () => {
    if (!activeProfile) return;
    const u = activeProfile.unitPreference;
    setManualEntryUnit(u);
    setManualValueInput(u === 'mmol/L' ? '5.9' : '108');
    setManualDateTime(toLocalDatetimeInputValue(Date.now()));
    setManualDevice(connectedSession?.matchedModelId ?? 'OKMeter_Match_II');
    setManualCustomModel('');
    setIsMeasureChoiceOpen(false);
    setIsManualOpen(true);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) return;
    const numeric = parseFloat(manualValueInput);
    if (Number.isNaN(numeric) || numeric <= 0) return;

    const valueMgDl =
      manualEntryUnit === 'mmol/L' ? mmolToMgDl(numeric) : Math.round(numeric);
    const clamped = Math.max(25, Math.min(600, valueMgDl));

    const parsedDate = new Date(manualDateTime).getTime();
    const finalTimestamp = Number.isNaN(parsedDate) ? Date.now() : parsedDate;

    const selectedModelSpec = BIOMEDICAL_DEVICES.find((d) => d.id === manualDevice);
    const deviceModel =
      manualDevice === 'Otro_Compatible'
        ? manualCustomModel.trim() || 'Registro manual sin equipo'
        : selectedModelSpec?.displayName ?? 'Registro manual';

    onAddReading({
      profileId: activeProfile.id,
      valueMgDl: clamped,
      originalUnit: manualEntryUnit,
      timestamp: finalTimestamp,
      context: manualContext,
      quickTags: manualTags,
      note: manualNote.trim(),
      captureMethod: 'manual',
      deviceModel,
      deviceId: manualDevice,
    });
    setIsManualOpen(false);
    setManualNote('');
    setManualTags([]);
    onNotify(
      `¡Listo! Guardamos tu medición de ${formatGlucoseValue(
        clamped,
        activeProfile.unitPreference
      )} ${activeProfile.unitPreference}.`
    );
  };

  const handleGuideJump = (target: PatientTab | 'measure') => {
    onCloseGuide();
    if (target === 'measure') {
      setIsMeasureChoiceOpen(true);
    } else {
      onSelectTab(target);
    }
  };

  const isLargeText = textScale === 'large';

  // First-start / zero-profiles state (real clean database, no fake seed patients)
  if (!activeProfile) {
    return (
      <div className="space-y-6">
        <GuidedOnboarding
          isOpen={showGuide}
          onClose={onCloseGuide}
          onJumpToAction={handleGuideJump}
        />

        <div className="max-w-lg mx-auto p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Crea tu primer perfil para comenzar
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              No necesitas correo ni internet. Tus mediciones se guardan de forma privada en este dispositivo (hasta 3 perfiles).
            </p>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="first-profile-name"
                className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
              >
                Nombre del perfil
              </label>
              <input
                id="first-profile-name"
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="Ej. María López"
                maxLength={32}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="flex items-center gap-3">
              <select
                value={newProfileUnit}
                onChange={(e) => setNewProfileUnit(e.target.value as GlucoseUnit)}
                aria-label="Unidad de medida preferida"
                className="min-h-[48px] px-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-800 dark:text-slate-200"
              >
                <option value="mg/dL">mg/dL</option>
                <option value="mmol/L">mmol/L</option>
              </select>
              <button
                type="submit"
                className="flex-1 min-h-[48px] px-5 py-3 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white text-base font-semibold transition-colors"
              >
                Crear perfil y comenzar
              </button>
            </div>
            {profileError && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {profileError}
              </p>
            )}
          </form>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={onToggleTheme}
              className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-2"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{isDark ? 'Modo Claro' : 'Modo Oscuro'}</span>
            </button>
            <button
              type="button"
              onClick={onOpenGuide}
              className="font-medium text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1.5"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Ver guía rápida</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const emergency = activeProfile.emergencyContact;

  return (
    <div className={`space-y-6 pb-20 sm:pb-6 ${isLargeText ? 'text-[17px]' : ''}`}>
      {/* Friendly Accessibility & Quick Switch Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
            Perfil:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {profiles.map((prof) => {
              const active = prof.id === activeProfile.id;
              return (
                <button
                  key={prof.id}
                  type="button"
                  onClick={() => {
                    onSelectProfile(prof.id);
                    onNotify(`Cambiaste al perfil de ${prof.name}.`);
                  }}
                  className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 border ${
                    active
                      ? 'bg-teal-700 text-white border-teal-700 dark:bg-teal-600 dark:border-teal-600'
                      : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-teal-500'
                  }`}
                >
                  <span>{prof.name}</span>
                </button>
              );
            })}
            {profiles.length < MAX_LOCAL_PROFILES && (
              <button
                type="button"
                onClick={() => onSelectTab('profiles')}
                className="min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-medium text-teal-700 dark:text-teal-400 border border-dashed border-teal-300 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>Agregar</span>
              </button>
            )}
          </div>
        </div>

        {/* Accessibility controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleTextScale}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
              isLargeText
                ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
            aria-pressed={isLargeText}
          >
            <Type className="w-4 h-4" />
            <span>{isLargeText ? 'Letra: Grande' : 'Letra: Normal'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
            aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{isDark ? 'Claro' : 'Oscuro'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenGuide}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <HelpCircle className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span>Guía rápida</span>
          </button>
        </div>
      </div>

      {actionFeedback && (
        <div
          role="status"
          aria-live="polite"
          className="px-4 py-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-sm font-medium text-emerald-900 dark:text-emerald-200 flex items-center gap-2.5"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      <GuidedOnboarding
        isOpen={showGuide}
        onClose={onCloseGuide}
        onJumpToAction={handleGuideJump}
      />

      {/* VIEW 1: FRIENDLY HOME SCREEN */}
      {activeTab === 'home' && (
        <div className="space-y-6">
          <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <span>Última medición de {activeProfile.name}</span>
                  {latestReading && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {formatShortDateTime(latestReading.timestamp)}
                      </span>
                    </>
                  )}
                </div>

                {latestReading && latestEvaluation ? (
                  <>
                    <div className="flex flex-wrap items-baseline gap-4">
                      <div>
                        <span
                          className={`${
                            isLargeText ? 'text-6xl sm:text-7xl' : 'text-5xl sm:text-6xl'
                          } font-extrabold font-mono tabular-nums tracking-tight text-slate-900 dark:text-white`}
                        >
                          {formatGlucoseValue(
                            latestReading.valueMgDl,
                            activeProfile.unitPreference
                          )}
                        </span>
                        <span className="ml-2.5 text-lg font-medium text-slate-500 dark:text-slate-400">
                          {activeProfile.unitPreference}
                        </span>
                      </div>

                      <div
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl border text-sm sm:text-base font-bold ${
                          latestEvaluation.severity === 'normal'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
                            : latestEvaluation.severity === 'caution'
                            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-300'
                            : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
                        }`}
                      >
                        {latestEvaluation.severity === 'normal' ? (
                          <CheckCircle2 className="w-5 h-5 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 shrink-0" />
                        )}
                        <span>{latestEvaluation.label}</span>
                      </div>
                    </div>

                    <p
                      className={`${
                        isLargeText ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
                      } text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl`}
                    >
                      {latestEvaluation.detail}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                      <span>{contextLabelMap[latestReading.context]}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {latestReading.captureMethod === 'bluetooth'
                          ? 'Bluetooth'
                          : 'Registro manual'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{latestReading.deviceModel}</span>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2 py-2">
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                      Aún no tienes mediciones guardadas
                    </div>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">
                      Pulsa <strong>Nueva medición</strong> para anotar tu primer resultado o conectar un glucómetro compatible.
                    </p>
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setIsMeasureChoiceOpen(true)}
                  className="w-full min-h-[60px] px-6 py-4 rounded-2xl bg-teal-700 hover:bg-teal-800 active:scale-[0.99] text-white text-base sm:text-lg font-bold transition-all flex items-center justify-center gap-3 shadow-sm"
                >
                  <Plus className="w-6 h-6" />
                  <span>Nueva medición</span>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectTab('history')}
                  className="w-full min-h-[50px] px-5 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm sm:text-base font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <History className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                  <span>Ver historial ({profileReadings.length})</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3 Home Cards: Bluetooth Meter + Summary + Emergency Contact */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  <Bluetooth className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                  <span>Glucómetro Bluetooth</span>
                </div>
                {connectedSession ? (
                  <>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">
                      {connectedSession.matchedModelName}
                    </div>
                    <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                      {connectedSession.connectionMessage}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">
                      Sin equipo conectado
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Busca un glucómetro cercano o consulta la compatibilidad de tu modelo.
                    </p>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsBleOpen(true)}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl border border-teal-700/30 dark:border-teal-500/40 bg-teal-50/60 dark:bg-teal-950/30 text-teal-800 dark:text-teal-200 text-sm font-semibold hover:bg-teal-100/70 dark:hover:bg-teal-950/50 transition-colors"
              >
                {connectedSession ? 'Gestionar conexión' : 'Conectar glucómetro'}
              </button>
            </div>

            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  <Activity className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                  <span>Resumen ({rangeLabelText})</span>
                </div>
                <div className="text-lg font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                  {stats.count > 0
                    ? `${stats.inRangePercent}% dentro de tu meta`
                    : 'Sin mediciones aún'}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {stats.count > 0
                    ? `Promedio: ${formatGlucoseValue(
                        stats.avgMgDl,
                        activeProfile.unitPreference
                      )} ${activeProfile.unitPreference} en ${stats.count} tomas.`
                    : 'Aquí verás tu promedio y resumen de seguimiento.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onExportPdf(filteredReadings, rangeLabelText, false)}
                disabled={filteredReadings.length === 0}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Reporte PDF</span>
              </button>
            </div>

            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 text-sm font-semibold text-rose-700 dark:text-rose-400">
                  <PhoneCall className="w-5 h-5" />
                  <span>Contacto de emergencia</span>
                </div>
                {emergency ? (
                  <>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">
                      {emergency.name}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {emergency.relation} ·{' '}
                      <span className="font-mono font-medium">{emergency.phone}</span>
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">
                      Aún no configurado
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Guarda el número de un familiar o médico para llamarle si lo necesitas.
                    </p>
                  </>
                )}
              </div>

              {emergency ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setContactPendingCall(emergency)}
                    className="min-h-[48px] px-3 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Llamar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectTab('emergency')}
                    className="min-h-[48px] px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Editar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectTab('emergency')}
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors"
                >
                  Agregar contacto
                </button>
              )}
            </div>
          </div>

          {/* Trend Chart + Non-diagnostic Orientative Disclaimer */}
          <div className="p-6 sm:p-7 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Tus mediciones en el tiempo
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Toca cualquier punto para ver el detalle de ese día.
                </p>
              </div>
              <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                {(
                  [
                    { id: '7d', label: '7 días' },
                    { id: '14d', label: '14 días' },
                    { id: '30d', label: '30 días' },
                    { id: 'all', label: 'Todo' },
                  ] as const
                ).map((rng) => (
                  <button
                    key={rng.id}
                    type="button"
                    onClick={() => setRangeFilter(rng.id)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      rangeFilter === rng.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {rng.label}
                  </button>
                ))}
              </div>
            </div>

            <TrendChart
              readings={filteredReadings}
              unit={activeProfile.unitPreference}
              targetMinMgDl={activeProfile.targetMinMgDl}
              targetMaxMgDl={activeProfile.targetMaxMgDl}
            />

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pt-2 border-t border-slate-100 dark:border-slate-800">
              Aviso orientativo: Los colores y rangos mostrados ({formatGlucoseValue(activeProfile.targetMinMgDl, activeProfile.unitPreference)}–{formatGlucoseValue(activeProfile.targetMaxMgDl, activeProfile.unitPreference)} {activeProfile.unitPreference}) son configurables en tu perfil y sirven solo como guía visual. No sustituyen un diagnóstico ni indicación médica profesional.
            </p>
          </div>
        </div>
      )}

      {/* VIEW 2: HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Historial de {activeProfile.name}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {filteredReadings.length}{' '}
                {filteredReadings.length === 1 ? 'medición encontrada' : 'mediciones encontradas'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={rangeFilter}
                onChange={(e) => setRangeFilter(e.target.value as DateRangeFilter)}
                aria-label="Filtrar por fechas"
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-100"
              >
                <option value="7d">Últimos 7 días</option>
                <option value="14d">Últimos 14 días</option>
                <option value="30d">Últimos 30 días</option>
                <option value="all">Todas las fechas</option>
              </select>

              <select
                value={contextFilter}
                onChange={(e) =>
                  setContextFilter(e.target.value as MeasurementContext | 'all')
                }
                aria-label="Filtrar por momento del día"
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-100"
              >
                <option value="all">Todos los momentos</option>
                {MEASUREMENT_CONTEXTS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => onExportPdf(filteredReadings, rangeLabelText, false)}
                disabled={filteredReadings.length === 0}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white text-sm font-semibold transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Guardar PDF</span>
              </button>

              <button
                type="button"
                onClick={() => onExportPdf(filteredReadings, rangeLabelText, true)}
                disabled={filteredReadings.length === 0}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 text-slate-800 dark:text-slate-100 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                <span>Compartir</span>
              </button>
            </div>
          </div>

          {groupedByDay.length === 0 ? (
            <div className="p-10 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
                No hay mediciones en este filtro
              </p>
              <button
                type="button"
                onClick={() => {
                  setRangeFilter('all');
                  setContextFilter('all');
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-teal-700 dark:text-teal-400"
              >
                Mostrar todo el historial
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {groupedByDay.map((group) => (
                <div key={group.dayLabel} className="space-y-2.5">
                  <h3 className="text-sm font-bold capitalize text-slate-600 dark:text-slate-300 px-1">
                    {group.dayLabel}
                  </h3>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    {group.items.map((item) => {
                      const ev = evaluateReadingSeverity(
                        item.valueMgDl,
                        item.context,
                        activeProfile.targetMinMgDl,
                        activeProfile.targetMaxMgDl
                      );
                      return (
                        <div
                          key={item.id}
                          className="p-4 sm:p-5 flex items-start justify-between gap-4"
                        >
                          <button
                            type="button"
                            onClick={() => setReadingDetail(item)}
                            className="space-y-1.5 min-w-0 flex-1 text-left"
                          >
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                                {formatGlucoseValue(
                                  item.valueMgDl,
                                  activeProfile.unitPreference
                                )}{' '}
                                <span className="text-sm font-normal text-slate-500">
                                  {activeProfile.unitPreference}
                                </span>
                              </span>
                              <span
                                className={`inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold ${
                                  ev.severity === 'normal'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : ev.severity === 'caution'
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-rose-700 dark:text-rose-400'
                                }`}
                              >
                                {ev.severity === 'normal' ? (
                                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                                ) : (
                                  <AlertTriangle className="w-4 h-4 shrink-0" />
                                )}
                                <span>{ev.label}</span>
                              </span>
                            </div>

                            <div className="text-sm text-slate-700 dark:text-slate-300">
                              {contextLabelMap[item.context]} · {item.deviceModel} ·{' '}
                              {item.captureMethod === 'bluetooth'
                                ? 'Bluetooth'
                                : 'Manual'}{' '}
                              ·{' '}
                              <span className="text-slate-500 dark:text-slate-400">
                                {formatShortDateTime(item.timestamp)}
                              </span>
                            </div>

                            {(item.quickTags.length > 0 || item.note) && (
                              <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                                {[item.quickTags.join(', '), item.note]
                                  .filter(Boolean)
                                  .join(' — ')}
                              </div>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setReadingPendingDelete(item)}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors shrink-0"
                            aria-label="Eliminar esta medición"
                            title="Eliminar medición"
                          >
                            <Trash2 className="w-5 h-5" />
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

      {/* VIEW 3: GLUCOMETERS & HONEST DIAGNOSTICS */}
      {activeTab === 'devices' && (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="p-6 sm:p-7 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Conexión y diagnóstico de glucómetros
                </h2>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">
                  Conecta tu equipo por Bluetooth cuando esté disponible, o registra tus tomas manualmente si tu medidor no incluye radio inalámbrica.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsBleOpen(true)}
                className="min-h-[48px] px-5 py-2.5 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors flex items-center gap-2 shrink-0"
              >
                <Bluetooth className="w-4 h-4" />
                <span>
                  {connectedSession ? 'Ver conexión activa' : 'Buscar glucómetro'}
                </span>
              </button>
            </div>

            {connectedSession && (
              <div className="p-4 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900 text-sm text-teal-900 dark:text-teal-200">
                <strong>Conectado:</strong> {connectedSession.matchedModelName} (
                {connectedSession.deviceName}) · {connectedSession.connectionMessage}
              </div>
            )}
          </div>

          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2.5 text-base font-bold text-slate-900 dark:text-white">
              <Info className="w-5 h-5 text-teal-700 dark:text-teal-400" />
              <span>Estado real de los 5 modelos de glucómetro</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Cada modelo requiere validación física con una unidad real antes de confirmar su transmisión inalámbrica automática. Mientras tanto, todos pueden seleccionarse para llevar el registro manual completo.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {BIOMEDICAL_DEVICES.map((dev) => (
                <div
                  key={dev.id}
                  className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {dev.displayName}
                    </h3>
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                      Validación física pendiente
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {dev.protocolNotes}
                  </p>
                  <div className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                    {dev.memoryCapacityLabel}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: EMERGENCY CONTACT */}
      {activeTab === 'emergency' && (
        <EmergencyContactSection
          profileName={activeProfile.name}
          contact={activeProfile.emergencyContact}
          latestValueMgDl={latestReading?.valueMgDl ?? null}
          unit={activeProfile.unitPreference}
          onSaveContact={(contact) => {
            onUpdateEmergencyContact(activeProfile.id, contact);
            onNotify(`Contacto de emergencia (${contact.name}) guardado correctamente.`);
          }}
          onRequestCall={(contact) => setContactPendingCall(contact)}
        />
      )}

      {/* VIEW 5: PROFILES & PERSONAL SETTINGS */}
      {activeTab === 'profiles' && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="p-6 sm:p-7 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Perfiles en este dispositivo ({profiles.length} de {MAX_LOCAL_PROFILES})
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                Cada persona tiene su historial, unidad, meta orientativa y contacto de emergencia por separado, sin contraseñas ni internet.
              </p>
            </div>

            <div className="space-y-3">
              {profiles.map((p) => {
                const isCurrent = p.id === activeProfile.id;
                const count = readings.filter((r) => r.profileId === p.id).length;
                return (
                  <div
                    key={p.id}
                    className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                      isCurrent
                        ? 'border-teal-600 bg-teal-50/50 dark:bg-teal-950/30'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectProfile(p.id);
                        onSelectTab('home');
                        onNotify(`Ahora estás viendo el perfil de ${p.name}.`);
                      }}
                      className="text-left min-w-0 flex-1"
                    >
                      <div className="text-base font-bold text-slate-900 dark:text-white truncate">
                        {p.name} {isCurrent ? '· Activo' : ''}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        {count} {count === 1 ? 'medición' : 'mediciones'} · Unidad: {p.unitPreference} · Meta:{' '}
                        {formatGlucoseValue(p.targetMinMgDl, p.unitPreference)}–
                        {formatGlucoseValue(p.targetMaxMgDl, p.unitPreference)}
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditProfileModal(p)}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors"
                        aria-label={`Editar perfil de ${p.name}`}
                        title={`Editar perfil de ${p.name}`}
                      >
                        <Edit3 className="w-5 h-5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setProfilePendingDelete(p)}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        aria-label={`Eliminar perfil de ${p.name}`}
                        title={`Eliminar perfil de ${p.name}`}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Unidad de medida para {activeProfile.name}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Cambia entre mg/dL o mmol/L según las indicaciones de tu médico.
                </div>
              </div>
              <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                {(['mg/dL', 'mmol/L'] as GlucoseUnit[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => {
                      onChangeProfileUnit(activeProfile.id, u);
                      onNotify(`Unidad cambiada a ${u} para ${activeProfile.name}.`);
                    }}
                    className={`min-h-[40px] px-4 py-1.5 rounded-lg text-sm font-mono font-semibold transition-colors ${
                      activeProfile.unitPreference === u
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {profiles.length < MAX_LOCAL_PROFILES ? (
              <form
                onSubmit={handleProfileSubmit}
                className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3"
              >
                <label
                  htmlFor="new-profile-name"
                  className="block text-sm font-bold text-slate-900 dark:text-white"
                >
                  Agregar otra persona ({profiles.length} de {MAX_LOCAL_PROFILES})
                </label>
                <input
                  id="new-profile-name"
                  type="text"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="Escribe el nombre (ej. Sofía)"
                  maxLength={32}
                  className="w-full min-h-[48px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <div className="flex items-center gap-3">
                  <select
                    value={newProfileUnit}
                    onChange={(e) => setNewProfileUnit(e.target.value as GlucoseUnit)}
                    aria-label="Unidad inicial"
                    className="min-h-[48px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono text-slate-800 dark:text-slate-200"
                  >
                    <option value="mg/dL">mg/dL</option>
                    <option value="mmol/L">mmol/L</option>
                  </select>
                  <button
                    type="submit"
                    className="flex-1 min-h-[48px] px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors"
                  >
                    Crear perfil
                  </button>
                </div>
                {profileError && (
                  <p className="text-sm text-rose-600 dark:text-rose-400">
                    {profileError}
                  </p>
                )}
              </form>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                Ya existen 3 perfiles locales (límite máximo permitido). Si deseas crear otro, primero elimina uno existente.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Mobile Fixed Thumb-Zone Bottom Bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 h-16"
        aria-label="Navegación principal móvil"
      >
        {(
          [
            { id: 'home', label: 'Inicio', icon: Activity },
            { id: 'history', label: 'Historial', icon: History },
            { id: 'devices', label: 'Medidor', icon: Cpu },
            { id: 'emergency', label: 'Ayuda', icon: PhoneCall },
            { id: 'profiles', label: 'Perfiles', icon: Users },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active
                  ? 'text-teal-700 dark:text-teal-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px]">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* CHOICE MODAL: New Measurement */}
      {isMeasureChoiceOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Cómo registrar nueva medición"
        >
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                ¿Cómo quieres registrar tu medición?
              </h3>
              <button
                type="button"
                onClick={() => setIsMeasureChoiceOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={openManualModal}
                className="w-full p-5 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white text-left flex items-center gap-4 transition-colors"
              >
                <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                  <FilePlus2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-base font-bold">
                    Escribir el resultado manualmente
                  </div>
                  <div className="text-xs sm:text-sm text-teal-100 mt-0.5">
                    Anota el valor de tu medidor, fecha, momento y notas
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMeasureChoiceOpen(false);
                  setIsBleOpen(true);
                }}
                className="w-full p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-left flex items-center gap-4 transition-colors"
              >
                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 text-teal-700 dark:text-teal-400">
                  <Bluetooth className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    {connectedSession
                      ? `Recibir desde ${connectedSession.matchedModelName}`
                      : 'Conectar glucómetro por Bluetooth'}
                  </div>
                  <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    Busca equipos físicos compatibles cercanos
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real Web Bluetooth Sheet */}
      <BleCaptureSheet
        isOpen={isBleOpen}
        onClose={() => setIsBleOpen(false)}
        profileId={activeProfile.id}
        profileName={activeProfile.name}
        unit={activeProfile.unitPreference}
        connectedSession={connectedSession}
        onSessionChange={setConnectedSession}
        existingReadings={profileReadings}
        onSaveIncomingReading={(r) => {
          onAddReading(r);
          onNotify(
            `Medición recibida de ${r.deviceModel}: ${formatGlucoseValue(
              r.valueMgDl,
              activeProfile.unitPreference
            )} ${activeProfile.unitPreference}.`
          );
        }}
        onSaveBatchReadings={(items) => {
          onAddBatchReadings(items);
          onNotify(
            `Se importaron ${items.length} mediciones nuevas desde el glucómetro.`
          );
        }}
        onOpenManualEntry={openManualModal}
      />

      {/* Manual Entry Modal */}
      {isManualOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Registrar medición manualmente"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Registrar medición manual
              </h3>
              <button
                type="button"
                onClick={() => setIsManualOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div className="space-y-1.5">
                <label
                  htmlFor="manual-glucose"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
                >
                  Valor de glucosa
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="manual-glucose"
                    type="number"
                    step={manualEntryUnit === 'mmol/L' ? '0.1' : '1'}
                    min={manualEntryUnit === 'mmol/L' ? '1.4' : '25'}
                    max={manualEntryUnit === 'mmol/L' ? '33.3' : '600'}
                    value={manualValueInput}
                    onChange={(e) => setManualValueInput(e.target.value)}
                    required
                    className="flex-1 min-h-[54px] px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                  <select
                    value={manualEntryUnit}
                    onChange={(e) =>
                      setManualEntryUnit(e.target.value as GlucoseUnit)
                    }
                    aria-label="Unidad de esta medición"
                    className="min-h-[54px] px-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono font-semibold text-slate-800 dark:text-slate-200"
                  >
                    <option value="mg/dL">mg/dL</option>
                    <option value="mmol/L">mmol/L</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="manual-datetime"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
                >
                  Fecha y hora de la medición
                </label>
                <input
                  id="manual-datetime"
                  type="datetime-local"
                  value={manualDateTime}
                  onChange={(e) => setManualDateTime(e.target.value)}
                  required
                  className="w-full min-h-[48px] px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="manual-context"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
                >
                  Contexto de la medición
                </label>
                <select
                  id="manual-context"
                  value={manualContext}
                  onChange={(e) =>
                    setManualContext(e.target.value as MeasurementContext)
                  }
                  className="w-full min-h-[48px] px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white"
                >
                  {MEASUREMENT_CONTEXTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="manual-device"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
                >
                  Modelo del glucómetro
                </label>
                <select
                  id="manual-device"
                  value={manualDevice}
                  onChange={(e) =>
                    setManualDevice(e.target.value as BiomedicalDeviceId)
                  }
                  className="w-full min-h-[48px] px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white"
                >
                  {BIOMEDICAL_DEVICES.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.displayName}
                    </option>
                  ))}
                  <option value="Otro_Compatible">Otro modelo / Sin especificar</option>
                </select>
                {manualDevice === 'Otro_Compatible' && (
                  <input
                    type="text"
                    value={manualCustomModel}
                    onChange={(e) => setManualCustomModel(e.target.value)}
                    placeholder="Nombre del glucómetro (opcional)"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white mt-2"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Etiquetas rápidas (opcional)
                </span>
                <div className="flex flex-wrap gap-2">
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
                        className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs sm:text-sm border transition-colors ${
                          active
                            ? 'border-teal-700 bg-teal-700 text-white'
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
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
                >
                  Notas (opcional)
                </label>
                <input
                  id="manual-note"
                  type="text"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="Ej. Caminé 20 minutos antes de cenar..."
                  className="w-full min-h-[48px] px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[52px] px-4 py-3 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white text-base font-semibold transition-colors"
              >
                Guardar medición
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Profile Modal (Name, Unit, Configurable Orientative Ranges) */}
      {editingProfile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Editar perfil"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Editar perfil
              </h3>
              <button
                type="button"
                onClick={() => setEditingProfile(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfileEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-prof-name"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
                >
                  Nombre
                </label>
                <input
                  id="edit-prof-name"
                  type="text"
                  required
                  maxLength={32}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full min-h-[48px] px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-prof-unit"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
                >
                  Unidad preferida
                </label>
                <select
                  id="edit-prof-unit"
                  value={editUnit}
                  onChange={(e) => {
                    const nextU = e.target.value as GlucoseUnit;
                    setEditUnit(nextU);
                    setEditTargetMin(nextU === 'mmol/L' ? '3.9' : '70');
                    setEditTargetMax(nextU === 'mmol/L' ? '7.8' : '140');
                  }}
                  className="w-full min-h-[48px] px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                >
                  <option value="mg/dL">mg/dL</option>
                  <option value="mmol/L">mmol/L</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="edit-min-range"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Meta mínima ({editUnit})
                  </label>
                  <input
                    id="edit-min-range"
                    type="number"
                    step={editUnit === 'mmol/L' ? '0.1' : '1'}
                    value={editTargetMin}
                    onChange={(e) => setEditTargetMin(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="edit-max-range"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Meta máxima ({editUnit})
                  </label>
                  <input
                    id="edit-max-range"
                    type="number"
                    step={editUnit === 'mmol/L' ? '0.1' : '1'}
                    value={editTargetMax}
                    onChange={(e) => setEditTargetMax(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Estos valores son orientativos según las indicaciones de tu profesional de salud y no representan un diagnóstico médico.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="min-h-[46px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[46px] px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reading Detail Modal */}
      {readingDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Detalle de medición"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Detalle de medición
              </h3>
              <button
                type="button"
                onClick={() => setReadingDetail(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="text-3xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                {formatGlucoseValue(
                  readingDetail.valueMgDl,
                  activeProfile.unitPreference
                )}{' '}
                <span className="text-base font-normal text-slate-500">
                  {activeProfile.unitPreference}
                </span>
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                {formatShortDateTime(readingDetail.timestamp)}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Contexto</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {contextLabelMap[readingDetail.context]}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Método</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {readingDetail.captureMethod === 'bluetooth'
                    ? 'Bluetooth'
                    : 'Registro manual'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Glucómetro</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {readingDetail.deviceModel}
                </span>
              </div>
              {readingDetail.quickTags.length > 0 && (
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 gap-4">
                  <span className="text-slate-500">Etiquetas</span>
                  <span className="font-medium text-right text-slate-900 dark:text-white">
                    {readingDetail.quickTags.join(', ')}
                  </span>
                </div>
              )}
              {readingDetail.note && (
                <div className="pt-1">
                  <span className="text-slate-500 block">Notas</span>
                  <p className="text-slate-900 dark:text-white mt-0.5">
                    {readingDetail.note}
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setReadingDetail(null)}
              className="w-full min-h-[46px] rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold"
            >
              Cerrar
            </button>
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
                <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h3
                    id="delete-profile-title"
                    className="text-lg font-bold text-slate-900 dark:text-white"
                  >
                    ¿Eliminar el perfil de {profilePendingDelete.name}?
                  </h3>
                  <p
                    id="delete-profile-desc"
                    className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed"
                  >
                    Si confirmas, se borrarán permanentemente{' '}
                    <strong className="text-slate-900 dark:text-white font-semibold">
                      {deletedReadingsCount}{' '}
                      {deletedReadingsCount === 1
                        ? 'medición guardada'
                        : 'mediciones guardadas'}
                    </strong>{' '}
                    junto con su contacto de emergencia en este dispositivo. Esta acción no se puede deshacer.
                  </p>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setProfilePendingDelete(null)}
                  className="min-h-[48px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const name = profilePendingDelete.name;
                    onDeleteProfile(profilePendingDelete.id);
                    setProfilePendingDelete(null);
                    onNotify(`Se eliminó el perfil de ${name} y sus mediciones.`);
                  }}
                  className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors"
                >
                  Sí, eliminar permanentemente
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirmation Alert Modal for Single Reading Deletion */}
      {readingPendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-reading-title"
          aria-describedby="delete-reading-desc"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3
                  id="delete-reading-title"
                  className="text-lg font-bold text-slate-900 dark:text-white"
                >
                  ¿Eliminar esta medición?
                </h3>
                <p
                  id="delete-reading-desc"
                  className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed"
                >
                  Se borrará el registro de{' '}
                  <strong className="font-mono">
                    {formatGlucoseValue(
                      readingPendingDelete.valueMgDl,
                      activeProfile.unitPreference
                    )}{' '}
                    {activeProfile.unitPreference}
                  </strong>{' '}
                  del {formatShortDateTime(readingPendingDelete.timestamp)}.
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setReadingPendingDelete(null)}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteReading(readingPendingDelete.id);
                  setReadingPendingDelete(null);
                  onNotify('Medición eliminada del historial.');
                }}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Alert Modal for Emergency Phone Call (Never auto-dials) */}
      {contactPendingCall && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="call-confirm-title"
          aria-describedby="call-confirm-desc"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <PhoneCall className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3
                  id="call-confirm-title"
                  className="text-lg font-bold text-slate-900 dark:text-white"
                >
                  ¿Abrir marcador para llamar?
                </h3>
                <p
                  id="call-confirm-desc"
                  className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed"
                >
                  Se abrirá el teléfono para llamar a{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {contactPendingCall.name}
                  </strong>{' '}
                  ({contactPendingCall.relation}) al número{' '}
                  <span className="font-mono font-semibold">
                    {contactPendingCall.phone}
                  </span>
                  .
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setContactPendingCall(null)}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <a
                href={`tel:${contactPendingCall.phone.replace(/[^\d+]/g, '')}`}
                onClick={() => setContactPendingCall(null)}
                className="min-h-[48px] px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Phone className="w-4 h-4" />
                <span>Abrir teléfono</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
