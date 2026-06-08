# SPRINT 4 — ARQUITECTURA CLINIFLOW / NEXARA
## Documento de Diseño Técnico v1.0

---

## 1. DIAGNÓSTICO DEL SISTEMA ACTUAL

```
TABLAS EXISTENTES:          GAPS IDENTIFICADOS:
✅ clinics                  ❌ appointments sin status machine clínico
✅ clinic_users             ❌ no hay doble-reserva prevention
✅ doctors                  ❌ reservas (pending_bookings) no conectan con appointments
✅ treatments               ❌ Sofia copilot sin acceso a datos reales
✅ patients                 ❌ timeline clínico por paciente inexistente
✅ patient_notes            ❌ dashboard sin métricas de citas
✅ clinical_records
✅ pending_bookings
✅ sofia_memories
```

---

## 2. ARQUITECTURA NEXARA — VISIÓN PLATAFORMA

```
ABSTRACCIÓN GENÉRICA (futuro):
┌──────────────────────────────────────────────────────┐
│                  NEXARA PLATFORM                     │
│                                                      │
│  CliniFlow   PetFlow   HotelFlow   LawFlow           │
│     ↓           ↓         ↓          ↓              │
│  PATRÓN COMÚN:                                       │
│  tenant → entity → provider → service → booking     │
│  clinica   paciente  doctor    tratamiento  cita     │
│  hotel     huésped   habitac.  servicio     reserva  │
│  bufete    cliente   abogado   consulta     sesión   │
└──────────────────────────────────────────────────────┘

HOY (Sprint 4): implementamos el patrón para CliniFlow.
Los nombres de tablas y APIs usarán prefijo neutro donde
sea posible para facilitar la migración futura.
```

---

## 3. SISTEMA DE ESTADOS CLÍNICOS

```
FLUJO COMPLETO:

pending ──→ confirmed ──→ checked_in ──→ in_chair ──→ completed
    │            │              │             │
    └── cancelled              └── no_show   └── cancelled

ESTADO         QUIÉN LO ACTIVA              POR QUÉ EXISTE
─────────────────────────────────────────────────────────
pending        Paciente/WhatsApp/Sofia      Solicitud no confirmada.
               Recepcionista manual         Necesaria para el flujo de aprobación.

confirmed      Recepcionista               La clínica confirmó. Paciente notificado.
               confirm-booking API         Punto de conversión lead→cita.

checked_in     Recepcionista               Paciente llegó. Mide puntualidad/no-shows.
               Self check-in futuro        Base para métricas de tiempo en sala.

in_chair       Doctor                      Tratamiento iniciado. Cronómetro activado.
                                           Auditoría clínica. No se puede cancelar ya.

completed      Doctor / Sistema            Tratamiento finalizado. Cierra el ciclo.
                                           Trigger: pago, historial, próxima cita.

cancelled      Cualquier rol               Liberación de slot. Motivo requerido.
                                           Métricas de cancelación.

no_show        Sistema (cron) / Recep.     Paciente no se presentó. Impacto en revenue.
                                           Trigger: recordatorio / penalización futura.
```

---

## 4. PREVENCIÓN DE DOBLE RESERVA

```
ALGORITMO: Detección de solapamiento de intervalos

Cita existente: [start1, end1)
Cita nueva:     [start2, end2)

Solapan si:  start1 < end2  AND  end1 > start2

IMPLEMENTACIÓN EN API (NUNCA EN FRONTEND):

SELECT id FROM appointments
WHERE clinic_id = {clinic_id}
  AND doctor_id = {doctor_id}
  AND status NOT IN ('cancelled', 'no_show')
  AND start_time < {new_end_time}    ← existente empieza antes de que termine la nueva
  AND end_time   > {new_start_time}  ← existente termina después de que empiece la nueva
  AND id != {appointment_id}         ← excluir la cita actual en edición

Si retorna filas → RECHAZAR con 409 Conflict.

CASOS QUE CUBRE:
  ✅ Solapamiento parcial al inicio
  ✅ Solapamiento parcial al final
  ✅ Nueva cita contiene a la existente
  ✅ Existente contiene a la nueva
  ✅ Citas idénticas
  ✅ No bloquea al editar la misma cita

ÍNDICE NECESARIO:
  CREATE INDEX ON appointments(clinic_id, doctor_id, start_time, end_time)
  WHERE status NOT IN ('cancelled', 'no_show');
```

---

## 5. ARQUITECTURA RESERVAS vs CITAS

```
FLUJO COMPLETO WhatsApp → Cita oficial:

PACIENTE                    SOFIA               PANEL           BD
───────                    ──────              ──────          ──
"Quiero cita viernes"  →   Extrae intent   →  pending_bookings
                           Confirma datos
                           "¿A qué hora?"
"A las 10"             →   Guarda todo    →   pending_bookings
                                               status=pending

                                          →   Recepcionista ve
                                               la solicitud

                                               [Aceptar] ──── →  appointments (confirmed)
                                               [Rechazar] ─── →  pending_bookings (rejected)
                                               [Reprog.] ─── →  pending_bookings (rescheduled)
                                                              →  Sofia notifica al paciente

TABLAS:
  pending_bookings: solicitudes crudas de WhatsApp
  appointments:     citas oficiales confirmadas

NO son lo mismo. No duplicar.
pending_bookings = inbox de solicitudes
appointments     = agenda oficial
```

