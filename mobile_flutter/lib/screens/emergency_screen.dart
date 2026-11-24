import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/glucose_models.dart';

Future<void> confirmAndLaunchDialer(
  BuildContext context,
  EmergencyContact contact,
) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('¿Abrir marcador telefónico?'),
      content: Text(
        'Se abrirá el teléfono para llamar a ${contact.name} (${contact.relation}) al ${contact.phone}. No se realizará ninguna llamada automática sin tu confirmación.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancelar'),
        ),
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
          onPressed: () => Navigator.pop(ctx, true),
          icon: const Icon(Icons.call),
          label: const Text('Abrir teléfono'),
        ),
      ],
    ),
  );

  if (confirmed == true) {
    final cleaned = contact.phone.replaceAll(RegExp(r'[^\d+]'), '');
    final uri = Uri(scheme: 'tel', path: cleaned);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No se pudo abrir la aplicación de llamadas en este teléfono.'),
        ),
      );
    }
  }
}

class EmergencyScreen extends StatefulWidget {
  final UserProfile profile;
  final Future<void> Function(EmergencyContact contact) onSaveContact;

  const EmergencyScreen({
    super.key,
    required this.profile,
    required this.onSaveContact,
  });

  @override
  State<EmergencyScreen> createState() => _EmergencyScreenState();
}

class _EmergencyScreenState extends State<EmergencyScreen> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _nameCtrl;
  late TextEditingController _phoneCtrl;
  late TextEditingController _relationCtrl;

  @override
  void initState() {
    super.initState();
    _syncControllers();
  }

  @override
  void didUpdateWidget(covariant EmergencyScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.profile.id != widget.profile.id) {
      _syncControllers();
    }
  }

  void _syncControllers() {
    _nameCtrl = TextEditingController(
      text: widget.profile.emergencyContact?.name ?? '',
    );
    _phoneCtrl = TextEditingController(
      text: widget.profile.emergencyContact?.phone ?? '',
    );
    _relationCtrl = TextEditingController(
      text: widget.profile.emergencyContact?.relation ?? '',
    );
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _relationCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    await widget.onSaveContact(
      EmergencyContact(
        name: _nameCtrl.text.trim(),
        phone: _phoneCtrl.text.trim(),
        relation: _relationCtrl.text.trim().isEmpty
            ? 'Familiar / Confianza'
            : _relationCtrl.text.trim(),
      ),
    );
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Contacto de emergencia guardado.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final saved = widget.profile.emergencyContact;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (saved != null) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Contacto actual de ${widget.profile.name}',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    saved.name,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  Text('${saved.relation} · ${saved.phone}'),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.red.shade700,
                      ),
                      onPressed: () => confirmAndLaunchDialer(context, saved),
                      icon: const Icon(Icons.call),
                      label: Text('Llamar a ${saved.name}'),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
        ],
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    saved == null ? 'Configurar contacto de emergencia' : 'Actualizar contacto',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _nameCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Nombre',
                      border: OutlineInputBorder(),
                    ),
                    validator: (v) =>
                        (v == null || v.trim().isEmpty) ? 'Escribe el nombre' : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _phoneCtrl,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Número de teléfono',
                      border: OutlineInputBorder(),
                    ),
                    validator: (v) =>
                        (v == null || v.trim().isEmpty) ? 'Escribe el teléfono' : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _relationCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Relación con el paciente',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _submit,
                      child: const Text('Guardar contacto'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
