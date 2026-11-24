import 'package:flutter/material.dart';
import '../data/local_database.dart';
import '../models/glucose_models.dart';
import '../services/glucose_math.dart';

class ProfilesScreen extends StatefulWidget {
  final List<UserProfile> profiles;
  final UserProfile activeProfile;
  final Future<int> Function(String profileId) countReadings;
  final void Function(String profileId) onSelectProfile;
  final Future<void> Function(String name, GlucoseUnit unit) onCreateProfile;
  final Future<void> Function(UserProfile updated) onUpdateProfile;
  final Future<void> Function(String profileId) onDeleteProfile;
  final bool largeText;
  final bool darkMode;
  final VoidCallback onToggleLargeText;
  final VoidCallback onToggleDarkMode;
  final VoidCallback onOpenGuide;

  const ProfilesScreen({
    super.key,
    required this.profiles,
    required this.activeProfile,
    required this.countReadings,
    required this.onSelectProfile,
    required this.onCreateProfile,
    required this.onUpdateProfile,
    required this.onDeleteProfile,
    required this.largeText,
    required this.darkMode,
    required this.onToggleLargeText,
    required this.onToggleDarkMode,
    required this.onOpenGuide,
  });

  @override
  State<ProfilesScreen> createState() => _ProfilesScreenState();
}

class _ProfilesScreenState extends State<ProfilesScreen> {
  final _newNameCtrl = TextEditingController();
  GlucoseUnit _newUnit = GlucoseUnit.mgDl;

  @override
  void dispose() {
    _newNameCtrl.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    final name = _newNameCtrl.text.trim();
    if (name.isEmpty) return;
    if (widget.profiles.length >= LocalDatabase.maxProfiles) return;
    await widget.onCreateProfile(name, _newUnit);
    _newNameCtrl.clear();
  }

  Future<void> _showEditDialog(UserProfile p) async {
    final nameCtrl = TextEditingController(text: p.name);
    var unit = p.preferredUnit;
    final minCtrl = TextEditingController(
      text: GlucoseMath.formatValue(p.targetMinMgDl, unit),
    );
    final maxCtrl = TextEditingController(
      text: GlucoseMath.formatValue(p.targetMaxMgDl, unit),
    );

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Editar perfil'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Nombre',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<GlucoseUnit>(
                  value: unit,
                  decoration: const InputDecoration(
                    labelText: 'Unidad de medida',
                    border: OutlineInputBorder(),
                  ),
                  items: GlucoseUnit.values
                      .map((u) => DropdownMenuItem(value: u, child: Text(u.label)))
                      .toList(),
                  onChanged: (val) {
                    if (val == null) return;
                    setLocal(() {
                      unit = val;
                      minCtrl.text = val == GlucoseUnit.mmolL ? '3.9' : '70';
                      maxCtrl.text = val == GlucoseUnit.mmolL ? '7.8' : '140';
                    });
                  },
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: minCtrl,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: InputDecoration(
                          labelText: 'Mín (${unit.label})',
                          border: const OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: maxCtrl,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: InputDecoration(
                          labelText: 'Máx (${unit.label})',
                          border: const OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Guardar'),
            ),
          ],
        ),
      ),
    );

    if (saved == true && nameCtrl.text.trim().isNotEmpty) {
      final minVal = double.tryParse(minCtrl.text.replaceAll(',', '.')) ?? 70;
      final maxVal = double.tryParse(maxCtrl.text.replaceAll(',', '.')) ?? 140;
      int minMg = unit == GlucoseUnit.mmolL
          ? GlucoseMath.mmolToMgDl(minVal)
          : minVal.round();
      int maxMg = unit == GlucoseUnit.mmolL
          ? GlucoseMath.mmolToMgDl(maxVal)
          : maxVal.round();
      minMg = minMg.clamp(45, 200);
      maxMg = maxMg.clamp(minMg + 20, 350);

      await widget.onUpdateProfile(
        p.copyWith(
          name: nameCtrl.text.trim(),
          preferredUnit: unit,
          targetMinMgDl: minMg,
          targetMaxMgDl: maxMg,
        ),
      );
    }
  }

  Future<void> _confirmDeleteProfile(UserProfile p) async {
    final count = await widget.countReadings(p.id);
    if (!mounted) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('¿Eliminar el perfil de ${p.name}?'),
        content: Text(
          'Se eliminarán permanentemente $count ${count == 1 ? 'medición asociada' : 'mediciones asociadas'} y su contacto de emergencia en este teléfono. Esta acción no se puede deshacer.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sí, eliminar permanentemente'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await widget.onDeleteProfile(p.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Perfiles locales (${widget.profiles.length} de ${LocalDatabase.maxProfiles})',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Cada perfil mantiene su historial, unidad y contacto de emergencia separados sin internet.',
                ),
                const SizedBox(height: 14),
                ...widget.profiles.map((p) {
                  final active = p.id == widget.activeProfile.id;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: active
                              ? Theme.of(context).colorScheme.primary
                              : Theme.of(context).dividerColor,
                          width: active ? 2 : 1,
                        ),
                      ),
                      child: ListTile(
                        onTap: () => widget.onSelectProfile(p.id),
                        title: Text(
                          '${p.name}${active ? ' · Activo' : ''}',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        subtitle: Text(
                          'Unidad: ${p.preferredUnit.label} · Meta: ${GlucoseMath.formatValue(p.targetMinMgDl, p.preferredUnit)}–${GlucoseMath.formatValue(p.targetMaxMgDl, p.preferredUnit)}',
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit_outlined),
                              tooltip: 'Editar perfil',
                              onPressed: () => _showEditDialog(p),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete_outline),
                              tooltip: 'Eliminar perfil',
                              onPressed: () => _confirmDeleteProfile(p),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 12),
                if (widget.profiles.length < LocalDatabase.maxProfiles) ...[
                  TextField(
                    controller: _newNameCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Nuevo nombre de perfil',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      DropdownButton<GlucoseUnit>(
                        value: _newUnit,
                        items: GlucoseUnit.values
                            .map((u) => DropdownMenuItem(value: u, child: Text(u.label)))
                            .toList(),
                        onChanged: (v) {
                          if (v != null) setState(() => _newUnit = v);
                        },
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: FilledButton(
                          onPressed: _create,
                          child: const Text('Crear perfil'),
                        ),
                      ),
                    ],
                  ),
                ] else
                  const Text(
                    'Ya alcanzaste el máximo de 3 perfiles locales. Elimina uno para poder crear otro.',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Accesibilidad y apariencia',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                SwitchListTile(
                  title: const Text('Texto grande'),
                  subtitle: const Text('Aumenta el tamaño de letra en toda la app'),
                  value: widget.largeText,
                  onChanged: (_) => widget.onToggleLargeText(),
                ),
                SwitchListTile(
                  title: const Text('Modo oscuro'),
                  value: widget.darkMode,
                  onChanged: (_) => widget.onToggleDarkMode(),
                ),
                ListTile(
                  leading: const Icon(Icons.help_outline),
                  title: const Text('Ver guía rápida inicial'),
                  onTap: widget.onOpenGuide,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
