import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { PrototypeWorkspace } from './components/PrototypeWorkspace';
import { MAX_LOCAL_PROFILES, PROFILE_COLORS } from './data/devicesAndSeeds';
import {
  EmergencyContact,
  GlucoseReading,
  GlucoseUnit,
  LocalProfile,
  PatientTab,
  TextScaleMode,
} from './types/glucose';
import {
  PREFS_KEYS,
  initializeOrMigrateLocalDb,
  readInitialOnboardingDone,
  readInitialTextScale,
  saveLocalDb,
} from './utils/localDb';
import { exportClinicalPdfReport } from './utils/pdfReport';

const PATIENT_NAV_ITEMS: { id: PatientTab; label: string }[] = [
  { id: 'home', label: 'Inicio' },
  { id: 'history', label: 'Historial' },
  { id: 'devices', label: 'Glucómetro' },
  { id: 'emergency', label: 'Emergencia' },
  { id: 'profiles', label: 'Perfiles' },
];

export default function App() {
  const initial = useMemo(() => initializeOrMigrateLocalDb(localStorage), []);

  const [profiles, setProfiles] = useState<LocalProfile[]>(initial.profiles);
  const [readings, setReadings] = useState<GlucoseReading[]>(initial.readings);
  const [activeProfileId, setActiveProfileId] = useState<string>(
    initial.activeProfileId
  );
  const [activeSection, setActiveSection] = useState<PatientTab>('home');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const [showGuide, setShowGuide] = useState<boolean>(() => {
    try {
      return !readInitialOnboardingDone(localStorage);
    } catch {
      return true;
    }
  });

  const [textScale, setTextScale] = useState<TextScaleMode>(() => {
    try {
      return readInitialTextScale(localStorage);
    } catch {
      return 'normal';
    }
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved =
        localStorage.getItem(PREFS_KEYS.theme) ??
        localStorage.getItem('glucopulse_theme_v1');
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
      localStorage.setItem(PREFS_KEYS.theme, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage errors
    }
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEYS.textScale, textScale);
    } catch {
      // Ignore storage errors
    }
  }, [textScale]);

  useEffect(() => {
    try {
      saveLocalDb(localStorage, {
        schemaVersion: 2,
        profiles,
        readings,
        activeProfileId,
      });
    } catch {
      // Ignore storage quota errors
    }
  }, [profiles, readings, activeProfileId]);

  const notify = (message: string) => {
    setActionFeedback(message);
    window.setTimeout(() => {
      setActionFeedback((curr) => (curr === message ? null : curr));
    }, 4500);
  };

  const activeProfile: LocalProfile | null =
    profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;

  const handleCloseGuide = () => {
    setShowGuide(false);
    try {
      localStorage.setItem(PREFS_KEYS.onboardingDone, 'true');
    } catch {
      // Ignore storage errors
    }
  };

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

  const handleUpdateProfile = (
    id: string,
    updates: {
      name: string;
      unitPreference: GlucoseUnit;
      targetMinMgDl: number;
      targetMaxMgDl: number;
    }
  ) => {
    setProfiles((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
      )
    );
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
      prev.map((p) =>
        p.id === id ? { ...p, unitPreference: unit, updatedAt: Date.now() } : p
      )
    );
  };

  const handleUpdateEmergencyContact = (
    profileId: string,
    contact: EmergencyContact
  ) => {
    setProfiles((prev) =>
      prev.map((p) =>
        p.id === profileId ? { ...p, emergencyContact: contact } : p
      )
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

  const handleExportPdf = async (
    readingsToExport?: GlucoseReading[],
    rangeLabel = 'Historial completo',
    shareIfAvailable = false
  ) => {
    if (!activeProfile) return;
    const targetReadings =
      readingsToExport ??
      readings.filter((r) => r.profileId === activeProfile.id);
    const result = await exportClinicalPdfReport(
      activeProfile,
      targetReadings,
      rangeLabel,
      shareIfAvailable
    );
    notify(
      result.sharedViaSystem
        ? `Reporte compartido (${result.fileName}).`
        : `Tu reporte en PDF está listo (${result.fileName}).`
    );
  };

  return (
    <div className="min-h-screen bg-[#F6F8F7] dark:bg-[#0B111A] text-slate-900 dark:text-slate-100 transition-colors flex flex-col">
      {/* Clean, Friendly 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#0B111A]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveSection('home')}
            className="text-xl font-display font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            Glucosoft App
          </button>

          <nav
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400"
            aria-label="Navegación principal"
          >
            {PATIENT_NAV_ITEMS.map((navItem) => {
              const active = activeSection === navItem.id;
              return (
                <button
                  key={navItem.id}
                  type="button"
                  onClick={() => setActiveSection(navItem.id)}
                  className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                    active
                      ? 'text-teal-800 dark:text-teal-300 border-teal-700 dark:border-teal-400 font-semibold'
                      : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {navItem.label}
                </button>
              );
            })}
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => handleExportPdf()}
              disabled={!activeProfile}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Reporte PDF</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-7 space-y-6 flex-1">
        <div className="max-w-2xl space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            {activeProfile
              ? `Hola, ${activeProfile.name}`
              : 'Bienvenido a Glucosoft App'}
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            Tu control diario de glucosa, claro, privado y siempre disponible sin internet.
          </p>
        </div>

        <PrototypeWorkspace
          profiles={profiles}
          activeProfile={activeProfile}
          readings={readings}
          activeTab={activeSection}
          onSelectTab={setActiveSection}
          isDark={isDark}
          onToggleTheme={() => setIsDark((d) => !d)}
          textScale={textScale}
          onToggleTextScale={() =>
            setTextScale((s) => (s === 'normal' ? 'large' : 'normal'))
          }
          showGuide={showGuide}
          onOpenGuide={() => setShowGuide(true)}
          onCloseGuide={handleCloseGuide}
          onSelectProfile={setActiveProfileId}
          onCreateProfile={handleCreateProfile}
          onUpdateProfile={handleUpdateProfile}
          onDeleteProfile={handleDeleteProfile}
          onChangeProfileUnit={handleChangeProfileUnit}
          onUpdateEmergencyContact={handleUpdateEmergencyContact}
          onAddReading={handleAddReading}
          onAddBatchReadings={handleAddBatchReadings}
          onDeleteReading={handleDeleteReading}
          actionFeedback={actionFeedback}
          onNotify={notify}
          onExportPdf={(subset, label, share) =>
            handleExportPdf(subset, label, share)
          }
        />
      </main>

      <footer className="border-t border-slate-200/70 dark:border-slate-800/80 py-5 px-4 sm:px-6 mt-8">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Glucosoft App · Tus datos se guardan únicamente de forma privada en este dispositivo.
          </span>
          <span>
            Información orientativa; no sustituye evaluación médica profesional.
          </span>
        </div>
      </footer>
    </div>
  );
}
