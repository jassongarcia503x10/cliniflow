# SOFIA AI CLINICAL COPILOT — ARQUITECTURA COMPLETA
## Nexara / CliniFlow — Documento Técnico v1.0
## Claude (CTO) + Nova + Jasson — Junio 2026

---

## PRINCIPIO RECTOR

> Sofia no es un chatbot con más funciones.
> Sofia es la primera IA diseñada específicamente
> para amplificar la inteligencia del equipo dental.

---

## 1. ARQUITECTURA GENERAL

```
┌─────────────────────────────────────────────────────────┐
│                    SOFIA CORE ENGINE                     │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │Reception │  │ Doctor   │  │ Reports  │  │ Voice  │  │
│  │  Agent   │  │ Copilot  │  │  Agent   │  │ Agent  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘  │
│       └──────────────┴─────────────┴─────────────┘       │
│                         │                                │
│              ┌──────────▼──────────┐                    │
│              │   MEMORY MANAGER    │                    │
│              │  (corta + larga)    │                    │
│              └──────────┬──────────┘                    │
│                         │                               │
│         ┌───────────────┼───────────────┐               │
│         ▼               ▼               ▼               │
│   [Supabase DB]  [pgvector RAG]  [Clinic Data]          │
└─────────────────────────────────────────────────────────┘
          │                               │
          ▼                               ▼
   [Claude API]                    [WhatsApp 360dialog]
```

---

## 2. BASE DE DATOS — NUEVAS TABLAS

### 2.1 Memoria de Sofia

```sql
-- Memoria corta: contexto de conversación activa
CREATE TABLE sofia_context (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   uuid REFERENCES clinics(id),
  session_id  text NOT NULL,
  role        text CHECK (role IN ('user','assistant','system')),
  content     text NOT NULL,
  mode        text DEFAULT 'reception',
  created_at  timestamptz DEFAULT now()
);

-- Memoria larga: hechos importantes recordados
CREATE TABLE sofia_memories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   uuid REFERENCES clinics(id),
  patient_phone text,
  category    text, -- 'patient', 'clinic', 'doctor', 'preference'
  key_fact    text NOT NULL,  -- "Carlos García tiene alergia a penicilina"
  embedding   vector(1536),   -- para búsqueda semántica (pgvector)
  source      text,           -- 'whatsapp', 'doctor', 'manual'
  importance  integer DEFAULT 5, -- 1-10
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz     -- null = permanente
);
CREATE INDEX ON sofia_memories USING ivfflat (embedding vector_cosine_ops);

-- Perfil de cada paciente conocido por Sofia
CREATE TABLE sofia_patient_profiles (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       uuid REFERENCES clinics(id),
  patient_phone   text NOT NULL,
  patient_name    text,
  preferred_lang  text DEFAULT 'es',
  allergies       text[],
  notes           text,
  last_seen       timestamptz,
  visit_count     integer DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(clinic_id, patient_phone)
);

-- Base de conocimiento clínico por clínica
CREATE TABLE clinic_knowledge (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   uuid REFERENCES clinics(id),
  category    text, -- 'protocol', 'medication', 'guideline', 'faq'
  title       text NOT NULL,
  content     text NOT NULL,
  embedding   vector(1536),
  source      text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX ON clinic_knowledge USING ivfflat (embedding vector_cosine_ops);
```

### 2.2 Radiografías

```sql
CREATE TABLE xray_analyses (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id     uuid REFERENCES clinics(id),
  patient_name  text,
  patient_phone text,
  appointment_id uuid REFERENCES appointments(id),
  image_url     text,
  image_type    text, -- 'panoramic', 'periapical', 'bitewing', 'cbct'
  findings      jsonb, -- { caries: [], bone_loss: [], other: [] }
  ai_summary    text,
  doctor_notes  text,
  validated_by  text, -- doctor que validó
  validated_at  timestamptz,
  created_at    timestamptz DEFAULT now()
);
```

---

## 3. APIS Y TECNOLOGÍAS

