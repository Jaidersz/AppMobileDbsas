import React, { useState } from 'react';
import {
  Activity,
  Bluetooth,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  History,
  Users,
  X,
} from 'lucide-react';
import { PatientTab } from '../types/glucose';

interface GuidedOnboardingProps {
  isOpen: boolean;
  onClose: () => void;
  onJumpToAction: (action: PatientTab | 'measure') => void;
}

const GUIDE_STEPS: {
  title: string;
  description: string;
  actionLabel: string;
  target: PatientTab | 'measure';
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    title: '1. Crea tu perfil personal',
    description:
      'Solo escribe tu nombre y elige tu unidad de medida. Hasta 3 personas pueden usar la aplicación en el mismo teléfono con sus datos separados.',
    actionLabel: 'Ir a perfiles',
    target: 'profiles',
    icon: Users,
  },
  {
    title: '2. Registra tu medición',
    description:
      'Toca "Nueva medición" para anotar tu valor de glucosa de forma manual o recibirlo si tienes un glucómetro Bluetooth compatible conectado.',
    actionLabel: 'Registrar medición',
    target: 'measure',
    icon: Activity,
  },
  {
    title: '3. Conecta un glucómetro',
    description:
      'Busca glucómetros cercanos compatibles en la sección Glucómetro. La aplicación mostrará el nombre del equipo y el estado real de compatibilidad.',
    actionLabel: 'Ver glucómetros',
    target: 'devices',
    icon: Bluetooth,
  },
  {
    title: '4. Consulta tu historial y reportes',
    description:
      'Revisa tus mediciones por fecha, mira tus gráficos de tendencia y genera un reporte en PDF para compartir con tu médico.',
    actionLabel: 'Abrir historial',
    target: 'history',
    icon: History,
  },
];

export const GuidedOnboarding: React.FC<GuidedOnboardingProps> = ({
  isOpen,
  onClose,
  onJumpToAction,
}) => {
  const [stepIndex, setStepIndex] = useState(0);

  if (!isOpen) return null;

  const current = GUIDE_STEPS[stepIndex];
  const Icon = current.icon;
  const isLast = stepIndex === GUIDE_STEPS.length - 1;

  return (
    <div
      className="rounded-3xl bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-900/70 p-6 sm:p-7 space-y-5 shadow-sm"
      role="region"
      aria-label="Guía rápida de bienvenida"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
              Guía inicial · Paso {stepIndex + 1} de {GUIDE_STEPS.length}
            </p>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              {current.title}
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Cerrar guía rápida"
          title="Cerrar guía"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
        {current.description}
      </p>

      <div className="flex items-center gap-2" aria-hidden="true">
        {GUIDE_STEPS.map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setStepIndex(idx)}
            className={`h-2 rounded-full transition-all ${
              idx === stepIndex
                ? 'w-8 bg-teal-600 dark:bg-teal-400'
                : 'w-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300'
            }`}
            tabIndex={-1}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onJumpToAction(current.target)}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors"
          >
            {current.actionLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            Omitir guía
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Anterior</span>
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>¡Listo, empezar!</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.min(GUIDE_STEPS.length - 1, i + 1))}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-1"
            >
              <span>Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
