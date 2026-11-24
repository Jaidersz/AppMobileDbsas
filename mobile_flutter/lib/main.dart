import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'data/local_database.dart';
import 'models/glucose_models.dart';
import 'screens/emergency_screen.dart';
import 'screens/glucometer_screen.dart';
import 'screens/history_screen.dart';
import 'screens/home_screen.dart';
import 'screens/manual_entry_sheet.dart';
import 'screens/onboarding_guide.dart';
import 'screens/profiles_screen.dart';
import 'services/ble_glucose_service.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const GlucosoftApp());
}

class GlucosoftApp extends StatefulWidget {
  const GlucosoftApp({super.key});

  @override
  State<GlucosoftApp> createState() => _GlucosoftAppState();
}

class _GlucosoftAppState extends State<GlucosoftApp> {
  final LocalDatabase _db = LocalDatabase();
  final BleGlucoseService _ble = BleGlucoseService();

  bool _loading = true;
  bool _darkMode = false;
  bool _largeText = false;
  bool _showGuide = true;
  int _tabIndex = 0;

  List<UserProfile> _profiles = [];
  String? _activeProfileId;
  List<GlucoseReading> _activeReadings = [];
  ConnectedMeterInfo? _connectedMeter;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    final profiles = await _db.getAllProfiles();
    final savedActive = prefs.getString('active_profile_id');
    final activeId = profiles.any((p) => p.id == savedActive)
        ? savedActive
        : (profiles.isNotEmpty ? profiles.first.id : null);

    final readings = activeId != null
        ? await _db.getReadingsForProfile(activeId)
        : <GlucoseReading>[];

