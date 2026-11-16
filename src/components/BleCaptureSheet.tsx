import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  CheckCircle2,
  Clock,
  Database,
  Layers,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  BIOMEDICAL_DEVICES,
  DEVICE_BY_ID,
  MEASUREMENT_CONTEXTS,
  QUICK_TAGS,
  buildSimulatedDeviceMemoryBuffer,
} from '../data/devicesAndSeeds';
import {
  BiomedicalDeviceId,
  BiomedicalDeviceSpec,
  GlucoseReading,
  GlucoseUnit,
  MeasurementContext,
} from '../types/glucose';
import {
  deduplicateIncomingReadings,
  evaluateReadingSeverity,
  formatGlucoseValue,
  formatShortDateTime,
} from '../utils/glucoseMath';

interface BleCaptureSheetProps {
  isOpen: boolean;
  onClose: () => void;
  profileId: string;
  profileName: string;
  unit: GlucoseUnit;
  connectedDeviceId: BiomedicalDeviceId | null;
  onConnectedDeviceChange: (deviceId: BiomedicalDeviceId | null) => void;
  existingReadings: GlucoseReading[];
  onSaveSingleReading: (reading: Omit<GlucoseReading, 'id'>) => void;
  onSaveBatchReadings: (readings: GlucoseReading[]) => void;
}

type BleStep =
  | 'scanning'
  | 'device_ready'
  | 'processing_sample'
  | 'multisample_prompt'
  | 'syncing_memory'
  | 'sync_summary'
  | 'context_form';

