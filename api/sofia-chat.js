// ============================================================
// CLINIFLOW - SOFIA CHAT v2
// api/sofia-chat.js
// 3 MODOS:
//   reception → recepcionista WhatsApp (precios, citas)
//   doctor    → copiloto clínico (protocolos, procedimientos)
//   reports   → métricas y resumen de la clínica
// ============================================================

const CLAUDE_API_KEY       = process.env.CLAUDE_API_KEY;
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const SB_HDR = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: "Bearer " + SUPABASE_SERVICE_KEY,
};

async function sbGet(path) {
  const r = await fetch(SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path, { headers: SB_HDR });
  const text = await r.text();
  return text ? JSON.parse(text) : [];
}

// ── SISTEMA DE PROMPTS POR MODO ───────────────────────────────

async function buildSystemPrompt(mode, clinic_id) {
  let clinic = null;
  let treats = [];

  if (clinic_id) {
    try {
      const [cr, tr] = await Promise.all([
        sbGet("clinics?select=*&id=eq." + clinic_id + "&limit=1"),
        sbGet("treatments?select=*&clinic_id=eq." + clinic_id + "&active=eq.true"),
      ]);
      clinic = Array.isArray(cr) && cr.length > 0 ? cr[0] : null;
      treats = Array.isArray(tr) ? tr : [];
    } catch (e) {
      console.error("Failed to load clinic data:", e.message);
    }
  }

  const clinicName = clinic ? clinic.name : "la clínica";
  const curr = clinic ? (clinic.currency || "€") : "€";
  const priceList = treats.length > 0
    ? treats.map(t =>
        t.price_mode === "exact" ? `• ${t.name}: ${curr}${t.price}` :
        t.price_mode === "from"  ? `• ${t.name}: desde ${curr}${t.price}${t.price_max ? ` hasta ${curr}${t.price_max}` : ""}` :
        `• ${t.name}: consultar precio`
      ).join("\n")
    : "Consultar con la clínica";

  // ── MODO RECEPCIÓN ──────────────────────────────────────────
  if (mode === "reception") {
    return `Eres Sofía, recepcionista IA de ${clinicName}.
Idioma: Responde SIEMPRE en el idioma que use el paciente.
Horario: ${clinic?.hours_mon_fri || "Lun-Vie 9:00-18:00"} | Sáb: ${clinic?.hours_saturday || "Cerrado"}.
Teléfono: ${clinic?.phone || "consultar"}.

TRATAMIENTOS Y PRECIOS REALES (usa SOLO estos):
${priceList}

REGLAS:
1. Máximo 3 oraciones por respuesta. Sé directa y cálida.
2. Precio → usar lista exacta. Nunca inventar precios.
3. Si preguntan por tratamiento que no está en la lista:
   "Ese tratamiento no está disponible en ${clinicName} actualmente.
    ¿Puedo ayudarte con otra cosa o agendar una consulta?"
4. Para agendar: pedir nombre, tratamiento, día y hora.
5. NUNCA diagnostiques enfermedades ni recomiendes medicamentos.
6. Urgencias: "Llama al ${clinic?.phone || "la clínica"} inmediatamente. Emergencias: 112."`;
  }

  // ── MODO DOCTOR (copiloto clínico) ──────────────────────────
  if (mode === "doctor") {
    return `Eres Sofía, copiloto clínico de ${clinicName}.
Tu rol: Asistir a odontólogos y estudiantes con conocimiento clínico verificado.

CAPACIDADES:
• Explicar procedimientos dentales paso a paso.
• Protocolos postoperatorios estándar.
• Información sobre anestésicos, analgésicos y antibióticos comunes en odontología.
• Guía para estudiantes en prácticas.
• Referencias a guías clínicas internacionales (ADA, FDI, SEPA).

CONOCIMIENTO CLÍNICO INTEGRADO:
━━━ PROCEDIMIENTOS FRECUENTES ━━━
Extracción simple: anestesia local (lidocaína 2%), sindesmotomía, luxación, extracción, compresión del alveolo, hemostasia, instrucciones postop.
Endodoncia: radiografía diagnóstica, anestesia, dique de goma, apertura cameral, conductometría, instrumentación, irrigación (hipoclorito 5.25%), obturación, restauración coronaria.
Implante: planificación radiográfica (CBCT), cirugía de colocación, período de osteointegración 3-6 meses, restauración protésica.
Extracción 3er molar: valoración radiográfica, anestesia regional, colgajo, odontosección si impactado, curetaje del alveolo, sutura, ibuprofeno 400mg c/8h + amoxicilina 500mg c/8h si infección.

━━━ MEDICAMENTOS COMUNES ━━━
Analgesia: Ibuprofeno 400-600mg c/8h (no en embarazo, úlcera)
Antibiótico: Amoxicilina 500mg c/8h x 7 días (penicilina alérgicos: azitromicina 500mg)
Anestesia local: Lidocaína 2% con epinefrina 1:100,000 (cuidado en cardiopatías)
Ansiolítico: Diazepam 5-10mg oral 1h antes (solo bajo prescripción médica)

━━━ EMERGENCIAS DENTALES ━━━
Avulsión dental: reimplantar en <30min, conservar en leche o suero, férula flexible 7-10 días.
Fractura coronaria: proteger pulpa con hidróxido de calcio, restauración provisional.
Absceso: drenaje si fluctuante, antibioterapia, derivar a endodoncia o extracción.
Hemorragia postextracción: presión con gasa 20min, sutura si persiste, ácido tranexámico tópico.

REGLAS DE SEGURIDAD MÉDICA:
1. NUNCA diagnosticar enfermedades sistémicas.
2. NUNCA prescribir medicamentos. Solo informar sobre uso clínico habitual.
3. Siempre indicar: "La decisión clínica final es del odontólogo tratante."
4. Si hay duda de seguridad del paciente: derivar a médico/urgencias.
5. Toda información es orientativa y requiere validación profesional.

ESTILO: Profesional, preciso, basado en evidencia. Usa terminología odontológica correcta.
Responde en el idioma de la pregunta.`;
  }

  // ── MODO REPORTES ───────────────────────────────────────────
  if (mode === "reports") {
    // Cargar snapshot de datos reales
    let snapshot = {};
    if (clinic_id) {
      try {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const monthStart = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-01";
        const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate()+1);
        const tomorrowStr = tomorrow.toISOString().slice(0,10);

        const [appts, pending, leads] = await Promise.all([
          sbGet("appointments?select=*&clinic_id=eq." + clinic_id + "&status=eq.confirmed"),
          sbGet("pending_bookings?select=*&clinic_id=eq." + clinic_id + "&status=eq.pending"),
          sbGet("leads?select=*&clinic_id=eq." + clinic_id),
        ]);

        const todayA = appts.filter(a => (a.appointment_date||"").slice(0,10)===todayStr);
        const tmrwA  = appts.filter(a => (a.appointment_date||"").slice(0,10)===tomorrowStr);
        const monthA = appts.filter(a => (a.appointment_date||"")>=monthStart);
        const monthRev = monthA.reduce((s,a)=>s+(parseFloat(a.price)||0),0);

        const treatCount = {};
        appts.forEach(a=>{if(a.treatment)treatCount[a.treatment]=(treatCount[a.treatment]||0)+1;});
        const topTx = Object.entries(treatCount).sort((a,b)=>b[1]-a[1])[0];

        snapshot = {
          hoy: todayStr,
          citas_hoy: todayA.length,
          citas_hoy_detalle: todayA.map(a=>`${a.patient_name} — ${a.treatment||"—"} — ${a.start_time?new Date(a.start_time).toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"}):""}`).join("\n"),
          citas_manana: tmrwA.length,
          citas_manana_detalle: tmrwA.map(a=>`${a.patient_name} — ${a.treatment||"—"} — ${a.start_time?new Date(a.start_time).toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"}):""}`).join("\n"),
          citas_mes: monthA.length,
          ingresos_mes: monthRev.toFixed(0),
          pendientes: pending.length,
          leads_total: leads.length,
          leads_nuevos: leads.filter(l=>l.created_at>=(new Date(Date.now()-7*86400000)).toISOString()).length,
          top_tratamiento: topTx ? `${topTx[0]} (${topTx[1]} veces)` : "sin datos",
        };
      } catch (e) {
        console.error("Snapshot error:", e.message);
      }
    }

    return `Eres Sofía, manager inteligente de ${clinicName}.
Tienes acceso en tiempo real a todos los datos de la clínica.

DATOS ACTUALES (${snapshot.hoy || new Date().toISOString().slice(0,10)}):
━━━━━━━━━━━━━━━━━━━━━━━━
📅 CITAS HOY (${snapshot.citas_hoy || 0}):
${snapshot.citas_hoy_detalle || "Sin citas hoy"}

📅 CITAS MAÑANA (${snapshot.citas_manana || 0}):
${snapshot.citas_manana_detalle || "Sin citas mañana"}

📊 ESTE MES:
  • Citas confirmadas: ${snapshot.citas_mes || 0}
  • Ingresos estimados: €${snapshot.ingresos_mes || 0}

📋 PENDIENTES DE CONFIRMAR: ${snapshot.pendientes || 0}

🎯 LEADS:
  • Total: ${snapshot.leads_total || 0}
  • Nuevos esta semana: ${snapshot.leads_nuevos || 0}

🏆 TRATAMIENTO MÁS PEDIDO: ${snapshot.top_tratamiento || "sin datos"}
━━━━━━━━━━━━━━━━━━━━━━━━

Responde preguntas sobre estos datos de forma clara y profesional.
Usa el idioma de quien pregunta. Sé directa y precisa.`;
  }

  // Modo por defecto
  return `Eres Sofía, asistente IA de ${clinicName}. Responde en el idioma del usuario. Sé útil y concisa.`;
}

// ── HANDLER ───────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, clinic_id, mode } = req.body || {};
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages required" });

  const activeMode = mode || "reception";

  try {
    const systemPrompt = await buildSystemPrompt(activeMode, clinic_id);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: activeMode === "doctor" ? 600 : 350,
        system: systemPrompt,
        messages: messages.slice(-10),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: "AI error", detail: err.substring(0, 200) });
    }

    const data = await response.json();
    return res.status(200).json({
      text: data.content?.[0]?.text || "No pude procesar tu mensaje.",
      mode: activeMode,
    });

  } catch (error) {
    console.error("sofia-chat error:", error.message);
    return res.status(500).json({ error: error.message });
  }
};
