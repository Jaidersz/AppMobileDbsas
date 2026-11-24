import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Bluetooth,
  CheckCircle2,
  FilePlus2,
  Info,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  BIOMEDICAL_DEVICES,
  MEASUREMENT_CONTEXTS,
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
  formatGlucoseValue,
  formatShortDateTime,
} from '../utils/glucoseMath';

export interface ConnectedMeterSession {
  deviceName: string;
  matchedModelId: BiomedicalDeviceId;
  matchedModelName: string;
  supportsStandardGlucose: boolean;
  supportsMemorySync: boolean;
  discoveredServiceCount: number;
  connectionMessage: string;
}

interface BleCaptureSheetProps {
  isOpen: boolean;
  onClose: () => void;
  profileId: string;
  profileName: string;
  unit: GlucoseUnit;
  connectedSession: ConnectedMeterSession | null;
  onSessionChange: (session: ConnectedMeterSession | null) => void;
  existingReadings: GlucoseReading[];
  onSaveIncomingReading: (reading: Omit<GlucoseReading, 'id'>) => void;
  onSaveBatchReadings: (readings: GlucoseReading[]) => void;
  onOpenManualEntry: () => void;
}

interface WebBtCharacteristic {
  uuid: string;
  startNotifications: () => Promise<unknown>;
  writeValue?: (value: BufferSource) => Promise<void>;
  addEventListener: (
    type: string,
    cb: (ev: { target: { value?: DataView } }) => void
  ) => void;
}

interface WebBtService {
  uuid: string;
  getCharacteristic: (uuid: number | string) => Promise<WebBtCharacteristic>;
}

interface WebBtDevice {
  name?: string;
  gatt?: {
    connected: boolean;
    connect: () => Promise<{
      getPrimaryServices: () => Promise<WebBtService[]>;
      getPrimaryService: (uuid: number | string) => Promise<WebBtService>;
      disconnect: () => void;
    }>;
    disconnect: () => void;
  };
  addEventListener?: (type: string, cb: () => void) => void;
}

function matchKnownModel(advertisedName?: string): BiomedicalDeviceSpec | null {
  if (!advertisedName) return null;
  const lower = advertisedName.toLowerCase();
  for (const spec of BIOMEDICAL_DEVICES) {
    if (spec.advertisedNames.some((n) => lower.includes(n.toLowerCase()))) {
      return spec;
    }
  }
  return null;
}

/**
 * Decodifica lectura de glucosa según formato Bluetooth SIG estándar (0x2A18).
 */
export function parseStandardGlucoseMeasurement(dataView: DataView): {
  valueMgDl: number;
  timestampMs: number;
} | null {
  if (dataView.byteLength < 12) return null;
  const flags = dataView.getUint8(0);
  const hasTimeOffset = (flags & 0x01) !== 0;
  const hasConcentration = (flags & 0x02) !== 0;
  if (!hasConcentration) return null;

  // Base Time: year(2B), month(1B), day(1B), hour(1B), min(1B), sec(1B) starting at byte 3
  let timestampMs = Date.now();
  if (dataView.byteLength >= 10) {
    const year = dataView.getUint16(3, true);
    const month = dataView.getUint8(5);
    const day = dataView.getUint8(6);
    const hour = dataView.getUint8(7);
    const minute = dataView.getUint8(8);
    const second = dataView.getUint8(9);
    if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let timeOffsetMinutes = 0;
      if (hasTimeOffset && dataView.byteLength >= 12) {
        timeOffsetMinutes = dataView.getInt16(10, true);
      }
      const parsed = new Date(year, month - 1, day, hour, minute, second).getTime();
      if (!Number.isNaN(parsed)) {
        timestampMs = parsed + timeOffsetMinutes * 60 * 1000;
      }
    }
  }

  const concOffset = hasTimeOffset ? 12 : 10;
  if (dataView.byteLength < concOffset + 2) return null;

  const raw = dataView.getUint16(concOffset, true);
  const mantissaRaw = raw & 0x0fff;
  const mantissa = mantissaRaw >= 0x0800 ? mantissaRaw - 0x1000 : mantissaRaw;
  const expRaw = (raw >> 12) & 0x0f;
  const exponent = expRaw >= 0x08 ? expRaw - 0x10 : expRaw;
  const value = mantissa * Math.pow(10, exponent);

  const isMolPerL = (flags & 0x04) !== 0;
  const mgDl = isMolPerL ? value * 18018.2 : value * 100000;
  if (Number.isNaN(mgDl) || mgDl < 20 || mgDl > 650) return null;

  return {
    valueMgDl: Math.round(mgDl),
    timestampMs,
  };
}