    if (!mounted) return;
    setState(() {
      _darkMode = prefs.getBool('dark_mode') ?? false;
      _largeText = prefs.getBool('large_text') ?? false;
      _showGuide = !(prefs.getBool('onboarding_done') ?? false);
      _profiles = profiles;
      _activeProfileId = activeId;
      _activeReadings = readings;
      _loading = false;
    });
  }

  UserProfile? get _activeProfile {
    if (_profiles.isEmpty) return null;
    return _profiles.firstWhere(
      (p) => p.id == _activeProfileId,
      orElse: () => _profiles.first,
    );
  }

  Future<void> _selectProfile(String id) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('active_profile_id', id);
    final readings = await _db.getReadingsForProfile(id);
    if (!mounted) return;
    setState(() {
      _activeProfileId = id;
      _activeReadings = readings;
    });
  }

  Future<void> _createProfile(String name, GlucoseUnit unit) async {
    final created = await _db.createProfile(name: name, preferredUnit: unit);
    final profiles = await _db.getAllProfiles();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('active_profile_id', created.id);
    if (!mounted) return;
    setState(() {
      _profiles = profiles;
      _activeProfileId = created.id;
      _activeReadings = [];
    });
  }

  Future<void> _updateProfile(UserProfile updated) async {
    await _db.updateProfile(updated);
    final profiles = await _db.getAllProfiles();
    if (!mounted) return;
    setState(() => _profiles = profiles);
  }

  Future<void> _deleteProfile(String profileId) async {
    await _db.deleteProfileCascade(profileId);
    final profiles = await _db.getAllProfiles();
    final nextId = profiles.isNotEmpty ? profiles.first.id : null;
    final readings = nextId != null
        ? await _db.getReadingsForProfile(nextId)
        : <GlucoseReading>[];
    if (!mounted) return;
    setState(() {
      _profiles = profiles;
      _activeProfileId = nextId;
      _activeReadings = readings;
    });
  }

  Future<void> _addReading(GlucoseReading reading) async {
    await _db.insertReading(reading);
    if (_activeProfile != null) {
      final list = await _db.getReadingsForProfile(_activeProfile!.id);
      if (mounted) setState(() => _activeReadings = list);
    }
  }

  Future<void> _handleBleReading(ParsedBleGlucose parsed, String modelName) async {
    final profile = _activeProfile;
    if (profile == null) return;

    final candidate = GlucoseReading(
      id: 'rd_ble_${parsed.timestamp.microsecondsSinceEpoch}',
      profileId: profile.id,
      valueMgDl: parsed.valueMgDl,
      unitEntered: profile.preferredUnit,
      timestampMs: parsed.timestamp.millisecondsSinceEpoch,
      context: MeasurementContext.fasting,
      captureMethod: CaptureMethod.bluetooth,
      deviceModel: modelName,
      deviceInfo: _connectedMeter?.realName,
    );

    final inserted = await _db.insertReadingIfNotDuplicate(candidate);
    if (inserted) {
      final list = await _db.getReadingsForProfile(profile.id);
      if (mounted) setState(() => _activeReadings = list);
    }
  }

  Future<void> _deleteReading(String id) async {
    await _db.deleteReading(id);
    if (_activeProfile != null) {
      final list = await _db.getReadingsForProfile(_activeProfile!.id);
      if (mounted) setState(() => _activeReadings = list);
    }
  }

  Future<void> _dismissGuide() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('onboarding_done', true);
    if (mounted) setState(() => _showGuide = false);
  }

  Future<void> _toggleDarkMode() async {
    final next = !_darkMode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('dark_mode', next);
    if (mounted) setState(() => _darkMode = next);
  }

  Future<void> _toggleLargeText() async {
    final next = !_largeText;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('large_text', next);
    if (mounted) setState(() => _largeText = next);
  }

  void _openManualSheet(BuildContext ctx) {
    final p = _activeProfile;
    if (p == null) return;
    showModalBottomSheet(
      context: ctx,
      isScrollControlled: true,
      builder: (_) => ManualEntrySheet(
        profile: p,
        onSave: _addReading,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Glucosoft App',
      debugShowCheckedModeBanner: false,
      theme: GlucosoftTheme.light(),
      darkTheme: GlucosoftTheme.dark(),
      themeMode: _darkMode ? ThemeMode.dark : ThemeMode.light,
      builder: (context, child) {
        final mq = MediaQuery.of(context);
        final scale = _largeText ? 1.2 : 1.0;
        return MediaQuery(
          data: mq.copyWith(textScaler: TextScaler.linear(scale)),
          child: child ?? const SizedBox.shrink(),
        );
      },
      home: _loading
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : _activeProfile == null
              ? _FirstProfileScaffold(
                  showGuide: _showGuide,
                  onDismissGuide: _dismissGuide,
                  onCreateProfile: _createProfile,
                )
              : Builder(
                  builder: (navCtx) {
                    final profile = _activeProfile!;
                    final screens = [
                      HomeScreen(
                        profile: profile,
                        readings: _activeReadings,
                        connectedMeter: _connectedMeter,
                        onNewMeasurement: () => _openManualSheet(navCtx),
                        onOpenHistory: () => setState(() => _tabIndex = 1),
                        onOpenGlucometer: () => setState(() => _tabIndex = 2),
                        onOpenEmergency: () => setState(() => _tabIndex = 3),
                        onConfirmEmergencyCall: () {
                          if (profile.emergencyContact != null) {
                            confirmAndLaunchDialer(
                              navCtx,
                              profile.emergencyContact!,
                            );
                          }
                        },
                      ),
                      HistoryScreen(
                        profile: profile,
                        readings: _activeReadings,
                        onDeleteReading: _deleteReading,
                      ),
                      GlucometerScreen(
                        bleService: _ble,
                        connectedMeter: _connectedMeter,
                        onConnectionChanged: (info) =>
                            setState(() => _connectedMeter = info),
                        onReadingArrived: _handleBleReading,
                      ),
                      EmergencyScreen(
                        profile: profile,
                        onSaveContact: (c) => _updateProfile(
                          profile.copyWith(emergencyContact: c),
                        ),
                      ),
                      ProfilesScreen(
                        profiles: _profiles,
                        activeProfile: profile,
                        countReadings: _db.countReadingsForProfile,
                        onSelectProfile: _selectProfile,
                        onCreateProfile: _createProfile,
                        onUpdateProfile: _updateProfile,
                        onDeleteProfile: _deleteProfile,
                        largeText: _largeText,
                        darkMode: _darkMode,
                        onToggleLargeText: _toggleLargeText,
                        onToggleDarkMode: _toggleDarkMode,
                        onOpenGuide: () => setState(() => _showGuide = true),
                      ),
                    ];

                    return Scaffold(
                      appBar: AppBar(
                        title: Text('Glucosoft App · ${profile.name}'),
                      ),
                      body: Column(
                        children: [
                          if (_showGuide)
                            OnboardingGuideCard(onDismiss: _dismissGuide),
                          Expanded(child: screens[_tabIndex]),
                        ],
                      ),
                      bottomNavigationBar: NavigationBar(
                        selectedIndex: _tabIndex,
                        onDestinationSelected: (i) =>
                            setState(() => _tabIndex = i),
                        destinations: const [
                          NavigationDestination(
                            icon: Icon(Icons.home_outlined),
                            label: 'Inicio',
                          ),
                          NavigationDestination(
                            icon: Icon(Icons.history),
                            label: 'Historial',
                          ),
                          NavigationDestination(
                            icon: Icon(Icons.bluetooth),
                            label: 'Medidor',
                          ),
                          NavigationDestination(
                            icon: Icon(Icons.phone_in_talk_outlined),
                            label: 'Ayuda',
                          ),
                          NavigationDestination(
                            icon: Icon(Icons.people_outline),
                            label: 'Perfiles',
                          ),
                        ],
                      ),
                    );
                  },
                ),
    );
  }
}

class _FirstProfileScaffold extends StatefulWidget {
  final bool showGuide;
  final VoidCallback onDismissGuide;
  final Future<void> Function(String name, GlucoseUnit unit) onCreateProfile;

  const _FirstProfileScaffold({
    required this.showGuide,
    required this.onDismissGuide,
    required this.onCreateProfile,
  });

  @override
  State<_FirstProfileScaffold> createState() => _FirstProfileScaffoldState();
}

class _FirstProfileScaffoldState extends State<_FirstProfileScaffold> {
  final _nameCtrl = TextEditingController();
  GlucoseUnit _unit = GlucoseUnit.mgDl;

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Glucosoft App')),
      body: ListView(
        children: [
          if (widget.showGuide)
            OnboardingGuideCard(onDismiss: widget.onDismissGuide),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Crea tu primer perfil',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Tus datos se guardan solo en este teléfono, sin cuentas ni internet.',
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _nameCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Tu nombre',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<GlucoseUnit>(
                      value: _unit,
                      decoration: const InputDecoration(
                        labelText: 'Unidad preferida',
                        border: OutlineInputBorder(),
                      ),
                      items: GlucoseUnit.values
                          .map((u) => DropdownMenuItem(value: u, child: Text(u.label)))
                          .toList(),
                      onChanged: (u) {
                        if (u != null) setState(() => _unit = u);
                      },
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: () {
                          final name = _nameCtrl.text.trim();
                          if (name.isNotEmpty) {
                            widget.onCreateProfile(name, _unit);
                          }
                        },
                        child: const Text('Comenzar'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
