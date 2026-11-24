import 'package:flutter/material.dart';

class OnboardingGuideCard extends StatefulWidget {
  final VoidCallback onDismiss;

  const OnboardingGuideCard({super.key, required this.onDismiss});

  @override
  State<OnboardingGuideCard> createState() => _OnboardingGuideCardState();
}

class _OnboardingGuideCardState extends State<OnboardingGuideCard> {
  int _step = 0;

  static const _steps = [
    (
      '1. Crea tu perfil personal',
      'Solo escribe tu nombre. Hasta 3 personas pueden llevar su control separado en este teléfono sin cuentas ni internet.',
      Icons.people_outline,
    ),
    (
      '2. Registra una medición',
      'Pulsa "Nueva medición" para anotar tu glucosa manualmente o recibirla desde un glucómetro Bluetooth compatible.',
      Icons.add_circle_outline,
    ),
    (
      '3. Conecta tu glucómetro',
      'En la pestaña Medidor puedes buscar equipos cercanos y ver el estado de compatibilidad real de cada modelo.',
      Icons.bluetooth,
    ),
    (
      '4. Consulta historial y reportes',
      'Revisa tus resultados por fecha, visualiza tendencias y guarda o comparte reportes en PDF para tu médico.',
      Icons.picture_as_pdf_outlined,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final (title, desc, icon) = _steps[_step];
    final isLast = _step == _steps.length - 1;

    return Card(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: widget.onDismiss,
                  tooltip: 'Cerrar guía',
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(desc),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                TextButton(
                  onPressed: widget.onDismiss,
                  child: const Text('Omitir'),
                ),
                Row(
                  children: [
                    if (_step > 0)
                      TextButton(
                        onPressed: () => setState(() => _step--),
                        child: const Text('Anterior'),
                      ),
                    FilledButton(
                      onPressed: isLast
                          ? widget.onDismiss
                          : () => setState(() => _step++),
                      child: Text(isLast ? 'Entendido' : 'Siguiente'),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