---

## 6. SOFIA — TRES MODOS DE OPERACIÓN

```
MODO RECEPTION (público, pacientes):
  Acceso: treatments, horarios, disponibilidad
  Crea: pending_bookings
  NO ve: historial clínico, notas, diagnósticos
  Prompt: "Eres recepcionista de {clinic}. Solo manejas citas y precios."

MODO COPILOT (interno, doctores):
  Acceso: patients, appointments del día, allergies, última nota
  Puede responder: "¿Quién sigue?", "Alergias de Juan"
  NO ve: financial data, datos de otros doctores
  Implementación:
    → API llama a Supabase con service key
    → Inyecta datos en system prompt
    → Claude responde con datos reales

MODO CEO (owner, métricas):
  Acceso: revenue, no-shows, conversiones, comparativas
  Puede responder: "Ingresos este mes", "Tasa de no-shows"
  NO ve: datos clínicos individuales (GDPR)
  Implementación:
    → Consultas agregadas únicamente
    → Nunca exponer registros individuales

SEGURIDAD ENTRE MODOS:
  El modo se determina en el BACKEND según el rol del usuario.
  El frontend solo envía el mensaje. El servidor elige el contexto.
```

---

## 7. TIMELINE CLÍNICO POR PACIENTE

```
TABLA: patient_timeline
  id, clinic_id, patient_id, event_type, description,
  reference_id, reference_table, actor_id, created_at

EVENTS:
  patient_created     → "Paciente registrado en CliniFlow"
  appointment_created → "Cita agendada: Limpieza - 15 Jun 10:00"
  appointment_confirmed→ "Cita confirmada"
  checked_in          → "Paciente llegó a la clínica"
  treatment_started   → "Inicio de tratamiento"
  treatment_completed → "Limpieza completada. Costo: €80"
  note_added          → "Dr. García: paciente muy ansioso"
  no_show             → "Paciente no se presentó"
  next_appointment    → "Próximo control: 15 Dic"

Sofia consulta así:
  "Historia de Juan García"
  → SELECT * FROM patient_timeline WHERE patient_id = X ORDER BY created_at
  → Inyectar en prompt como contexto
  → Claude narra el historial
```

---

## 8. ARQUITECTURA DE CARPETAS (Nexara-ready)

```
cliniflow/
├── api/                         ← Serverless functions (Vercel)
│   ├── appointments.js          ← CRUD + double-booking
│   ├── patients.js              ← CRUD + JWT auth
│   ├── sofia-chat.js            ← 3 modos: reception/copilot/ceo
│   ├── sofia-voice.js           ← STT + response
│   ├── sofia-report.js          ← Structured queries
│   ├── confirm-booking.js       ← pending → appointment
│   ├── send-reminders.js        ← Cron 48h/24h/2h
│   ├── create-clinic-onboarding.js
│   └── whatsapp-webhook.js
│
├── lib/                         ← Módulos compartidos (Sprint 5+)
│   ├── auth.js                  ← resolveClinic(jwt)
│   ├── supabase.js              ← service key client
│   ├── whatsapp.js              ← sendMessage
│   └── timeline.js              ← logEvent
│
├── index.html                   ← Shell
├── app.js                       ← React app (9 sections)
└── vercel.json                  ← Cron + functions config
```

---

## 9. RIESGOS Y MITIGACIONES

```
RIESGO                           PROBABILIDAD  MITIGACIÓN
─────────────────────────────────────────────────────────
Doble reserva por race condition  Media        Constraint UNIQUE + CHECK en BD
                                               (además del check en API)

Supabase free tier se pausa       Alta         Sofia WhatsApp hace ping constante
                                               Migrar a Pro ($25/mes) con 5 clientes

GDPR / datos médicos              Alta         No logs de contenido clínico
                                               Datos en EU (Supabase EU-West)
                                               DPA con cada clínica

Sofia responde info incorrecta    Media        Disclaimer en modo copilot
                                               "Siempre verificar con el expediente"

Overengineering antes de PMF      Alta (ya pasó) Implementar por orden de impacto
                                               Piloto primero, escalar después
```

---

## 10. ORDEN DE IMPLEMENTACIÓN SPRINT 4

```
DÍA 1 — BASE DE DATOS
  □ Ejecutar sprint4-sql.sql
  □ Verificar tablas en Supabase

DÍA 2 — API DE CITAS
  □ api/appointments.js (CRUD + double-booking)
  □ Probar con Hoppscotch

DÍA 3 — UI CITAS
  □ Tab Citas → crear/editar/cancelar
  □ Vista del día
  □ Selector paciente/doctor/tratamiento

DÍA 4 — SOFIA COPILOT
  □ Actualizar sofia-chat.js con modo copilot
  □ Queries a Supabase por appointment y patients
  □ Probar "¿Quién sigue?" con datos reales

DÍA 5 — RESERVAS → CITAS
  □ Actualizar confirm-booking para crear appointment con todos los campos
  □ Probar flujo WhatsApp → pending → appointment

OBJETIVO AL FINAL DEL SPRINT:
  Una clínica puede gestionar toda su agenda desde CliniFlow.
  Sofia responde preguntas del doctor con datos reales.
  Cero citas duplicadas.
```