export const BleCaptureSheet: React.FC<BleCaptureSheetProps> = ({
  isOpen,
  onClose,
  profileId,
  profileName,
  unit,
  connectedSession,
  onSessionChange,
  existingReadings,
  onSaveIncomingReading,
  onSaveBatchReadings,
  onOpenManualEntry,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [isSyncingMemory, setIsSyncingMemory] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [defaultContext, setDefaultContext] = useState<MeasurementContext>('fasting');
  const [showCompatibilityTable, setShowCompatibilityTable] = useState(false);
  const [lastReceivedInfo, setLastReceivedInfo] = useState<string | null>(null);

  const activeDeviceRef = useRef<WebBtDevice | null>(null);
  const racpCharRef = useRef<WebBtCharacteristic | null>(null);
  const memoryBufferRef = useRef<Omit<GlucoseReading, 'id'>[]>([]);

  if (!isOpen) return null;

  const handleDisconnect = () => {
    try {
      activeDeviceRef.current?.gatt?.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    activeDeviceRef.current = null;
    racpCharRef.current = null;
    onSessionChange(null);
    setStatusMessage('El glucómetro se desconectó correctamente.');
    setErrorMessage(null);
  };

  const handleRealBluetoothScan = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setLastReceivedInfo(null);

    const nav = navigator as Navigator & {
      bluetooth?: {
        requestDevice: (options: unknown) => Promise<WebBtDevice>;
      };
    };

    if (!nav.bluetooth) {
      setErrorMessage(
        'Este navegador no permite conectar dispositivos Bluetooth directamente. Para conectar un glucómetro físico usa la aplicación móvil instalada en Android o un navegador compatible, o registra tu medición manualmente.'
      );
      return;
    }

    setIsScanning(true);
    try {
      const device = await nav.bluetooth.requestDevice({
        filters: [
          { services: [0x1808] },
          { namePrefix: 'Match' },
          { namePrefix: 'Gluco' },
          { namePrefix: 'OKMeter' },
          { namePrefix: 'DB' },
        ],
        optionalServices: [0x1808, 0x180a, 0x180f],
      });

      const realName = device.name?.trim() || 'Glucómetro Bluetooth';
      const matchedSpec = matchKnownModel(realName);
      const modelDisplay = matchedSpec ? matchedSpec.displayName : realName;

      if (!device.gatt) {
        setErrorMessage(
          `Se encontró "${realName}", pero no permite conexión directa desde este dispositivo.`
        );
        setIsScanning(false);
        return;
      }

      const server = await device.gatt.connect();
      activeDeviceRef.current = device;
      device.addEventListener?.('gattserverdisconnected', () => {
        onSessionChange(null);
        racpCharRef.current = null;
        setStatusMessage(`Se perdió la conexión con ${realName}. Puedes volver a conectarlo.`);
      });

      let services: WebBtService[] = [];
      try {
        services = await server.getPrimaryServices();
      } catch {
        services = [];
      }

      let supportsStandardGlucose = false;
      let supportsMemorySync = false;

      try {
        const glucoseService = await server.getPrimaryService(0x1808);
        const measurementChar = await glucoseService.getCharacteristic(0x2a18);
        await measurementChar.startNotifications();
        supportsStandardGlucose = true;

        measurementChar.addEventListener('characteristicvaluechanged', (event) => {
          const view = event.target?.value;
          if (!view) return;
          const parsed = parseStandardGlucoseMeasurement(view);
          if (!parsed) return;

          const candidate: Omit<GlucoseReading, 'id'> = {
            profileId,
            valueMgDl: parsed.valueMgDl,
            originalUnit: unit,
            timestamp: parsed.timestampMs,
            context: defaultContext,
            quickTags: [],
            note: 'Recibido automáticamente desde el glucómetro',
            captureMethod: 'bluetooth',
            deviceModel: modelDisplay,
            deviceId: matchedSpec?.id ?? 'Otro_Compatible',
            deviceInfoSummary: `Bluetooth (${realName})`,
          };

          if (isSyncingMemory) {
            memoryBufferRef.current.push(candidate);
            return;
          }

          const { uniqueReadings } = deduplicateIncomingReadings(existingReadings, [
            candidate,
          ]);
          if (uniqueReadings.length > 0) {
            onSaveIncomingReading(candidate);
            setLastReceivedInfo(
              `${formatGlucoseValue(parsed.valueMgDl, unit)} ${unit} · ${formatShortDateTime(
                parsed.timestampMs
              )}`
            );
            setStatusMessage(
              `Medición recibida de ${modelDisplay} y guardada en ${profileName}.`
            );
          } else {
            setStatusMessage(
              `La lectura recibida de ${modelDisplay} ya estaba guardada en tu historial.`
            );
          }
        });

        try {
          const racpChar = await glucoseService.getCharacteristic(0x2a52);
          await racpChar.startNotifications();
          racpCharRef.current = racpChar;
          supportsMemorySync = true;
        } catch {
          racpCharRef.current = null;
          supportsMemorySync = false;
        }
      } catch {
        supportsStandardGlucose = false;
      }

      if (!supportsStandardGlucose) {
        onSessionChange({
          deviceName: realName,
          matchedModelId: matchedSpec?.id ?? 'Otro_Compatible',
          matchedModelName: modelDisplay,
          supportsStandardGlucose: false,
          supportsMemorySync: false,
          discoveredServiceCount: services.length,
          connectionMessage:
            'El equipo se conectó, pero utiliza un formato propio del fabricante que requiere validación física antes de leer resultados automáticamente.',
        });
        setErrorMessage(
          `Conectado a "${realName}", pero no usa el formato estándar de transmisión de glucosa. Este modelo requiere validación física con su protocolo propio o registro manual.`
        );
      } else {
        onSessionChange({
          deviceName: realName,
          matchedModelId: matchedSpec?.id ?? 'Otro_Compatible',
          matchedModelName: modelDisplay,
          supportsStandardGlucose: true,
          supportsMemorySync,
          discoveredServiceCount: services.length,
          connectionMessage: supportsMemorySync
            ? 'Conectado y listo para recibir mediciones nuevas y leer memoria del equipo.'
            : 'Conectado y listo para recibir mediciones en vivo.',
        });
        setStatusMessage(
          `Conectado a ${modelDisplay}. Cuando tomes una medición, se guardará en el perfil de ${profileName}.`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('cancel')) {
        setStatusMessage('Búsqueda cancelada.');
      } else {
        setErrorMessage(
          'No se pudo conectar con ningún glucómetro compatible. Verifica que esté encendido, en modo de emparejamiento y cerca del teléfono.'
        );
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleRequestMemorySync = async () => {
    if (!racpCharRef.current || !racpCharRef.current.writeValue || !connectedSession) {
      setErrorMessage(
        'Este glucómetro no confirmó soporte para descarga masiva de memoria en esta sesión.'
      );
      return;
    }

    setErrorMessage(null);
    setStatusMessage('Solicitando mediciones guardadas en la memoria del glucómetro...');
    setIsSyncingMemory(true);
    memoryBufferRef.current = [];

    try {
      // Standard Record Access Control Point command: Report All Stored Records [0x01, 0x01]
      await racpCharRef.current.writeValue(new Uint8Array([0x01, 0x01]));
      window.setTimeout(() => {
        const collected = memoryBufferRef.current;
        const { uniqueReadings, skippedDuplicates } = deduplicateIncomingReadings(
          existingReadings,
          collected
        );
        if (uniqueReadings.length > 0) {
          onSaveBatchReadings(uniqueReadings);
        }
        setIsSyncingMemory(false);
        setStatusMessage(
          collected.length === 0
            ? 'El glucómetro no envió nuevas lecturas desde su memoria.'
            : `Sincronización completada: ${uniqueReadings.length} nuevas guardadas y ${skippedDuplicates} ya existentes omitidas.`
        );
      }, 3000);
    } catch {
      setIsSyncingMemory(false);
      setErrorMessage(
        'El glucómetro no permitió leer su memoria interna en este momento.'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Conexión Bluetooth con glucómetro"
    >
      <div className="w-full sm:max-w-xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
              <Bluetooth className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                Conexión con tu glucómetro
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
                Perfil activo: {profileName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {connectedSession ? (
            <div className="p-5 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                  <CheckCircle2 className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0" />
                  <span>Conectado a {connectedSession.matchedModelName}</span>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Nombre del equipo: <strong>{connectedSession.deviceName}</strong>.{' '}
                {connectedSession.connectionMessage}
              </p>

              <div className="space-y-1.5 pt-1">
                <label
                  htmlFor="bt-default-context"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Momento predeterminado para lecturas recibidas
                </label>
                <select
                  id="bt-default-context"
                  value={defaultContext}
                  onChange={(e) => setDefaultContext(e.target.value as MeasurementContext)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
                >
                  {MEASUREMENT_CONTEXTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                {connectedSession.supportsMemorySync && (
                  <button
                    type="button"
                    onClick={handleRequestMemorySync}
                    disabled={isSyncingMemory}
                    className="min-h-[46px] px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                  >
                    {isSyncingMemory ? 'Leyendo memoria...' : 'Traer tomas guardadas'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Desconectar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                  <span>Búsqueda real de equipos Bluetooth</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Enciende el Bluetooth de tu glucómetro y pulsa buscar. Solo se guardarán lecturas reales recibidas desde un equipo físico compatible.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRealBluetoothScan}
                disabled={isScanning}
                className="w-full min-h-[54px] px-5 py-3 rounded-2xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-base font-semibold transition-colors flex items-center justify-center gap-2.5"
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Buscando glucómetros cercanos...</span>
                  </>
                ) : (
                  <>
                    <Bluetooth className="w-5 h-5" />
                    <span>Buscar glucómetro cercano</span>
                  </>
                )}
              </button>
            </div>
          )}

          {statusMessage && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-sm text-emerald-900 dark:text-emerald-200 space-y-1">
              <p className="font-medium">{statusMessage}</p>
              {lastReceivedInfo && (
                <p className="font-mono font-bold text-base">{lastReceivedInfo}</p>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
              <p className="leading-relaxed">{errorMessage}</p>
            </div>
          )}

          {/* Honest Hardware Compatibility Diagnostic */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <button
              type="button"
              onClick={() => setShowCompatibilityTable((v) => !v)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl text-left text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <Info className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <span>Estado de validación de los 5 modelos</span>
              </span>
              <span className="text-xs text-teal-700 dark:text-teal-400">
                {showCompatibilityTable ? 'Ocultar' : 'Ver detalle'}
              </span>
            </button>

            {showCompatibilityTable && (
              <div className="space-y-2.5">
                {BIOMEDICAL_DEVICES.map((dev) => (
                  <div
                    key={dev.id}
                    className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {dev.displayName}
                      </span>
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        Requiere prueba física
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {dev.protocolNotes}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenManualEntry();
            }}
            className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
          >
            <FilePlus2 className="w-4 h-4" />
            <span>Anotar medición manualmente</span>
          </button>
        </div>
      </div>
    </div>
  );
};
