import React, { useEffect, useState } from 'react';
import { Edit3, Phone, PhoneCall, ShieldAlert, UserCheck, X } from 'lucide-react';
import { EmergencyContact, GlucoseUnit } from '../types/glucose';
import { formatGlucoseValue } from '../utils/glucoseMath';

interface EmergencyContactSectionProps {
  profileName: string;
  contact?: EmergencyContact;
  latestValueMgDl: number | null;
  unit: GlucoseUnit;
  onSaveContact: (contact: EmergencyContact) => void;
  onRequestCall: (contact: EmergencyContact) => void;
}

export const EmergencyContactSection: React.FC<EmergencyContactSectionProps> = ({
  profileName,
  contact,
  latestValueMgDl,
  unit,
  onSaveContact,
  onRequestCall,
}) => {
  const [name, setName] = useState(contact?.name ?? '');
  const [relation, setRelation] = useState(contact?.relation ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [isEditing, setIsEditing] = useState(!contact);

  useEffect(() => {
    setName(contact?.name ?? '');
    setRelation(contact?.relation ?? '');
    setPhone(contact?.phone ?? '');
    setIsEditing(!contact);
  }, [contact]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    onSaveContact({
      name: name.trim(),
      relation: relation.trim() || 'Familiar / Confianza',
      phone: phone.trim(),
    });
    setIsEditing(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <PhoneCall className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Contacto de emergencia
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Persona de confianza para {profileName} si alguna medición requiere ayuda.
              </p>
            </div>
          </div>
        </div>

        {!isEditing && contact ? (
          <div className="space-y-5">
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-teal-700 dark:text-teal-400">
                <UserCheck className="w-4 h-4" />
                <span>Contacto guardado</span>
              </div>
              <div className="space-y-1">
                <div className="text-xl font-bold text-slate-900 dark:text-white">
                  {contact.name}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  {contact.relation} ·{' '}
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {contact.phone}
                  </span>
                </div>
              </div>
            </div>

            {latestValueMgDl !== null && (
              <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
                  Si llamas ahora, puedes indicar que tu última medición fue de{' '}
                  <strong className="font-mono tabular-nums">
                    {formatGlucoseValue(latestValueMgDl, unit)} {unit}
                  </strong>
                  .
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onRequestCall(contact)}
                className="min-h-[52px] px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-base font-semibold transition-colors flex items-center justify-center gap-2.5"
              >
                <Phone className="w-5 h-5" />
                <span>Llamar a {contact.name.split(' ')[0]}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="min-h-[52px] px-5 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-base font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
              >
                <Edit3 className="w-4 h-4" />
                <span>Cambiar contacto</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="emergency-name"
                className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
              >
                Nombre de la persona de confianza
              </label>
              <input
                id="emergency-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Laura Vargas o Dr. Morales"
                className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="emergency-relation"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
                >
                  Relación con el paciente
                </label>
                <input
                  id="emergency-relation"
                  type="text"
                  value={relation}
                  onChange={(e) => setRelation(e.target.value)}
                  placeholder="Ej. Esposa, Hijo, Médico"
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="emergency-phone"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
                >
                  Número de teléfono
                </label>
                <input
                  id="emergency-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej. +57 300 412 8890"
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                className="flex-1 min-h-[50px] px-5 py-3 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white text-base font-semibold transition-colors"
              >
                Guardar contacto de emergencia
              </button>
              {contact && (
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="min-h-[50px] px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
                >
                  <X className="w-4 h-4" />
                  <span>Cancelar</span>
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
