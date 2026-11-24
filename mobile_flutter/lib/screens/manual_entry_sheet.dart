import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/glucose_models.dart';
import '../services/glucose_math.dart';

class ManualEntrySheet extends StatefulWidget {
  final UserProfile profile;
  final Future<void> Function(GlucoseReading reading) onSave;

  const ManualEntrySheet({
    super.key,
    required this.profile,
    required this.onSave,
  });

  @override
  State<ManualEntrySheet> createState() => _ManualEntrySheetState();
}

class _ManualEntrySheetState extends State<ManualEntrySheet> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _valueCtrl;
  final _noteCtrl = TextEditingController();
  late GlucoseUnit _unit;
  DateTime _selectedDateTime = DateTime.now();
  MeasurementContext _context = MeasurementContext.fasting;
  String _selectedModel = kGlucometerCatalog.first.displayName;
  final Set<String> _selectedTags = {};

  @override
  void initState() {
    super.initState();
    _unit = widget.profile.preferredUnit;
    _valueCtrl = TextEditingController(
      text: _unit == GlucoseUnit.mmolL ? '5.9' : '108',
    );
  }

  @override
  void dispose() {
    _valueCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDateTime() async {
    final pickedDate = await showDatePicker(
      context: context,
      initialDate: _selectedDateTime,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (pickedDate == null || !mounted) return;

    final pickedTime = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_selectedDateTime),
    );
    if (pickedTime == null || !mounted) return;

    setState(() {
      _selectedDateTime = DateTime(
        pickedDate.year,
        pickedDate.month,
        pickedDate.day,
        pickedTime.hour,
        pickedTime.minute,
      );
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final raw = double.tryParse(_valueCtrl.text.replaceAll(',', '.'));
    if (raw == null || raw <= 0) return;

    final valueMgDl = (_unit == GlucoseUnit.mmolL
            ? GlucoseMath.mmolToMgDl(raw)
            : raw.round())
        .clamp(25, 600);

    final reading = GlucoseReading(
      id: 'rd_${DateTime.now().microsecondsSinceEpoch}',
      profileId: widget.profile.id,
      valueMgDl: valueMgDl,
      unitEntered: _unit,
      timestampMs: _selectedDateTime.millisecondsSinceEpoch,
      context: _context,
      tags: _selectedTags.toList(),
      note: _noteCtrl.text.trim(),
      captureMethod: CaptureMethod.manual,
      deviceModel: _selectedModel,
    );

    await widget.onSave(reading);
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final modelOptions = [
      ...kGlucometerCatalog.map((d) => d.displayName),
      'Otro / Sin especificar',
    ];

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Registrar medición manual',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _valueCtrl,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Valor de glucosa',
                        border: OutlineInputBorder(),
                      ),
                      validator: (v) {
                        final num? parsed =
                            num.tryParse((v ?? '').replaceAll(',', '.'));
                        if (parsed == null || parsed <= 0) {
                          return 'Ingresa un valor válido';
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 10),
                  DropdownButton<GlucoseUnit>(
                    value: _unit,
                    items: GlucoseUnit.values
                        .map((u) => DropdownMenuItem(value: u, child: Text(u.label)))
                        .toList(),
                    onChanged: (val) {
                      if (val != null) setState(() => _unit = val);
                    },
                  ),
                ],
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _pickDateTime,
                icon: const Icon(Icons.calendar_today),
                label: Text(
                  'Fecha y hora: ${DateFormat('dd/MM/yyyy HH:mm').format(_selectedDateTime)}',
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<MeasurementContext>(
                value: _context,
                decoration: const InputDecoration(
                  labelText: 'Contexto de la medición',
                  border: OutlineInputBorder(),
                ),
                items: MeasurementContext.values
                    .map((c) => DropdownMenuItem(value: c, child: Text(c.label)))
                    .toList(),
                onChanged: (val) {
                  if (val != null) setState(() => _context = val);
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _selectedModel,
                decoration: const InputDecoration(
                  labelText: 'Modelo del glucómetro',
                  border: OutlineInputBorder(),
                ),
                items: modelOptions
                    .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                    .toList(),
                onChanged: (val) {
                  if (val != null) setState(() => _selectedModel = val);
                },
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: kQuickTags.map((tag) {
                  final active = _selectedTags.contains(tag);
                  return FilterChip(
                    label: Text(tag),
                    selected: active,
                    onSelected: (sel) {
                      setState(() {
                        if (sel) {
                          _selectedTags.add(tag);
                        } else {
                          _selectedTags.remove(tag);
                        }
                      });
                    },
                  );
                }).toList(),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _noteCtrl,
                decoration: const InputDecoration(
                  labelText: 'Notas (opcional)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _submit,
                  child: const Text('Guardar medición'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
