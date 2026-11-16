import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { FlutterBlueprintView } from './components/FlutterBlueprintView';
import { PrototypeWorkspace } from './components/PrototypeWorkspace';
import {
  MAX_LOCAL_PROFILES,
  PROFILE_COLORS,
  createSeedData,
} from './data/devicesAndSeeds';
import {
  AppSection,
  GlucoseReading,
  GlucoseUnit,
  LocalProfile,
} from './types/glucose';
import { exportClinicalPdfReport } from './utils/pdfReport';

const STORAGE_KEYS = {
  profiles: 'glucopulse_profiles_v1',
  readings: 'glucopulse_readings_v1',
  activeProfileId: 'glucopulse_active_profile_v1',
  theme: 'glucopulse_theme_v1',
};

function loadInitialState() {
  const seed = createSeedData();
  try {
    const rawProfiles = localStorage.getItem(STORAGE_KEYS.profiles);
    const rawReadings = localStorage.getItem(STORAGE_KEYS.readings);
    const rawActive = localStorage.getItem(STORAGE_KEYS.activeProfileId);

    const parsedProfiles: LocalProfile[] = rawProfiles
      ? JSON.parse(rawProfiles)
      : seed.profiles;
    const parsedReadings: GlucoseReading[] = rawReadings
      ? JSON.parse(rawReadings)
      : seed.readings;

    const validProfiles = Array.isArray(parsedProfiles)
      ? parsedProfiles.slice(0, MAX_LOCAL_PROFILES)
      : seed.profiles;

    const activeId =
      rawActive && validProfiles.some((p) => p.id === rawActive)
        ? rawActive
        : (validProfiles[0]?.id ?? '');

    return {
      profiles: validProfiles,
      readings: Array.isArray(parsedReadings) ? parsedReadings : seed.readings,
      activeProfileId: activeId,
    };
  } catch {
    return {
      profiles: seed.profiles,
      readings: seed.readings,
      activeProfileId: seed.profiles[0].id,
    };
  }
}