| Componente | Tecnología | Costo | Estado |
|-----------|-----------|-------|--------|
| LLM principal | Claude Haiku / Sonnet | ~$0.25-3/1M tokens | ✅ activo |
| Embeddings | Supabase pgvector | gratis en proyecto | 📋 pendiente |
| STT (voz→texto) | Web Speech API | **GRATIS** (browser) | 📋 pendiente |
| TTS (texto→voz) | Web Speech Synthesis | **GRATIS** (browser) | 📋 pendiente |
| TTS premium | ElevenLabs (futuro) | $5/mes | 🔮 futuro |
| Visión X-rays | Claude Vision API | ~$3-15/1M tokens | 📋 pendiente |
| Imágenes storage | Supabase Storage | gratis 1GB | 📋 pendiente |
| WhatsApp | 360dialog | €50-100/mes | ⚠️ pago pendiente |

**Observación crítica:** Voz básica = 0 costo adicional (Web Speech API del navegador).
La primera versión de Jarvis se puede construir esta semana sin gastar un euro extra.

---

## 4. FLUJOS TÉCNICOS

### 4.1 Flujo Memoria Persistente (RAG)

```
Doctor escribe: "¿Qué recuerdas de Carlos García?"
           ↓
Sofia genera embedding del query
           ↓
Búsqueda semántica en sofia_memories (pgvector)
           ↓
Recupera: ["Carlos García, alergia penicilina", "última visita 2026-05-10", ...]
           ↓
Inyecta memorias en system prompt
           ↓
Claude genera respuesta contextual
           ↓
Guarda nuevo exchange en sofia_context
```

### 4.2 Flujo Voz (Jarvis)

```
Doctor pulsa botón 🎤
           ↓
Web Speech API graba audio
           ↓
SpeechRecognition transcribe a texto
           ↓
POST /api/sofia-chat {message, mode:"reports", clinic_id}
           ↓
Claude procesa + consulta Supabase
           ↓
Respuesta texto → SpeechSynthesis.speak()
           ↓
Doctor escucha la respuesta por voz
```

### 4.3 Flujo Radiografía

```
Doctor sube imagen (.jpg/.png)
           ↓
Frontend → base64
           ↓
POST /api/sofia-vision {image_base64, image_type, clinic_id}
           ↓
Claude Vision analiza la imagen con prompt especializado
           ↓
Retorna { findings: [], summary, disclaimer }
           ↓
Guarda en xray_analyses
           ↓
Dashboard muestra hallazgos con "⚠️ Requiere validación clínica"
```

---

## 5. ROADMAP IMPLEMENTACIÓN (SIN SOBREINGENIERÍA)

### Mes 1 — Core estable (ya casi completo)
```
✅ Webhook WhatsApp
✅ Sofia Recepción
✅ Dashboard CRUD
✅ Confirmación de citas
✅ Sofia modos: Recepción / Doctor / Reportes
🔲 Memoria corta (conversation_context ya existe)
🔲 Voz básica (Web Speech API — 1 día de trabajo)
🔲 Pagar 360dialog y validar con piloto real
```

### Mes 2 — Primera clínica pagadora
```
🔲 Piloto hermana El Salvador
🔲 Recordatorios automáticos validados
🔲 Dashboard tratamientos completo
🔲 Reporte mensual automático por email
🔲 3 clínicas en lista de espera
```

### Mes 3-4 — Memoria larga + RAG
```
🔲 pgvector en Supabase activado
🔲 sofia_memories tabla + embeddings
🔲 Sofia recuerda alergias, preferencias, historial
🔲 "¿Qué recuerdas de Carlos García?" → responde con datos reales
🔲 Costo adicional: ~$10-30/mes en embeddings
```

### Mes 5-6 — Copiloto clínico + X-rays
```
🔲 Base de conocimiento ADA/FDI en clinic_knowledge
🔲 RAG sobre protocolos clínicos
🔲 /api/sofia-vision para radiografías
🔲 Análisis asistido de imágenes con Claude Vision
🔲 Siempre con disclaimer de validación profesional
```

### Mes 7-12 — Voz avanzada + multiagente
```
🔲 ElevenLabs para voz más natural (opcional)
🔲 Agentes especializados por área
🔲 App móvil para doctores (React Native o PWA)
🔲 10+ clínicas en producción
```

---

