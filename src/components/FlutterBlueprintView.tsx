import React, { useState } from 'react';
import {
  Bluetooth,
  Check,
  Copy,
  Database,
  FileText,
  FolderTree,
  Layers,
  Moon,
  Smartphone,
  Sun,
} from 'lucide-react';
import { AppSection } from '../types/glucose';

interface FlutterBlueprintViewProps {
  activeSection: Exclude<AppSection, 'prototype'>;
  onSelectSection: (section: Exclude<AppSection, 'prototype'>) => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

const ISAR_SCHEMA_DART = `import 'package:isar/isar.dart';

part 'glucose_models.g.dart';

/// Catálogo oficial obligatorio de equipos Diagnósticos Biomédicos
enum BiomedicalDevice {
  OKMeter_Match_II,     // Lectura rápida 5s · Memoria hasta 1000
  GlucoLeader_Enhance,  // Protocolo Multimuestra
  Glucocare_D,          // Lectura rápida 5s · Memoria hasta 1000
  Glucomax,             // Lectura estándar 8s
  Glucocare_Match,      // Lectura estándar 8s
}

enum GlucoseUnit { mgDl, mmolL }

enum MeasurementContext {
  fasting,
  preMeal,
  postMeal1h,
  postMeal2h,
  bedtime,
  symptoms,
}

@collection
class UserProfile {
  Id id = Isar.autoIncrement;

  @Index(unique: true, caseSensitive: false)
  late String name;

  @enumerated
  GlucoseUnit preferredUnit = GlucoseUnit.mgDl;

  int targetMinMgDl = 70;
  int targetMaxMgDl = 140;
  DateTime createdAt = DateTime.now();

  @Backlink(to: 'profile')
  final readings = IsarLinks<GlucoseReading>();
}

@collection
class GlucoseReading {
  Id id = Isar.autoIncrement;

  /// Relación directa y clave indexada compuesta para deduplicación masiva
  @Index(composite: [CompositeIndex('timestamp')])
  late int profileId;

  final profile = IsarLink<UserProfile>();

  /// Almacenamiento canónico en mg/dL (conversión dinámica a mmol/L en UI)
  late int valorMgDl;

  @Index()
  late DateTime timestamp;

  @enumerated
  late MeasurementContext contexto;

  List<String> etiquetas = [];
  String? nota;

  /// Campo obligatorio: equipo exacto de Diagnósticos Biomédicos
  @enumerated
  late BiomedicalDevice deviceInfo;

  bool syncedFromMemory = false;
}`;

const ISAR_REPO_DART = `/// Servicio Local-First con límite de 3 perfiles y deduplicación por timestamp
class LocalGlucoseRepository {
  final Isar isar;
  static const int maxProfiles = 3;

  LocalGlucoseRepository(this.isar);

  Future<Id> createProfile(String name, {GlucoseUnit unit = GlucoseUnit.mgDl}) async {
    final total = await isar.userProfiles.count();
    if (total >= maxProfiles) {
      throw StateError('Máximo 3 perfiles locales permitidos en este dispositivo.');
    }
    final profile = UserProfile()
      ..name = name.trim()
      ..preferredUnit = unit;
    return isar.writeTxn(() => isar.userProfiles.put(profile));
  }

  /// Sincronización Masiva: inserta únicamente registros con timestamp nuevo
  Future<({int inserted, int skipped})> upsertBatchFromDevice({
    required int profileId,
    required List<GlucoseReading> incoming,
  }) async {
    int inserted = 0;
    int skipped = 0;

    await isar.writeTxn(() async {
      for (final item in incoming) {
        final minWindow = item.timestamp.subtract(const Duration(seconds: 30));
        final maxWindow = item.timestamp.add(const Duration(seconds: 30));

        final duplicate = await isar.glucoseReadings
            .filter()
            .profileIdEqualTo(profileId)
            .timestampBetween(minWindow, maxWindow)
            .valorMgDlEqualTo(item.valorMgDl)
            .findFirst();

        if (duplicate != null) {
          skipped++;
          continue;
        }
        await isar.glucoseReadings.put(item);
        inserted++;
      }
    });
    return (inserted: inserted, skipped: skipped);
  }
}`;

const BLE_SERVICE_DART = `import 'dart:async';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

/// UUIDs estándar Bluetooth SIG para perfil de glucosa (GLP)
final Guid glucoseServiceUuid = Guid('00001808-0000-1000-8000-00805f9b34fb');
final Guid glucoseMeasurementCharUuid = Guid('00002a18-0000-1000-8000-00805f9b34fb');
final Guid racpCharUuid = Guid('00002a52-0000-1000-8000-00805f9b34fb');

class BiomedicalBleManager {
  /// Prefijos anunciados autorizados de Diagnósticos Biomédicos
  static const allowedAdvertisedNames = [
    'Match II',
    'Glucoleader',
    'Glucocare D',
    'Glucomax',
    'Glucocare Match',
  ];

  /// 1. Escaneo estricto con Scan Filter (ignora cualquier otro dispositivo BLE)
  Stream<List<ScanResult>> scanFilteredDevices() {
    FlutterBluePlus.startScan(
      withServices: [glucoseServiceUuid],
      withNames: allowedAdvertisedNames,
      timeout: const Duration(seconds: 12),
    );
    return FlutterBluePlus.scanResults.map((results) => results.where((r) {
          final name = r.device.platformName;
          return allowedAdvertisedNames.any(
            (prefix) => name.toLowerCase().contains(prefix.toLowerCase()),
          );
        }).toList());
  }

  /// Mapea el dispositivo BLE al enum obligatorio deviceInfo y su latencia real
  BiomedicalDevice resolveDeviceModel(String advertisedName) {
    final n = advertisedName.toLowerCase();
    if (n.contains('match ii')) return BiomedicalDevice.OKMeter_Match_II;
    if (n.contains('glucoleader')) return BiomedicalDevice.GlucoLeader_Enhance;
    if (n.contains('glucocare d')) return BiomedicalDevice.Glucocare_D;
    if (n.contains('glucomax')) return BiomedicalDevice.Glucomax;
    return BiomedicalDevice.Glucocare_Match;
  }

  Duration expectedAnalysisLatency(BiomedicalDevice device) {
    return switch (device) {
      BiomedicalDevice.OKMeter_Match_II ||
      BiomedicalDevice.Glucocare_D ||
      BiomedicalDevice.GlucoLeader_Enhance => const Duration(seconds: 5),
      BiomedicalDevice.Glucomax ||
      BiomedicalDevice.Glucocare_Match => const Duration(seconds: 8),
    };
  }

  /// 2. Decodificador IEEE-11073 SFLOAT (bytes 12-13 de característica 0x2A18)
  int parseGlucoseMgDl(List<int> bytes) {
    final raw = (bytes[13] << 8) | bytes[12];
    final mantissa = raw & 0x0FFF;
    final exponent = (raw >> 12) >= 8 ? ((raw >> 12) - 16) : (raw >> 12);
    final kgPerL = mantissa * _pow10(exponent);
    return (kgPerL * 100000).round(); // Conversión exacta kg/L -> mg/dL
  }

  /// 3. Comando RACP (0x2A52) para Sincronización Masiva (hasta 1000 registros)
  Future<void> requestAllStoredRecords(BluetoothCharacteristic racpChar) async {
    // OpCode 0x01 = Report Stored Records | Operator 0x01 = All records
    await racpChar.write([0x01, 0x01], withoutResponse: false);
  }
}`;

const FLUTTER_FOLDER_TREE = `lib/
├── main.dart
├── core/
│   ├── theme/
│   │   ├── app_theme.dart              # Tema Apple Health Light / Dark alto contraste
│   │   └── clinical_colors.dart        # Semáforo accesible (Normal, Precaución, Alerta)
│   ├── constants/
│   │   └── biomedical_devices.dart     # Catálogo oficial Diagnósticos Biomédicos
│   └── utils/
│       ├── unit_converter.dart         # Conversión exacta mg/dL <-> mmol/L
│       └── ieee11073_parser.dart       # Decodificación SFLOAT de paquetes BLE
├── data/
│   ├── local/
│   │   ├── isar_provider.dart          # Inicialización 100% offline en directorio seguro
│   │   ├── glucose_models.dart         # Esquemas @collection (UserProfile, GlucoseReading)
│   │   └── glucose_repository.dart     # CRUD perfiles (máx. 3) + deduplicación masiva
│   └── ble/
│       └── biomedical_ble_manager.dart # Scan Filter + Máquina de estados + RACP Sync
├── features/
│   ├── profiles/
│   │   └── profile_selector_screen.dart
│   ├── dashboard/
│   │   ├── dashboard_screen.dart       # Semáforo, última lectura y KPIs
│   │   └── trend_chart_widget.dart     # Curva interactiva fl_chart
│   ├── capture/
│   │   ├── ble_scan_sheet.dart         # Filtro Diagnósticos Biomédicos + espera 5s/8s
│   │   ├── batch_sync_dialog.dart      # Progreso de descarga (hasta 1000 tomas)
│   │   └── context_tagger_sheet.dart   # Ayunas, Post-comida, Síntomas y Notas
│   └── reports/
│       └── clinical_pdf_service.dart   # Generación editorial offline con package:pdf
└── pubspec.yaml`;

const PDF_FLUTTER_DART = `import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

class ClinicalPdfService {
  Future<void> exportAndShare(UserProfile profile, List<GlucoseReading> items) async {
    final doc = pw.Document();
    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        build: (context) => [
          pw.Header(
            level: 0,
            child: pw.Text('DbSas · Reporte Clínico — \${profile.name}'),
          ),
          pw.TableHelper.fromTextArray(
            headers: ['Fecha', 'Glucosa', 'Contexto', 'Dispositivo', 'Notas'],
            data: items.map((r) => [
              r.timestamp.toIso8601String().substring(0, 16),
              '\${r.valorMgDl} mg/dL',
              r.contexto.name,
              r.deviceInfo.name, // OKMeter_Match_II, Glucocare_D, etc.
              r.nota ?? '—',
            ]).toList(),
          ),
        ],
      ),
    );
    await Printing.sharePdf(
      bytes: await doc.save(),
      filename: 'DbSas_\${profile.name}.pdf',
    );
  }
}`;

const WIREFRAME_SCREENS = [
  {
    step: '01',
    title: 'Selector de Perfiles Locales (Sin Registro)',
    zone: 'Inicio · Máximo 3 perfiles',
    summary:
      'Pantalla limpia sin formularios de correo ni contraseñas. Muestra tarjetas grandes (mín. 72px) con hasta 3 perfiles familiares. El botón "+ Crear perfil" solicita únicamente nombre y unidad (mg/dL o mmol/L) y se deshabilita al llegar a 3.',
    components: [
      'Tarjetas de perfil con inicial, nombre y total de registros',
      'Botón de acceso inmediato (1 toque al Dashboard)',
      'Banner informativo: 100% Local en el dispositivo',
    ],
  },
  {
    step: '02',
    title: 'Dashboard Clínico con Semáforo',
    zone: 'Tab Principal · Apple Health Minimal',
    summary:
      'Jerarquía visual enfocada en la última lectura en tipografía tabular gigante, acompañada siempre de icono + texto semafórico (En rango, Precaución, Alerta) y el nombre del equipo de Diagnósticos Biomédicos que la tomó.',
    components: [
      'Tarjeta focal de última medición + equipo deviceInfo',
      'Curva de tendencia fl_chart (7d / 14d / 30d) con banda objetivo',
      'Barra inferior fija en zona del pulgar con CTA central BLE',
    ],
  },
  {
    step: '03',
    title: 'Escaneo BLE Filtrado y Temporizador 5s / 8s',
    zone: 'Bottom Sheet · Diagnósticos Biomédicos',
    summary:
      'Filtra exclusivamente equipos Match II, Glucoleader, Glucocare D, Glucomax y Glucocare Match. Al detectar gota de sangre, muestra una barra cronometrada exacta de 5 segundos (Match II / Glucocare D) u 8 segundos (Glucomax / Glucocare Match), o flujo Multimuestra para GlucoLeader Enhance.',
    components: [
      'Scan Filter estricto por Advertised Names + UUID 0x1808',
      'Indicador de progreso calibrado a 5s / 8s según hardware',
      'Opción secundaria de captura manual con selector deviceInfo',
    ],
  },
  {
    step: '04',
    title: 'Sincronización Masiva de Memoria (1000 registros)',
    zone: 'Modal RACP · Glucocare D / Match II',
    summary:
      'Cuando el usuario no conectó la app durante varios días, el botón "Sincronizar memoria" envía el comando RACP 0x2A52, descarga el historial interno del glucómetro y cruza cada timestamp contra Isar para evitar duplicados.',
    components: [
      'Lectura por lotes hasta 1000 registros históricos',
      'Deduplicación automática por índice compuesto [profileId, timestamp]',
      'Resumen claro: X registros nuevos importados · Y duplicados omitidos',
    ],
  },
  {
    step: '05',
    title: 'Contexto Clínico y Etiquetas Rápidas',
    zone: 'Bottom Sheet Post-Captura',
    summary:
      'Inmediatamente después de recibir el nivel de glucosa, pregunta el momento de la toma con botones amplios táctiles y chips interactivos de estilo de vida sin fricción.',
    components: [
      'En ayunas / Antes de comer / 1h o 2h post-comida / Dormir / Síntomas',
      'Etiquetas rápidas: Comí postre, Hice ejercicio, Medicación, Estrés',
      'Campo de nota breve opcional + botón Guardar de ancho completo',
    ],
  },
  {
    step: '06',
    title: 'Exportador PDF Editorial para el Médico',
    zone: 'Vista Reporte · Generación Offline',
    summary:
      'Genera un documento PDF clínico A4 directamente en el teléfono usando package:pdf, incluyendo promedio, % en rango, GMI estimado y tabla detallada con la columna de dispositivo Diagnósticos Biomédicos para compartir vía WhatsApp o AirDrop.',
    components: [
      'Selector de rango (7, 14, 30, 90 días)',
      'Vista previa limpia del documento médico A4',
      'Hoja de compartir nativa del sistema (sin internet)',
    ],
  },
];

export const FlutterBlueprintView: React.FC<FlutterBlueprintViewProps> = ({
  activeSection,
  onSelectSection,
  isDark,
  onToggleTheme,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Clipboard may be restricted in some sandbox contexts
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation bar inside Blueprint */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'isar', label: '01. Esquema Isar', icon: Database },
              { id: 'wireframes', label: '02. Flujo Pantallas', icon: Smartphone },
              { id: 'ble', label: '03. Lógica BLE', icon: Bluetooth },
              { id: 'architecture', label: '04. Arquitectura & PDF', icon: FolderTree },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectSection(tab.id)}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span>{isDark ? 'Modo Claro' : 'Modo Oscuro'}</span>
        </button>
      </div>