export default function App() {
  const initial = useMemo(() => loadInitialState(), []);

  const [profiles, setProfiles] = useState<LocalProfile[]>(initial.profiles);
  const [readings, setReadings] = useState<GlucoseReading[]>(initial.readings);
  const [activeProfileId, setActiveProfileId] = useState<string>(
    initial.activeProfileId
  );
  const [activeSection, setActiveSection] = useState<AppSection>('prototype');
  const [pdfToast, setPdfToast] = useState<string | null>(null);

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.theme);
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem(STORAGE_KEYS.theme, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage errors
    }
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(profiles));
      localStorage.setItem(STORAGE_KEYS.readings, JSON.stringify(readings));
      localStorage.setItem(STORAGE_KEYS.activeProfileId, activeProfileId);
    } catch {
      // Ignore storage quota errors
    }
  }, [profiles, readings, activeProfileId]);

  const activeProfile: LocalProfile | null =
    profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;

  const handleCreateProfile = (name: string, unit: GlucoseUnit) => {
    if (profiles.length >= MAX_LOCAL_PROFILES) return;
    const newProfile: LocalProfile = {
      id: `prof_${Date.now()}`,
      name,
      unitPreference: unit,
      targetMinMgDl: 70,
      targetMaxMgDl: 140,
      accentHex: PROFILE_COLORS[profiles.length % PROFILE_COLORS.length],
      createdAt: Date.now(),
    };
    setProfiles((prev) => [...prev, newProfile]);
    setActiveProfileId(newProfile.id);
  };

  const handleDeleteProfile = (id: string) => {
    const remaining = profiles.filter((p) => p.id !== id);
    setProfiles(remaining);
    setReadings((prev) => prev.filter((r) => r.profileId !== id));
    if (activeProfileId === id) {
      setActiveProfileId(remaining[0]?.id ?? '');
    }
  };

  const handleChangeProfileUnit = (id: string, unit: GlucoseUnit) => {
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, unitPreference: unit } : p))
    );
  };

  const handleAddReading = (reading: Omit<GlucoseReading, 'id'>) => {
    const created: GlucoseReading = {
      ...reading,
      id: `rd_${Date.now()}`,
    };
    setReadings((prev) => [created, ...prev]);
  };

  const handleAddBatchReadings = (newItems: GlucoseReading[]) => {
    setReadings((prev) => [...newItems, ...prev]);
  };

  const handleDeleteReading = (id: string) => {
    setReadings((prev) => prev.filter((r) => r.id !== id));
  };

  const handleResetDemo = () => {
    const seed = createSeedData();
    setProfiles(seed.profiles);
    setReadings(seed.readings);
    setActiveProfileId(seed.profiles[0].id);
  };

  const handleExportPdf = (
    readingsToExport?: GlucoseReading[],
    rangeLabel = 'Historial completo'
  ) => {
    if (!activeProfile) return;
    const targetReadings =
      readingsToExport ??
      readings.filter((r) => r.profileId === activeProfile.id);
    const fileName = exportClinicalPdfReport(
      activeProfile,
      targetReadings,
      rangeLabel
    );
    setPdfToast(`Reporte clínico generado y descargado: ${fileName}`);
    window.setTimeout(() => setPdfToast(null), 4500);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-[#090D16]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveSection('prototype')}
            className="text-lg font-display font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            DbSas
          </button>

          {/* Zone 2: 5 single-line navigation links */}
          <nav
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400"
            aria-label="Navegación principal"
          >
            {(
              [
                { id: 'prototype', label: 'Prototipo' },
                { id: 'isar', label: 'Esquema Isar' },
                { id: 'wireframes', label: 'Wireframes' },
                { id: 'ble', label: 'Lógica BLE' },
                { id: 'architecture', label: 'Arquitectura' },
              ] as const
            ).map((navItem) => {
              const active = activeSection === navItem.id;
              return (
                <button
                  key={navItem.id}
                  type="button"
                  onClick={() => setActiveSection(navItem.id)}
                  className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                    active
                      ? 'text-slate-900 dark:text-white border-blue-600 dark:border-blue-400 font-semibold'
                      : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {navItem.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => handleExportPdf()}
              disabled={!activeProfile}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar PDF</span>
            </button>
          </div>
        </div>

        {/* Mobile compact nav row */}
        <nav
          className="md:hidden px-4 pb-2.5 flex items-center gap-4 overflow-x-auto text-xs font-medium text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/70 pt-2"
          aria-label="Navegación móvil de secciones"
        >
          {(
            [
              { id: 'prototype', label: 'Prototipo' },
              { id: 'isar', label: 'Esquema Isar' },
              { id: 'wireframes', label: 'Wireframes' },
              { id: 'ble', label: 'Lógica BLE' },
              { id: 'architecture', label: 'Arquitectura' },
            ] as const
          ).map((navItem) => {
            const active = activeSection === navItem.id;
            return (
              <button
                key={navItem.id}
                type="button"
                onClick={() => setActiveSection(navItem.id)}
                className={`whitespace-nowrap shrink-0 pb-1 border-b-2 ${
                  active
                    ? 'text-slate-900 dark:text-white border-blue-600 font-semibold'
                    : 'border-transparent'
                }`}
              >
                {navItem.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
            {activeSection === 'prototype'
              ? 'DbSas · Control en tu dispositivo'
              : 'DbSas · Especificación de Ingeniería'}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            {activeSection === 'prototype'
              ? 'Seguimiento Glucémico Personal'
              : 'Blueprint técnico de ingeniería en Flutter, Isar Database y BLE'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {activeSection === 'prototype'
              ? 'Monitoreo diario, historial de tomas y reportes clínicos listos para tu consulta médica.'
              : 'Especificación lista para producción con esquemas Isar, flujo de pantallas, protocolo BLE filtrado para los 5 equipos certificados y arquitectura limpia.'}
          </p>
        </div>

        {activeSection === 'prototype' ? (
          <PrototypeWorkspace
            profiles={profiles}
            activeProfile={activeProfile}
            readings={readings}
            isDark={isDark}
            onToggleTheme={() => setIsDark((d) => !d)}
            onSelectProfile={setActiveProfileId}
            onCreateProfile={handleCreateProfile}
            onDeleteProfile={handleDeleteProfile}
            onChangeProfileUnit={handleChangeProfileUnit}
            onAddReading={handleAddReading}
            onAddBatchReadings={handleAddBatchReadings}
            onDeleteReading={handleDeleteReading}
            onResetDemo={handleResetDemo}
            pdfToast={pdfToast}
            onExportPdf={(subset, label) => handleExportPdf(subset, label)}
          />
        ) : (
          <FlutterBlueprintView
            activeSection={activeSection}
            onSelectSection={setActiveSection}
            isDark={isDark}
            onToggleTheme={() => setIsDark((d) => !d)}
          />
        )}
      </main>
    </div>
  );
}