export const BleCaptureSheet: React.FC<BleCaptureSheetProps> = ({
  isOpen,
  onClose,
  profileId,
  profileName,
  unit,
  connectedDeviceId,
  onConnectedDeviceChange,
  existingReadings,
  onSaveSingleReading,
  onSaveBatchReadings,
}) => {
  const [step, setStep] = useState<BleStep>('scanning');
  const [scanFilterReady, setScanFilterReady] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<BiomedicalDeviceSpec | null>(null);
  const [webBleNotice, setWebBleNotice] = useState<string | null>(null);
  const [isPhysicalBleListening, setIsPhysicalBleListening] = useState(false);

  // Processing timer state (5s or 8s faithful to hardware)
  const [elapsedMs, setElapsedMs] = useState(0);
  const [totalWaitMs, setTotalWaitMs] = useState(5000);
  const timerRef = useRef<number | null>(null);

  // Captured value(s)
  const [capturedMgDl, setCapturedMgDl] = useState<number>(114);
  const [firstSampleMgDl, setFirstSampleMgDl] = useState<number | null>(null);
  const [multiSamples, setMultiSamples] = useState<[number, number] | undefined>(undefined);

  // Batch memory sync state
  const [syncResult, setSyncResult] = useState<{
    uniqueReadings: GlucoseReading[];
    skippedDuplicates: number;
  } | null>(null);

  // Context form state
  const [context, setContext] = useState<MeasurementContext>('fasting');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (connectedDeviceId && DEVICE_BY_ID[connectedDeviceId]) {
      setSelectedDevice(DEVICE_BY_ID[connectedDeviceId]);
      setStep('device_ready');
    } else {
      setSelectedDevice(null);
      setStep('scanning');
    }
    setScanFilterReady(false);
    setWebBleNotice(null);
    setIsPhysicalBleListening(false);
    setFirstSampleMgDl(null);
    setMultiSamples(undefined);
    setSyncResult(null);
    setSelectedTags([]);
    setNote('');

    const scanTimer = window.setTimeout(() => {
      setScanFilterReady(true);
    }, 650);

    return () => {
      window.clearTimeout(scanTimer);
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isOpen, connectedDeviceId]);

  if (!isOpen) return null;

  const startSampleCapture = (device: BiomedicalDeviceSpec, isSecondSample = false) => {
    const durationMs = device.readTimeSeconds * 1000;
    setTotalWaitMs(durationMs);
    setElapsedMs(0);
    setStep('processing_sample');

    const startTime = Date.now();
    if (timerRef.current) window.clearInterval(timerRef.current);

    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= durationMs) {
        if (timerRef.current) window.clearInterval(timerRef.current);
        setElapsedMs(durationMs);

        // Realistic glycemic sample value
        const simulatedReading = Math.floor(82 + Math.random() * 98);

        if (device.supportsMultiSample && !isSecondSample) {
          setFirstSampleMgDl(simulatedReading);
          setCapturedMgDl(simulatedReading);
          setStep('multisample_prompt');
        } else if (device.supportsMultiSample && isSecondSample && firstSampleMgDl !== null) {
          const avg = Math.round((firstSampleMgDl + simulatedReading) / 2);
          setMultiSamples([firstSampleMgDl, simulatedReading]);
          setCapturedMgDl(avg);
          setStep('context_form');
        } else {
          setMultiSamples(undefined);
          setCapturedMgDl(simulatedReading);
          setStep('context_form');
        }
      } else {
        setElapsedMs(elapsed);
      }
    }, 50);
  };

  const handleBatchMemorySync = (device: BiomedicalDeviceSpec) => {
    setStep('syncing_memory');
    window.setTimeout(() => {
      const rawBuffer = buildSimulatedDeviceMemoryBuffer(
        device.id,
        existingReadings,
        profileId
      );
      const result = deduplicateIncomingReadings(existingReadings, rawBuffer);
      setSyncResult(result);
      setStep('sync_summary');
    }, 1100);
  };

  const parseSfloatGlucoseMgDl = (dataView: DataView): number | null => {
    // Bluetooth SIG Glucose Measurement (0x2A18) concentration starts after flags (1B), seq (2B), base time (7B) + optional time offset (2B)
    if (dataView.byteLength < 14) return null;
    const flags = dataView.getUint8(0);
    const hasTimeOffset = (flags & 0x01) !== 0;
    const offset = hasTimeOffset ? 12 : 10;
    if (dataView.byteLength < offset + 2) return null;

    const raw = dataView.getUint16(offset, true);
    const mantissaRaw = raw & 0x0fff;
    const mantissa = mantissaRaw >= 0x0800 ? mantissaRaw - 0x1000 : mantissaRaw;
    const expRaw = (raw >> 12) & 0x0f;
    const exponent = expRaw >= 0x08 ? expRaw - 0x10 : expRaw;
    const value = mantissa * Math.pow(10, exponent);

    // Bit 2 of flags: 0 = kg/L (multiply by 100,000 for mg/dL), 1 = mol/L (multiply by 18,018.2 for mg/dL)
    const isMolPerL = (flags & 0x04) !== 0;
    const mgDl = isMolPerL ? value * 18018.2 : value * 100000;
    return Math.max(25, Math.min(600, Math.round(mgDl)));
  };

  const handleRealWebBluetooth = async () => {
    setWebBleNotice(null);
    const nav = navigator as Navigator & {
      bluetooth?: {
        requestDevice: (options: unknown) => Promise<{
          name?: string;
          gatt?: {
            connect: () => Promise<{
              getPrimaryService: (uuid: number | string) => Promise<{
                getCharacteristic: (uuid: number | string) => Promise<{
                  startNotifications: () => Promise<unknown>;
                  addEventListener: (
                    type: string,
                    cb: (ev: { target: { value?: DataView } }) => void
                  ) => void;
                }>;
              }>;
            }>;
          };
        }>;
      };
    };

    if (!nav.bluetooth) {
      setWebBleNotice(
        'Web Bluetooth no está disponible en este navegador o entorno sandbox. Selecciona cualquiera de los 5 dispositivos de Diagnósticos Biomédicos arriba para emparejarlo.'
      );
      return;
    }

    try {
      const device = await nav.bluetooth.requestDevice({
        filters: [
          { services: [0x1808] },
          { namePrefix: 'Match' },
          { namePrefix: 'Gluco' },
          { namePrefix: 'OKMeter' },
        ],
        optionalServices: [0x1808, 0x180a],
      });

      const matched =
        BIOMEDICAL_DEVICES.find((d) =>
          device.name?.toLowerCase().includes(d.advertisedName.toLowerCase())
        ) ?? DEVICE_BY_ID.OKMeter_Match_II;

      setSelectedDevice(matched);
      onConnectedDeviceChange(matched.id);
      setStep('device_ready');

      if (device.gatt) {
        try {
          const server = await device.gatt.connect();
          const glucoseService = await server.getPrimaryService(0x1808);
          const measurementChar = await glucoseService.getCharacteristic(0x2a18);
          await measurementChar.startNotifications();
          setIsPhysicalBleListening(true);

          measurementChar.addEventListener('characteristicvaluechanged', (event) => {
            const view = event.target?.value;
            if (!view) return;
            const mgDl = parseSfloatGlucoseMgDl(view);
            if (mgDl !== null) {
              setCapturedMgDl(mgDl);
              setMultiSamples(undefined);
              setStep('context_form');
            }
          });
        } catch {
          setWebBleNotice(
            `Conectado a ${device.name || matched.displayName}. Si tu equipo no transmite GATT automático en reposo, inicia una lectura desde los botones inferiores.`
          );
        }
      }
    } catch {
      setWebBleNotice(
        'Emparejamiento Web Bluetooth cancelado o sin equipo físico cercano. Puedes conectar cualquiera de los 5 modelos de Diagnósticos Biomédicos arriba.'
      );
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleConfirmSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;
    onSaveSingleReading({
      profileId,
      valueMgDl: capturedMgDl,
      timestamp: Date.now(),
      context,
      quickTags: selectedTags,
      note: note.trim(),
      deviceInfo: selectedDevice.id,
      source: 'ble',
      multiSampleValuesMgDl: multiSamples,
    });
    onClose();
  };

  const handleConfirmBatchSync = () => {
    if (!syncResult) return;
    if (syncResult.uniqueReadings.length > 0) {
      onSaveBatchReadings(syncResult.uniqueReadings);
    }
    onClose();
  };

  const remainingSeconds = Math.max(0, (totalWaitMs - elapsedMs) / 1000).toFixed(1);
  const progressPercent = Math.min(100, (elapsedMs / Math.max(1, totalWaitMs)) * 100);
  const evaluation = evaluateReadingSeverity(capturedMgDl, context);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Captura Bluetooth con Diagnósticos Biomédicos"
    >
      <div className="w-full sm:max-w-xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Grab handle on mobile */}
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Bluetooth className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white truncate">
                Captura BLE · Diagnósticos Biomédicos
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Perfil activo: {profileName} · Filtro GATT 0x1808
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Cerrar panel Bluetooth"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {step === 'scanning' && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Escaneo filtrado por familia Diagnósticos Biomédicos</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Ignora dispositivos ajenos y filtra únicamente los 5 modelos certificados mediante sus nombres anunciados y UUID de servicio glucémico.
                  </p>
                </div>
              </div>

              {!scanFilterReady ? (
                <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
                  <RefreshCw className="w-7 h-7 text-blue-600 dark:text-blue-400 animate-spin" />
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    Buscando glucómetros compatibles cercanos...
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {BIOMEDICAL_DEVICES.map((device) => (
                    <button
                      key={device.id}
                      type="button"
                      onClick={() => {
                        setSelectedDevice(device);
                        onConnectedDeviceChange(device.id);
                        setStep('device_ready');
                      }}
                      className="w-full text-left p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-slate-900 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {device.displayName}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                            {device.advertisedName}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {device.summary}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                          {device.supportsMultiSample ? 'Multimuestra' : `${device.readTimeSeconds}s`}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={handleRealWebBluetooth}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                  <Bluetooth className="w-4 h-4" />
                  <span>Intentar conexión con equipo físico (Web Bluetooth)</span>
                </button>
                {webBleNotice && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl px-3.5 py-2.5">
                    {webBleNotice}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 'device_ready' && selectedDevice && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    Conectado a: {selectedDevice.displayName}
                  </span>
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    {isPhysicalBleListening
                      ? 'Escuchando GATT físico'
                      : 'Bluetooth emparejado'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Las mediciones que realices en <strong>{selectedDevice.displayName}</strong> se transferirán por Bluetooth y quedarán registradas en <strong>{profileName}</strong> con el identificador <code className="font-mono text-slate-800 dark:text-slate-200">{selectedDevice.id}</code>.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => startSampleCapture(selectedDevice, false)}
                  className="p-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-left space-y-2 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <Activity className="w-5 h-5" />
                    <span className="text-xs font-mono tabular-nums opacity-90">
                      {selectedDevice.readTimeSeconds}s reales
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Recibir lectura en vivo</div>
                    <div className="text-xs text-blue-100 mt-0.5">
                      Inicia la medición ({selectedDevice.readTimeSeconds}s) y guarda el resultado en tu perfil
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleBatchMemorySync(selectedDevice)}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 dark:hover:border-blue-400 text-left space-y-2 transition-colors"
                >
                  <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                    <Database className="w-5 h-5" />
                    <span className="text-xs font-mono tabular-nums">
                      Cap. {selectedDevice.memoryCapacity}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      Sincronización Masiva
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Importa la memoria interna del equipo sin duplicados
                    </div>
                  </div>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep('scanning')}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  ← Cambiar a otro glucómetro
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onConnectedDeviceChange(null);
                    setSelectedDevice(null);
                    setStep('scanning');
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
                >
                  Desconectar equipo
                </button>
              </div>
            </div>
          )}

          {step === 'processing_sample' && selectedDevice && (
            <div className="py-8 space-y-6 text-center">
              <div className="mx-auto w-20 h-20 rounded-full border-4 border-blue-100 dark:border-blue-950 flex items-center justify-center relative">
                <Clock className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-pulse" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Procesando muestra en {selectedDevice.displayName}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Latencia calibrada del fabricante: {selectedDevice.readTimeSeconds} segundos exactos
                </p>
              </div>

              <div className="max-w-sm mx-auto space-y-2">
                <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 dark:bg-blue-500 transition-[width] duration-75"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <span>Lectura GATT 0x2A18</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {remainingSeconds}s restantes
                  </span>
                </div>
              </div>
            </div>
          )}

          {step === 'multisample_prompt' && selectedDevice && firstSampleMgDl !== null && (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400">
                  <Layers className="w-4 h-4" />
                  <span>GlucoLeader Enhance · Modo Multimuestra</span>
                </div>
                <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {formatGlucoseValue(firstSampleMgDl, unit)}{' '}
                  <span className="text-sm font-normal text-slate-500">{unit}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Primera muestra capturada. Puedes registrar una segunda tira de verificación para promediar o continuar directamente al contexto.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => startSampleCapture(selectedDevice, true)}
                  className="min-h-[44px] px-4 py-3 rounded-xl border border-blue-600 text-blue-700 dark:text-blue-400 font-medium text-sm hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                >
                  Tomar 2.ª muestra ({selectedDevice.readTimeSeconds}s)
                </button>
                <button
                  type="button"
                  onClick={() => setStep('context_form')}
                  className="min-h-[44px] px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
                >
                  Usar esta muestra
                </button>
              </div>
            </div>
          )}

          {step === 'syncing_memory' && selectedDevice && (
            <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Ejecutando Sincronización Masiva (RACP 0x2A52)
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Consultando memoria interna de {selectedDevice.displayName} y cruzando marcas de tiempo...
                </p>
              </div>
            </div>
          )}

          {step === 'sync_summary' && selectedDevice && syncResult && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    Resultado del cruce por Timestamp
                  </span>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    {selectedDevice.id}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {syncResult.uniqueReadings.length} registros nuevos listos para guardar
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">
                    {syncResult.skippedDuplicates} duplicados omitidos automáticamente
                  </span>
                </div>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {syncResult.uniqueReadings.map((item) => {
                  const ev = evaluateReadingSeverity(item.valueMgDl, item.context);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
                          {formatGlucoseValue(item.valueMgDl, unit)} {unit}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {formatShortDateTime(item.timestamp)}
                        </div>
                      </div>
                      <span
                        className={`font-medium ${
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
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleConfirmBatchSync}
                className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
              >
                Guardar {syncResult.uniqueReadings.length} lecturas en base local
              </button>
            </div>
          )}

          {step === 'context_form' && selectedDevice && (
            <form onSubmit={handleConfirmSave} className="space-y-5">
              {/* Captured Reading Banner */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Lectura recibida · {selectedDevice.displayName}
                  </div>
                  <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {formatGlucoseValue(capturedMgDl, unit)}{' '}
                    <span className="text-sm font-normal text-slate-500">{unit}</span>
                  </div>
                  {multiSamples && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                      Promedio multimuestra ({formatGlucoseValue(multiSamples[0], unit)} +{' '}
                      {formatGlucoseValue(multiSamples[1], unit)})
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                      evaluation.severity === 'normal'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : evaluation.severity === 'caution'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {evaluation.severity === 'normal' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <AlertTriangle className="w-4 h-4" />
                    )}
                    <span>{evaluation.label}</span>
                  </div>
                </div>
              </div>

              {/* Mandatory Context Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-900 dark:text-white">
                  ¿En qué momento se tomó esta medición?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {MEASUREMENT_CONTEXTS.map((ctx) => {
                    const active = context === ctx.id;
                    return (
                      <button
                        key={ctx.id}
                        type="button"
                        onClick={() => setContext(ctx.id)}
                        className={`min-h-[44px] px-3.5 py-2.5 rounded-xl border text-left transition-colors ${
                          active
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200'
                            : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="text-xs font-semibold">{ctx.label}</div>
                        <div className="text-[11px] opacity-75">{ctx.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Tags */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-900 dark:text-white">
                  Etiquetas rápidas (opcional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TAGS.map((tag) => {
                    const active = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          active
                            ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Note */}
              <div className="space-y-1.5">
                <label
                  htmlFor="ble-note"
                  className="block text-sm font-semibold text-slate-900 dark:text-white"
                >
                  Nota clínica breve (opcional)
                </label>
                <input
                  id="ble-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ej. Caminata 30 min antes de cenar..."
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors"
              >
                Guardar medición en {profileName}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