      {/* DELIVERABLE 1: ISAR DATABASE SCHEMA */}
      {activeSection === 'isar' && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                01. Esquema de Base de Datos Local (Isar Database)
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Diseñado 100% offline con soporte para máximo 3 perfiles locales, almacenamiento canónico en <code className="font-mono">mg/dL</code>, campo obligatorio <code className="font-mono">deviceInfo</code> para los 5 equipos de Diagnósticos Biomédicos e índice compuesto para deduplicación ultrarrápida.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
              {[
                { id: 'OKMeter_Match_II', meta: '5s · 1000 mem' },
                { id: 'GlucoLeader_Enhance', meta: 'Multimuestra' },
                { id: 'Glucocare_D', meta: '5s · 1000 mem' },
                { id: 'Glucomax', meta: '8s · 450 mem' },
                { id: 'Glucocare_Match', meta: '8s · 500 mem' },
              ].map((d) => (
                <div
                  key={d.id}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                >
                  <div className="text-xs font-mono font-semibold text-slate-900 dark:text-white truncate">
                    {d.id}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {d.meta}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CodeCard
              id="isar-schema"
              title="glucose_models.dart — Colecciones @collection e Índices"
              code={ISAR_SCHEMA_DART}
              copiedId={copiedId}
              onCopy={handleCopy}
            />
            <CodeCard
              id="isar-repo"
              title="glucose_repository.dart — Límite 3 Perfiles y Deduplicación"
              code={ISAR_REPO_DART}
              copiedId={copiedId}
              onCopy={handleCopy}
            />
          </div>
        </div>
      )}

      {/* DELIVERABLE 2: SCREEN FLOW WIREFRAMES */}
      {activeSection === 'wireframes' && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              02. Flujo de Pantallas (Wireframe Descriptivo)
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Recorrido completo de extremo a extremo desde el selector sin cuentas hasta el reporte PDF médico, optimizado para accesibilidad y alcance con una mano.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {WIREFRAME_SCREENS.map((scr) => (
              <div
                key={scr.step}
                className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      Pantalla {scr.step}
                    </span>
                    <span>{scr.zone}</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {scr.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {scr.summary}
                  </p>
                </div>

                <ul className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  {scr.components.map((comp) => (
                    <li key={comp} className="flex items-start gap-2">
                      <span className="text-blue-600 dark:text-blue-400 mt-0.5" aria-hidden="true">
                        •
                      </span>
                      <span>{comp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DELIVERABLE 3: BLE LOGIC */}
      {activeSection === 'ble' && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              03. Lógica Bluetooth Low Energy (flutter_blue_plus)
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Implementación específica para la familia de Diagnósticos Biomédicos: escaneo filtrado por <code className="font-mono">withServices</code> y <code className="font-mono">withNames</code>, gestión de latencia por modelo (<code className="font-mono">5s</code> / <code className="font-mono">8s</code>), decodificación IEEE-11073 y Sincronización Masiva vía RACP (<code className="font-mono">0x2A52</code>).
            </p>

            {/* State Machine Diagram */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-x-auto">
              <pre className="text-xs font-mono text-slate-800 dark:text-slate-200 leading-relaxed">
{`[Idle] ──► [Scan Filter: Match II / Glucoleader / Glucocare D / Glucomax / Glucocare Match]
               │
               ▼
       [GATT Connect 0x1808] ──► (Suscripción Notify 0x2A18 & Indicate 0x2A52)
               │
        ┌──────┴─────────────────────────┐
        ▼                                ▼
[Captura en Vivo]               [Sincronización Masiva (1000 mem)]
 • Match II / Glucocare D: 5s    • RACP Write [0x01, 0x01]
 • Glucomax / Glucocare M.: 8s   • Stream histórico -> Parse SFLOAT
 • GlucoLeader: Multimuestra     • Cruce Isar [profileId + timestamp]
        │                                │
        └──────► [Bottom Sheet Contexto] ◄┘ (Omite duplicados existentes)`}
              </pre>
            </div>
          </div>

          <CodeCard
            id="ble-dart"
            title="biomedical_ble_manager.dart — Scan Filter, Latencias 5s/8s y RACP Sync"
            code={BLE_SERVICE_DART}
            copiedId={copiedId}
            onCopy={handleCopy}
          />
        </div>
      )}

      {/* DELIVERABLE 4: FLUTTER FOLDER STRUCTURE & PDF */}
      {activeSection === 'architecture' && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
              <Layers className="w-4 h-4" />
              <span>Clean Architecture Feature-First · Local-First</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              04. Estructura de Carpetas Flutter y Generación PDF Offline
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Organización modular recomendada para mantener el código BLE, el esquema Isar y los reportes PDF médicos desacoplados y fáciles de probar.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CodeCard
              id="folder-tree"
              title="Estructura recomendada del proyecto Flutter"
              code={FLUTTER_FOLDER_TREE}
              copiedId={copiedId}
              onCopy={handleCopy}
            />
            <div className="space-y-6">
              <CodeCard
                id="pdf-dart"
                title="clinical_pdf_service.dart — Generación PDF nativa (package:pdf)"
                code={PDF_FLUTTER_DART}
                copiedId={copiedId}
                onCopy={handleCopy}
              />
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Stack recomendado en pubspec.yaml</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-mono">
                  isar ^3.1.0 · isar_flutter_libs · flutter_blue_plus ^1.32.0 · flutter_riverpod ^2.5.0 · fl_chart ^0.68.0 · pdf ^3.11.0 · printing ^5.13.0
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface CodeCardProps {
  id: string;
  title: string;
  code: string;
  copiedId: string | null;
  onCopy: (id: string, code: string) => void;
}

const CodeCard: React.FC<CodeCardProps> = ({
  id,
  title,
  code,
  copiedId,
  onCopy,
}) => {
  const isCopied = copiedId === id;
  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
          {title}
        </span>
        <button
          type="button"
          onClick={() => onCopy(id, code)}
          className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 shrink-0"
        >
          {isCopied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-5 text-xs font-mono text-slate-800 dark:text-slate-200 bg-slate-50/60 dark:bg-slate-950/60 overflow-x-auto leading-relaxed flex-1">
        <code>{code}</code>
      </pre>
    </div>
  );
};
