// ============================================================
// CLINIFLOW - SOFIA REPORTS
// api/sofia-report.js
// Sofia consulta Supabase con lenguaje natural y responde
// Ejemplos:
//   "¿Cuántas citas tenemos mañana?"
//   "Dame el resumen de esta semana"
//   "¿Cuál es el tratamiento más pedido?"
//   "¿Cuánto hemos facturado este mes?"
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const { requireClinicUser } = require("../lib/auth");

const HDR = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: "Bearer " + SUPABASE_SERVICE_KEY,
  "Content-Type": "application/json",
};

async function sbGet(path) {
  const r = await fetch(SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path, { headers: HDR });
  const text = await r.text();
  if (!r.ok) throw new Error(r.status + ": " + text.substring(0, 100));
  return text ? JSON.parse(text) : [];
}

async function getClinicSnapshot(clinicId) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const monthStart = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-01";
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const [appts, pending, leads, treats] = await Promise.all([
    sbGet("appointments?select=*&clinic_id=eq." + clinicId + "&status=eq.confirmed"),
    sbGet("pending_bookings?select=*&clinic_id=eq." + clinicId + "&status=eq.pending"),
    sbGet("leads?select=*&clinic_id=eq." + clinicId),
    sbGet("treatments?select=name,price&clinic_id=eq." + clinicId + "&active=eq.true"),
  ]);

  // Calcular métricas
  const todayAppts  = appts.filter(a => (a.appointment_date || "").slice(0, 10) === todayStr);
  const tmrwAppts   = appts.filter(a => (a.appointment_date || "").slice(0, 10) === tomorrowStr);
  const weekAppts   = appts.filter(a => (a.appointment_date || "") >= weekAgo.toISOString().slice(0, 10));
  const monthAppts  = appts.filter(a => (a.appointment_date || "") >= monthStart);

  const monthRev  = monthAppts.reduce((s, a) => s + (parseFloat(a.price) || 0), 0);
  const weekRev   = weekAppts.reduce((s, a)  => s + (parseFloat(a.price) || 0), 0);
  const todayRev  = todayAppts.reduce((s, a) => s + (parseFloat(a.price) || 0), 0);

  // Tratamiento más pedido
  const treatCount = {};
  appts.forEach(a => { if (a.treatment) treatCount[a.treatment] = (treatCount[a.treatment] || 0) + 1; });
  const topTreatment = Object.entries(treatCount).sort((a, b) => b[1] - a[1])[0];

  // Nuevos leads esta semana
  const newLeads = leads.filter(l => (l.created_at || "") >= weekAgo.toISOString());

  return {
    fecha_hoy: todayStr,
    citas_hoy: todayAppts.length,
    citas_manana: tmrwAppts.length,
    citas_semana: weekAppts.length,
    citas_mes: monthAppts.length,
    citas_total: appts.length,
    ingresos_hoy: todayRev,
    ingresos_semana: weekRev,
    ingresos_mes: monthRev,
    pendientes_confirmar: pending.length,
    leads_total: leads.length,
    leads_nuevos_semana: newLeads.length,
    leads_calificados: leads.filter(l => l.status === "calificado").length,
    tratamiento_top: topTreatment ? topTreatment[0] + " (" + topTreatment[1] + " veces)" : "sin datos",
    tratamientos_ofrecidos: treats.length,
    citas_manana_lista: tmrwAppts.map(a => a.patient_name + " " + (a.treatment || "—") + " " + (a.start_time ? new Date(a.start_time).toLocaleTimeString("es", {hour:"2-digit",minute:"2-digit"}) : "")).join("; "),
    citas_hoy_lista: todayAppts.map(a => a.patient_name + " " + (a.treatment || "—") + " " + (a.start_time ? new Date(a.start_time).toLocaleTimeString("es", {hour:"2-digit",minute:"2-digit"}) : "")).join("; "),
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: "question requerida" });

  let clinic_id;
  try {
    clinic_id = (await requireClinicUser(req.headers.authorization, ["owner", "admin"])).clinic_id;
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  try {
    // 1. Obtener snapshot real de la clínica
    const snapshot = await getClinicSnapshot(clinic_id);

    // 2. Construir contexto para Sofia
    const systemPrompt = `Eres Sofía, asistente inteligente de clínica dental con acceso a datos reales en tiempo real.

DATOS ACTUALES DE LA CLÍNICA (${snapshot.fecha_hoy}):
━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 CITAS:
  • Hoy: ${snapshot.citas_hoy} citas${snapshot.citas_hoy_lista ? " — " + snapshot.citas_hoy_lista : ""}
  • Mañana: ${snapshot.citas_manana} citas${snapshot.citas_manana_lista ? " — " + snapshot.citas_manana_lista : ""}
  • Esta semana: ${snapshot.citas_semana} citas
  • Este mes: ${snapshot.citas_mes} citas
  • Total histórico: ${snapshot.citas_total} citas

💰 INGRESOS:
  • Hoy: €${snapshot.ingresos_hoy.toFixed(0)}
  • Esta semana: €${snapshot.ingresos_semana.toFixed(0)}
  • Este mes: €${snapshot.ingresos_mes.toFixed(0)}

📋 RESERVAS PENDIENTES: ${snapshot.pendientes_confirmar} esperando confirmación

🎯 LEADS:
  • Total: ${snapshot.leads_total}
  • Nuevos esta semana: ${snapshot.leads_nuevos_semana}
  • Calificados: ${snapshot.leads_calificados}

🏆 TRATAMIENTO MÁS PEDIDO: ${snapshot.tratamiento_top}
━━━━━━━━━━━━━━━━━━━━━━━━━━

INSTRUCCIONES:
- Responde en el idioma de la pregunta.
- Usa los datos de arriba para responder con precisión.
- Sé conciso, profesional y directo.
- Si preguntan algo que no está en los datos, dilo claramente.
- Usa emojis con moderación para hacer las respuestas más legibles.`;

    // 3. Llamar a Claude con la pregunta
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: question }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: "AI error", detail: err.substring(0, 200) });
    }

    const data = await response.json();
    const answer = data.content?.[0]?.text || "No pude procesar tu pregunta.";

    return res.status(200).json({
      answer,
      snapshot, // devolver también los datos crudos por si el frontend los necesita
    });

  } catch (error) {
    console.error("sofia-report error:", error.message);
    return res.status(500).json({ error: error.message });
  }
};