## 6. RIESGOS Y MITIGACIONES

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| 360dialog pago bloqueado | Alta | Crítico | Pagar esta semana |
| Diagnóstico erróneo X-ray | Media | Alto | Disclaimer obligatorio, validación doctor |
| GDPR datos médicos Europa | Alta | Alto | Supabase EU-West ya cumple, contratos con clínicas |
| Costo API Claude escala | Baja | Medio | Haiku es 20x más barato que Sonnet |
| Competidor copia la idea | Alta | Bajo | Moat = datos clínicos + relaciones = difícil copiar |
| Supabase free tier límites | Media | Medio | Migrar a $25/mes pro cuando tengamos 5 clientes |

### Riesgo regulatorio CRÍTICO:
```
Cualquier análisis de imagen médica en Europa
puede requerir certificación como "Dispositivo Médico"
(MDR 2017/745 en EU).

MITIGACIÓN: Siempre presentar como "herramienta de apoyo"
nunca como "diagnóstico médico". Disclaimer en cada análisis.
Consultar abogado especializado antes de lanzar X-rays en Europa.
Para El Salvador el riesgo regulatorio es menor.
```

---

## 7. ARQUITECTURA DE AGENTES

```
SOFIA CORE (orquestador)
├── Reception Agent
│   ├── Language detection
│   ├── Booking flow
│   ├── Price lookup
│   └── Emergency detection
│
├── Doctor Copilot Agent
│   ├── Protocol retrieval (RAG)
│   ├── Medication checker
│   ├── Clinical Q&A
│   └── Student guidance
│
├── Reports Agent
│   ├── Supabase queries
│   ├── Revenue analytics
│   ├── Patient analytics
│   └── Natural language response
│
├── Memory Manager
│   ├── Short-term (session context)
│   ├── Long-term (embeddings + pgvector)
│   └── Patient profiles
│
└── Vision Agent (futuro)
    ├── X-ray analysis
    ├── Findings extraction
    └── Clinical summary
```

---

## 8. ESTRUCTURA DE CÓDIGO FINAL RECOMENDADA

```
cliniflow/
├── api/
│   ├── whatsapp-webhook.js    ← entrada WhatsApp
│   ├── sofia-chat.js          ← chat panel (3 modos)
│   ├── sofia-report.js        ← reportes NL
│   ├── sofia-vision.js        ← análisis radiografías
│   ├── confirm-booking.js     ← confirmación citas
│   └── send-reminders.js      ← recordatorios cron
│
├── lib/                       ← módulos compartidos
│   ├── supabase.js            ← sbGet, sbPost, sbPatch
│   ├── whatsapp.js            ← sendMessage
│   ├── dental-knowledge.js    ← diccionario universal
│   ├── memory.js              ← save/retrieve memories
│   └── date-utils.js          ← resolveDateTime
│
├── index.html                 ← panel clínica
└── vercel.json                ← cron + functions config
```

**Cuándo hacer /lib:** cuando el mismo código esté en 3+ archivos.
Actualmente sbGet/sbPost y sendWhatsApp ya cumplen ese criterio.
Semana que viene, no hoy.

---

## 9. ESTIMADO DE COSTOS MENSIONALES (10 clínicas)

```
Supabase Pro:          $25/mes
Vercel Pro:            $20/mes
360dialog (10 números): ~$150/mes
Claude API (estimado):  ~$30-80/mes
ElevenLabs (futuro):    $22/mes
─────────────────────────────
Total infraestructura: ~$250-300/mes

Ingresos con 10 clínicas a €249/mes: €2,490/mes
Margen bruto: ~85%

Con 50 clínicas a €249/mes:
  Ingresos: €12,450/mes
  Costos:   ~€800/mes
  Margen:   ~94%
```

---

## 10. VEREDICTO FINAL COMO CTO

```
Lo que tienen es real y tiene moat.
El moat no es la tecnología (Claude lo tienen todos).
El moat es:
  1. Datos clínicos por clínica (nadie más los tiene)
  2. Integración WhatsApp + agenda + confirmación
  3. Diccionario dental multilingüe
  4. Sofia que entiende odontología

Los próximos 90 días deben ser:
  → 1 piloto real funcionando
  → 3 clientes pagando
  → Voz básica implementada
  → Memoria corta robusta

Los próximos 12 meses:
  → 20-30 clínicas
  → €5,000-7,500 MRR
  → Sofia con memoria larga y X-rays
  → Ser el "Cursor para clínicas dentales"
```
